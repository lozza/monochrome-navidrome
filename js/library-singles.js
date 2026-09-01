import { createPlaceholder, trackDataStore } from './utils.js';
import { compareSinglesTitles, getSinglesAlphaKey } from './singles-alpha.js';

const SINGLES_CACHE_VERSION = 8;
const SINGLES_CACHE_TTL = 24 * 60 * 60 * 1000;
const SINGLES_CACHE_STALE_TTL = 7 * 24 * 60 * 60 * 1000;
const TRACK_SCAN_PAGE_SIZE = 1000;
const VIRTUAL_ROW_HEIGHT = 64;
const VIRTUAL_OVERSCAN = 12;
const MAX_RENDERED_ROWS = 80;
const PERSISTED_CACHE_TRACK_LIMIT = 1500;
const PERSISTED_CACHE_CHARACTER_LIMIT = 1_500_000;
const SINGLES_DB_NAME = 'navichrome-singles-cache';
const SINGLES_DB_VERSION = 1;
const SINGLES_STORE_NAME = 'catalogues';

export const SINGLES_PERFORMANCE_LIMITS = Object.freeze({
    scanPageSize: TRACK_SCAN_PAGE_SIZE,
    rowHeight: VIRTUAL_ROW_HEIGHT,
    virtualOverscan: VIRTUAL_OVERSCAN,
    maxRenderedRows: MAX_RENDERED_ROWS,
    persistedTrackLimit: PERSISTED_CACHE_TRACK_LIMIT,
    persistedCharacterLimit: PERSISTED_CACHE_CHARACTER_LIMIT,
    cacheStorage: 'indexeddb',
});

let refreshPromise = null;
let favoriteTrackIdsPromise = null;
let sessionCatalogue = null;

function getSinglesCacheKey(ui) {
    const api = ui?.api?.getAPI?.();
    const server = encodeURIComponent(String(api?.baseUrl || 'navidrome'));
    const username = encodeURIComponent(String(api?.username || ''));
    return `navichrome-singles-v${SINGLES_CACHE_VERSION}:${server}:${username}`;
}

function compactArtist(artist) {
    if (!artist) return null;
    return {
        id: String(artist.id || ''),
        name: artist.name || 'Unknown Artist',
        picture: artist.picture || null,
        type: artist.type || 'ARTIST',
    };
}

function compactArtworkReference(value) {
    const artwork = String(value || '');
    if (!artwork) return null;
    if (/^(?:https?:)?\/\//i.test(artwork) || /[?&](?:p|t|s|u|password|token|credential)=/i.test(artwork)) return null;
    return artwork;
}

export function compactTrackForCache(track) {
    const artist = compactArtist(track?.artist);
    const albumArtist = compactArtist(track?.album?.artist || track?.artist);
    const album = track?.album
        ? {
              id: String(track.album.id || ''),
              title: track.album.title || track.album.name || 'Unknown Album',
              name: track.album.name || track.album.title || 'Unknown Album',
              cover: compactArtworkReference(track.album.cover),
              releaseDate: track.album.releaseDate || null,
              artist: albumArtist,
          }
        : null;
    return {
        id: String(track?.id || ''),
        title: track?.title || 'Unknown Track',
        artist,
        artists: artist ? [artist] : [],
        album,
        duration: Number(track?.duration) || 0,
        trackNumber: Number(track?.trackNumber) || 0,
        volumeNumber: Number(track?.volumeNumber) || 1,
        streamStartDate: track?.streamStartDate || null,
        audioQuality: track?.audioQuality || null,
        audioModes: Array.isArray(track?.audioModes) ? [...track.audioModes] : ['STEREO'],
        replayGain: track?.replayGain ?? 0,
        peak: track?.peak ?? 1,
        albumReplayGain: track?.albumReplayGain ?? 0,
        albumPeakAmplitude: track?.albumPeakAmplitude ?? 1,
        coverArt: compactArtworkReference(track?.coverArt),
        suffix: track?.suffix || null,
        contentType: track?.contentType || null,
        bitRate: track?.bitRate ?? null,
        bitDepth: track?.bitDepth ?? null,
        samplingRate: track?.samplingRate ?? null,
        year: track?.year ?? null,
        isrc: track?.isrc || '',
        created: track?.created || null,
        played: track?.played || null,
        allowStreaming: true,
        isUnavailable: false,
        explicit: false,
        type: 'track',
    };
}

function openSinglesDb() {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (!settled) {
                settled = true;
                resolve(value);
            }
        };
        try {
            const request = indexedDB.open(SINGLES_DB_NAME, SINGLES_DB_VERSION);
            request.onupgradeneeded = () => {
                if (!request.result.objectStoreNames.contains(SINGLES_STORE_NAME))
                    request.result.createObjectStore(SINGLES_STORE_NAME, { keyPath: 'key' });
            };
            request.onsuccess = () => finish(request.result);
            request.onerror = () => finish(null);
            request.onblocked = () => finish(null);
        } catch {
            finish(null);
        }
    });
}

