import { createPlaceholder, trackDataStore } from './utils.js';

const SINGLES_CACHE_VERSION = 7;
const SINGLES_CACHE_TTL = 24 * 60 * 60 * 1000;
const SINGLES_CACHE_STALE_TTL = 7 * 24 * 60 * 60 * 1000;
const TRACK_SCAN_PAGE_SIZE = 1000;
const INITIAL_RENDER_SIZE = 80;
const RENDER_CHUNK_SIZE = 200;
const PERSISTED_CACHE_TRACK_LIMIT = 1500;
const PERSISTED_CACHE_CHARACTER_LIMIT = 1_500_000;

export const SINGLES_PERFORMANCE_LIMITS = Object.freeze({
    scanPageSize: TRACK_SCAN_PAGE_SIZE,
    initialRenderSize: INITIAL_RENDER_SIZE,
    renderChunkSize: RENDER_CHUNK_SIZE,
    persistedTrackLimit: PERSISTED_CACHE_TRACK_LIMIT,
    persistedCharacterLimit: PERSISTED_CACHE_CHARACTER_LIMIT,
});

let refreshPromise = null;
let activeRenderGeneration = 0;
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
        coverArt: track?.coverArt || null,
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

function readSinglesCache(ui) {
    try {
        const raw = localStorage.getItem(getSinglesCacheKey(ui));
        if (!raw) return null;

        const cached = JSON.parse(raw);
        if (!Array.isArray(cached?.tracks) || !Number.isFinite(cached?.savedAt)) return null;

        const age = Date.now() - cached.savedAt;
        if (age > SINGLES_CACHE_STALE_TTL) return null;

        return {
            tracks: cached.tracks,
            fresh: age <= SINGLES_CACHE_TTL,
            complete: cached.complete === true && cached.totalTracks === cached.tracks.length,
            totalTracks: Number(cached.totalTracks) || cached.tracks.length,
        };
    } catch {
        return null;
    }
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
    const write = () => {
        try {
            // Snapshot during idle time so a large catalogue cannot delay the
            // first visible rows. Persist only a bounded alphabetical prefix;
            // the complete sorted catalogue remains in session memory.
            const { serialized } = createPersistedSinglesCache(tracks);
            localStorage.setItem(getSinglesCacheKey(ui), serialized);
        } catch (error) {
            console.warn('Could not cache Singles:', error);
        }
    };

    // localStorage and JSON.stringify are synchronous. Do this away from the
    // first render so a large library cannot freeze the page just to save cache.
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(write, { timeout: 2000 });
    } else {
        setTimeout(write, 100);
    }
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
        .sort((a, b) =>
            String(a.title || '').localeCompare(String(b.title || ''), undefined, {
                sensitivity: 'base',
                numeric: true,
            })
        );
}

async function fetchAllTracks(ui, pageSize = TRACK_SCAN_PAGE_SIZE) {
    const api = ui?.api?.getAPI?.();
    if (!api?.request || !api?.mapTrack) {
        throw new Error('Navidrome track API is unavailable.');
    }

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

        // Give Safari/iOS a full frame to paint and handle input between large
        // Navidrome result pages. A zero-delay timer alone can still starve
        // rendering when a local server returns pages immediately.
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

    const api = ui?.api?.getAPI?.();
    favoriteTrackIdsPromise = Promise.resolve(api?.loadFavorites?.())
        .then((favorites) => favorites?.track || new Set())
        .catch(() => new Set());

    return favoriteTrackIdsPromise;
}

function scheduleLikeStateUpdate(ui, rows, rowTracks) {
    if (!rows.length) return;

    const update = async () => {
        const favoriteIds = await getFavoriteTrackIds(ui);
        rows.forEach((row, index) => {
            const track = rowTracks[index];
            const button = row.querySelector('.like-btn');
            if (!track || !button) return;

            const liked = favoriteIds.has(String(track.id));
            button.innerHTML = ui.createHeartIcon(liked);
            button.classList.toggle('active', liked);
            button.title = liked ? 'Remove from Liked' : 'Add to Liked';
        });
    };

    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => void update(), { timeout: 1200 });
    } else {
        setTimeout(() => void update(), 0);
    }
}