function readIndexedDb(key) {
    return openSinglesDb().then(
        (database) =>
            new Promise((resolve) => {
                if (!database) return resolve(null);
                try {
                    const request = database
                        .transaction(SINGLES_STORE_NAME, 'readonly')
                        .objectStore(SINGLES_STORE_NAME)
                        .get(key);
                    request.onsuccess = () => {
                        const value = request.result;
                        database.close();
                        resolve(value || null);
                    };
                    request.onerror = () => {
                        database.close();
                        resolve(null);
                    };
                } catch {
                    database.close();
                    resolve(null);
                }
            })
    );
}

function writeIndexedDb(key, tracks) {
    return openSinglesDb().then(
        (database) =>
            new Promise((resolve, reject) => {
                if (!database) return reject(new Error('IndexedDB unavailable'));
                try {
                    const transaction = database.transaction(SINGLES_STORE_NAME, 'readwrite');
                    transaction.objectStore(SINGLES_STORE_NAME).put({
                        key,
                        savedAt: Date.now(),
                        totalTracks: tracks.length,
                        complete: true,
                        tracks: tracks.map(compactTrackForCache),
                    });
                    transaction.oncomplete = () => {
                        database.close();
                        resolve();
                    };
                    transaction.onerror = () => {
                        database.close();
                        reject(transaction.error || new Error('IndexedDB write failed'));
                    };
                    transaction.onabort = () => {
                        database.close();
                        reject(transaction.error || new Error('IndexedDB write aborted'));
                    };
                } catch (error) {
                    database.close();
                    reject(error);
                }
            })
    );
}

function parseCachedValue(cached) {
    if (!Array.isArray(cached?.tracks) || !Number.isFinite(cached?.savedAt)) return null;
    const age = Math.max(0, Date.now() - cached.savedAt);
    if (age > SINGLES_CACHE_STALE_TTL) return null;
    return {
        tracks: cached.tracks,
        fresh: age <= SINGLES_CACHE_TTL,
        complete: cached.complete === true && cached.totalTracks === cached.tracks.length,
        totalTracks: Number(cached.totalTracks) || cached.tracks.length,
    };
}

async function readSinglesCache(ui) {
    const key = getSinglesCacheKey(ui);
    const indexed = parseCachedValue(await readIndexedDb(key));
    if (indexed) return indexed;
    try {
        const legacy = parseCachedValue(JSON.parse(localStorage.getItem(key) || 'null'));
        if (legacy) return legacy;
    } catch {
        /* unavailable legacy storage */
    }
    return null;
}

export function createPersistedSinglesCache(tracks, savedAt = Date.now()) {
    let cachedTracks = tracks.slice(0, PERSISTED_CACHE_TRACK_LIMIT).map(compactTrackForCache);
    let payload = {
        savedAt,
        totalTracks: tracks.length,
        complete: cachedTracks.length === tracks.length,
        tracks: cachedTracks,
    };
    let serialized = JSON.stringify(payload);
    while (serialized.length > PERSISTED_CACHE_CHARACTER_LIMIT && cachedTracks.length > 100) {
        cachedTracks = cachedTracks.slice(0, Math.max(100, Math.floor(cachedTracks.length * 0.8)));
        payload = { ...payload, complete: false, tracks: cachedTracks };
        serialized = JSON.stringify(payload);
    }
    return { payload, serialized };
}

function writeSinglesCache(ui, tracks) {
    const key = getSinglesCacheKey(ui);
    const write = async () => {
        try {
            await writeIndexedDb(key, tracks);
            return;
        } catch {
            /* use bounded fallback */
        }
        try {
            localStorage.setItem(key, createPersistedSinglesCache(tracks).serialized);
        } catch (error) {
            console.warn('Could not cache Singles:', error);
        }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => void write(), { timeout: 2000 });
    else setTimeout(() => void write(), 100);
}

export function dedupeAndSortTracks(tracks) {
    const seen = new Set();
    return tracks
        .filter(Boolean)
        .filter((track) => {
            const id = String(track?.id || '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .sort(compareSinglesTitles);
}

async function fetchAllTracks(ui, pageSize = TRACK_SCAN_PAGE_SIZE) {
    const api = ui?.api?.getAPI?.();
    if (!api?.request || !api?.mapTrack) throw new Error('Navidrome track API is unavailable.');
    const tracks = [];
    let offset = 0;
    while (true) {
        const root = await api.request('search3', {
            query: '""',
            artistCount: 0,
            albumCount: 0,
            songCount: pageSize,
            songOffset: offset,
        });
        const rawSongs = root.searchResult3?.song;
        const songs = Array.isArray(rawSongs) ? rawSongs : rawSongs ? [rawSongs] : [];
        tracks.push(...songs.map((song) => api.mapTrack(song)));
        if (songs.length < pageSize) break;
        offset += songs.length;
        await yieldToBrowser();
    }
    return dedupeAndSortTracks(tracks);
}

async function refreshSingles(ui) {
    if (refreshPromise) return refreshPromise;
    refreshPromise = fetchAllTracks(ui)
        .then((tracks) => {
            sessionCatalogue = { key: getSinglesCacheKey(ui), tracks };
            writeSinglesCache(ui, tracks);
            return tracks;
        })
        .finally(() => {
            refreshPromise = null;
        });
    return refreshPromise;
}

function collectRenderedAlbumArtwork() {
    const artwork = new Map();
    document.querySelectorAll('#library-albums-container .card[data-album-id]').forEach((card) => {
        const albumId = String(card.dataset.albumId || '');
        const image = card.querySelector('img.card-image');
        const url = image?.currentSrc || image?.src || image?.getAttribute('src');
        if (albumId && url) artwork.set(albumId, url);
    });
    return artwork;
}

function applyRenderedAlbumArtwork(tracks, artwork) {
    for (const track of tracks) {
        const albumId = String(track?.album?.id || '');
        const cover = artwork.get(albumId);
        if (track?.album && cover) track.album.cover = cover;
    }
}

function getFavoriteTrackIds(ui) {
    if (favoriteTrackIdsPromise) return favoriteTrackIdsPromise;
    favoriteTrackIdsPromise = Promise.resolve(ui?.api?.getAPI?.()?.loadFavorites?.())
        .then((favorites) => favorites?.track || new Set())
        .catch(() => new Set());
    return favoriteTrackIdsPromise;
}

function scheduleLikeStateUpdate(ui, row, track) {
    const update = async () => {
        const favoriteIds = await getFavoriteTrackIds(ui);
        const button = row.querySelector('.like-btn');
        if (!track || !button || track.id !== row.dataset.trackId) return;
        const liked = favoriteIds.has(String(track.id));
        button.innerHTML = ui.createHeartIcon(liked);
        button.classList.toggle('active', liked);
        button.title = liked ? 'Remove from Liked' : 'Add to Liked';
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => void update(), { timeout: 1200 });
    else setTimeout(() => void update(), 0);
}

function yieldToBrowser() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
    });
}

function clearSinglesAlphabetIndex() {
    const singlesTab = document.getElementById('library-tab-singles');
    singlesTab?._navichromeAlphabetController?.abort();
    singlesTab?.querySelector('.singles-alpha-index')?.remove();
    singlesTab?.querySelector('.singles-alpha-bubble')?.remove();
}