function renderTrackChunk(ui, container, tracks, start, end, hasMultipleDiscs) {
    const tempDiv = document.createElement('div');
    const rowTracks = [];
    const html = [];

    for (let index = start; index < end; index++) {
        const track = tracks[index];
        const rowHtml = ui.createTrackItemHTML(track, index, true, hasMultipleDiscs, false, false);
        if (!rowHtml) continue;
        html.push(rowHtml);
        rowTracks.push(track);
    }

    tempDiv.innerHTML = html.join('');
    const rows = Array.from(tempDiv.children);
    const fragment = document.createDocumentFragment();

    rows.forEach((row, index) => {
        const track = rowTracks[index];
        if (track) trackDataStore.set(row, track);
        fragment.appendChild(row);
    });

    container.appendChild(fragment);
    scheduleLikeStateUpdate(ui, rows, rowTracks);
}

function yieldToBrowser() {
    return new Promise((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
    });
}

function renderTracksProgressively(ui, container, tracks) {
    const generation = ++activeRenderGeneration;
    const renderedArtwork = collectRenderedAlbumArtwork();
    applyRenderedAlbumArtwork(tracks, renderedArtwork);

    container.innerHTML = '';
    const hasMultipleDiscs = tracks.some((track) => (track.volumeNumber || track.discNumber || 1) > 1);
    let offset = Math.min(INITIAL_RENDER_SIZE, tracks.length);

    renderTrackChunk(ui, container, tracks, 0, offset, hasMultipleDiscs);

    const completionPromise = (async () => {
        while (offset < tracks.length && generation === activeRenderGeneration) {
            await yieldToBrowser();
            if (generation !== activeRenderGeneration) return;

            const end = Math.min(offset + RENDER_CHUNK_SIZE, tracks.length);
            renderTrackChunk(ui, container, tracks, offset, end, hasMultipleDiscs);
            offset = end;
        }

        if (generation !== activeRenderGeneration) return;

        import('./singles-alpha-index.js')
            .then(({ enhanceSinglesAlphabetIndex }) => enhanceSinglesAlphabetIndex())
            .catch(() => {});
    })();

    return completionPromise;
}

export async function prepareLibrarySingles(ui) {
    const cacheKey = getSinglesCacheKey(ui);
    if (sessionCatalogue?.key === cacheKey) {
        return { tracks: sessionCatalogue.tracks, fromCache: true, stale: false, error: null };
    }

    const cached = readSinglesCache(ui);

    if (cached?.fresh && cached.complete) {
        sessionCatalogue = { key: cacheKey, tracks: cached.tracks };
        return { tracks: cached.tracks, fromCache: true, stale: false, error: null };
    }

    if (cached?.tracks?.length) {
        const completePromise = refreshSingles(ui).catch((error) => {
            console.warn('Could not refresh Singles in background:', error);
            return cached.tracks;
        });

        return {
            tracks: cached.tracks,
            fromCache: true,
            stale: true,
            completePromise,
            error: null,
        };
    }

    try {
        const tracks = await refreshSingles(ui);
        return { tracks, fromCache: false, stale: false, error: null };
    } catch (error) {
        console.error('Failed to prepare Navidrome tracks:', error);
        return { tracks: [], fromCache: false, stale: false, error };
    }
}

export async function renderLibrarySingles(ui, prepared = null) {
    const container = document.getElementById('library-singles-container');
    if (!container) return;

    container.classList.remove('card-grid');
    container.classList.add('track-list');

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

    // Render enough rows to make the tab usable immediately, then finish the
    // rest in small chunks without monopolising Safari's main thread.
    void renderTracksProgressively(ui, container, tracks);

    if (result?.completePromise) {
        void result.completePromise
            .then((completeTracks) => {
                if (!Array.isArray(completeTracks) || !completeTracks.length) return;

                const currentIds = tracks.map((track) => String(track.id)).join('|');
                const completeIds = completeTracks.map((track) => String(track.id)).join('|');
                if (currentIds === completeIds) return;

                void renderTracksProgressively(ui, container, completeTracks);
            })
            .catch((error) => {
                console.warn('Could not finish loading the Singles catalogue:', error);
            });
    }
}