function getScrollElement() {
    return document.querySelector('.main-content') || window;
}

class SinglesVirtualController {
    constructor(ui, container, tracks) {
        this.ui = ui;
        this.container = container;
        this.tracks = tracks;
        this.hasMultipleDiscs = tracks.some((track) => (track.volumeNumber || track.discNumber || 1) > 1);
        this.rendered = new Map();
        this.raf = 0;
        this.destroyed = false;
        this.spacer = document.createElement('div');
        this.spacer.className = 'singles-virtual-spacer';
        this.container.appendChild(this.spacer);
        this.onScroll = () => this.scheduleRender();
        this.scrollElement = getScrollElement();
        this.scrollElement.addEventListener('scroll', this.onScroll, { passive: true });
        window.addEventListener('resize', this.onScroll, { passive: true });
        this.scheduleRender();
    }
    getTracks() {
        return this.tracks;
    }
    setTracks(tracks) {
        if (this.destroyed) return;
        this.tracks = tracks;
        this.hasMultipleDiscs = tracks.some((track) => (track.volumeNumber || track.discNumber || 1) > 1);
        this.scheduleRender();
    }
    getScrollTop() {
        return this.scrollElement === window ? window.scrollY || 0 : this.scrollElement.scrollTop || 0;
    }
    getViewportHeight() {
        return this.scrollElement === window
            ? window.innerHeight
            : this.scrollElement.clientHeight || window.innerHeight;
    }
    scheduleRender() {
        if (this.raf || this.destroyed) return;
        this.raf = requestAnimationFrame(() => {
            this.raf = 0;
            this.renderWindow();
        });
    }
    renderWindow() {
        if (this.destroyed) return;
        const containerRect = this.container.getBoundingClientRect();
        const scrollRect = this.scrollElement === window ? { top: 0 } : this.scrollElement.getBoundingClientRect();
        const viewportTop = Math.max(0, scrollRect.top - containerRect.top);
        const start = Math.max(0, Math.floor(viewportTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN);
        const end = Math.min(
            this.tracks.length,
            Math.ceil((viewportTop + this.getViewportHeight()) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN
        );
        const wanted = new Set();
        for (let index = start; index < end; index++) {
            wanted.add(index);
            if (!this.rendered.has(index)) this.mountRow(index);
        }
        for (const [index, row] of this.rendered) {
            if (!wanted.has(index)) {
                row.remove();
                this.rendered.delete(index);
            }
        }
        this.spacer.style.height = `${this.tracks.length * VIRTUAL_ROW_HEIGHT}px`;
    }
    mountRow(index) {
        const track = this.tracks[index];
        if (!track) return;
        const holder = document.createElement('div');
        holder.innerHTML = this.ui.createTrackItemHTML(track, index, true, this.hasMultipleDiscs, false, false).trim();
        const row = holder.firstElementChild;
        if (!row) return;
        row.classList.add('singles-virtual-row');
        row.dataset.index = String(index);
        row.style.top = `${index * VIRTUAL_ROW_HEIGHT}px`;
        trackDataStore.set(row, track);
        this.spacer.appendChild(row);
        this.rendered.set(index, row);
        scheduleLikeStateUpdate(this.ui, row, track);
    }
    scrollToIndex(index, smooth = true) {
        const bounded = Math.max(0, Math.min(this.tracks.length - 1, index));
        const containerRect = this.container.getBoundingClientRect();
        const scrollRect = this.scrollElement === window ? { top: 0 } : this.scrollElement.getBoundingClientRect();
        const targetTop = this.getScrollTop() + containerRect.top - scrollRect.top + bounded * VIRTUAL_ROW_HEIGHT - 16;
        const behavior = smooth ? 'smooth' : 'auto';
        if (this.scrollElement === window) {
            window.scrollTo({ top: targetTop, behavior });
        } else {
            this.scrollElement.scrollTo({ top: targetTop, behavior });
            // Some mobile browsers expose the page scroller as window even
            // when .main-content is present in the layout.
            window.scrollTo({ top: window.scrollY + containerRect.top + bounded * VIRTUAL_ROW_HEIGHT - 16, behavior });
        }
        this.scheduleRender();
    }
    destroy() {
        this.destroyed = true;
        if (this.raf) cancelAnimationFrame(this.raf);
        this.scrollElement.removeEventListener('scroll', this.onScroll);
        window.removeEventListener('resize', this.onScroll);
        this.rendered.clear();
        this.container._singlesVirtualController = null;
    }
}

function renderVirtualSingles(ui, container, tracks) {
    clearSinglesAlphabetIndex();
    container._singlesVirtualController?.destroy();
    container.innerHTML = '';
    const renderedArtwork = collectRenderedAlbumArtwork();
    applyRenderedAlbumArtwork(tracks, renderedArtwork);
    const controller = new SinglesVirtualController(ui, container, tracks);
    container._singlesVirtualController = controller;
    return controller;
}

export async function prepareLibrarySingles(ui) {
    const cacheKey = getSinglesCacheKey(ui);
    if (sessionCatalogue?.key === cacheKey)
        return { tracks: sessionCatalogue.tracks, fromCache: true, stale: false, error: null };
    const cached = await readSinglesCache(ui);
    if (cached?.fresh && cached.complete) {
        sessionCatalogue = { key: cacheKey, tracks: cached.tracks };
        return { tracks: cached.tracks, fromCache: true, stale: false, error: null };
    }
    if (cached?.tracks?.length) {
        const completePromise = refreshSingles(ui).catch((error) => {
            console.warn('Could not refresh Singles in background:', error);
            return cached.tracks;
        });
        return { tracks: cached.tracks, fromCache: true, stale: true, completePromise, error: null };
    }
    try {
        const tracks = await refreshSingles(ui);
        return { tracks, fromCache: false, stale: false, error: null };
    } catch (error) {
        console.error('Failed to prepare Navidrome tracks:', error);
        return { tracks: [], fromCache: false, stale: false, error };
    }
}

function sameTrackCatalogue(left, right) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++)
        if (String(left[index]?.id) !== String(right[index]?.id) || left[index]?.title !== right[index]?.title)
            return false;
    return true;
}

export async function renderLibrarySingles(ui, prepared = null) {
    const container = document.getElementById('library-singles-container');
    if (!container) return;
    container.classList.remove('card-grid');
    container.classList.add('track-list');
    container.innerHTML = createPlaceholder('Loading tracks…');
    const result = prepared || (await prepareLibrarySingles(ui));
    if (result?.error) {
        container.innerHTML = createPlaceholder(`Could not load tracks: ${result.error.message}`);
        return;
    }
    const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
    if (!tracks.length) {
        container.innerHTML = createPlaceholder('No tracks found in Navidrome.');
        return;
    }
    const controller = renderVirtualSingles(ui, container, tracks);
    import('./singles-alpha-index.js')
        .then(({ enhanceSinglesAlphabetIndex }) => enhanceSinglesAlphabetIndex())
        .catch((error) => console.warn('Singles alphabet index unavailable:', error));
    if (result?.completePromise)
        void result.completePromise
            .then((completeTracks) => {
                if (!Array.isArray(completeTracks) || !completeTracks.length || controller.destroyed) return;
                if (!sameTrackCatalogue(tracks, completeTracks)) {
                    controller.setTracks(completeTracks);
                    import('./singles-alpha-index.js')
                        .then(({ enhanceSinglesAlphabetIndex }) => enhanceSinglesAlphabetIndex())
                        .catch((error) => console.warn('Singles alphabet index unavailable:', error));
                }
            })
            .catch((error) => console.warn('Could not finish loading the Singles catalogue:', error));
}

export function getSinglesVirtualController(container = document.getElementById('library-singles-container')) {
    return container?._singlesVirtualController || null;
}

export function getSinglesAlphaPositions() {
    const controller = getSinglesVirtualController();
    if (!controller) return new Map();
    const index = new Map();
    controller.getTracks().forEach((track, position) => {
        const key = getSinglesAlphaKey(track?.title);
        if (!index.has(key)) index.set(key, position);
    });
    return index;
}
