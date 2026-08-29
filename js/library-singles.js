import { createPlaceholder } from './utils.js';

const SINGLES_CACHE_VERSION = 2;
const SINGLES_CACHE_TTL = 5 * 60 * 1000;
const SINGLES_PAGE_SIZE = 1000;

function normalizeReleaseTypes(value) {
    const values = Array.isArray(value) ? value : value == null ? [] : [value];
    return values
        .flatMap((item) => {
            if (item && typeof item === 'object') {
                return [item.type, item.name, item.value, item.releaseType].filter(Boolean);
            }
            return [item];
        })
        .flatMap((item) => String(item).split(/[;,/]/))
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

function getExplicitSingleState(track) {
    const albumType = String(track.albumType || track.releaseType || '').trim().toLowerCase();
    if (albumType === 'single') return true;
    if (albumType === 'album' || albumType === 'ep') return false;

    const releaseTypes = normalizeReleaseTypes(track.releaseTypes);
    if (!releaseTypes.length) return null;

    const primary = releaseTypes[0];
    if (primary === 'single') return true;
    if (primary === 'album' || primary === 'ep') return false;

    if (releaseTypes.includes('single') && !releaseTypes.some((type) => type === 'album' || type === 'ep')) {
        return true;
    }

    if (releaseTypes.some((type) => type === 'album' || type === 'ep')) return false;
    return null;
}

function getSinglesCacheKey(ui) {
    const api = ui?.api?.getAPI?.();
    const server = encodeURIComponent(String(api?.baseUrl || 'navidrome'));
    const username = encodeURIComponent(String(api?.username || ''));
    return `navichrome-singles-v${SINGLES_CACHE_VERSION}:${server}:${username}`;
}

function readSinglesCache(ui) {
    try {
        const raw = localStorage.getItem(getSinglesCacheKey(ui));
        if (!raw) return null;

        const cached = JSON.parse(raw);
        if (!Array.isArray(cached?.tracks) || !Number.isFinite(cached?.savedAt)) return null;
        if (Date.now() - cached.savedAt > SINGLES_CACHE_TTL) return null;
        return cached.tracks;
    } catch {
        return null;
    }
}

function writeSinglesCache(ui, tracks) {
    try {
        localStorage.setItem(
            getSinglesCacheKey(ui),
            JSON.stringify({
                savedAt: Date.now(),
                tracks,
            })
        );
    } catch (error) {
        console.warn('Could not cache Singles:', error);
    }
}

async function fetchAllTracks(ui, pageSize = SINGLES_PAGE_SIZE) {
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
    }

    return tracks;
}

function collectAlbumTrackCounts(tracks) {
    const counts = new Map();
    for (const track of tracks) {
        const albumId = track.album?.id;
        if (!albumId) continue;
        counts.set(albumId, (counts.get(albumId) || 0) + 1);
    }
    return counts;
}

function isSingleTrack(track, albumTrackCounts) {
    const explicitState = getExplicitSingleState(track);
    if (explicitState !== null) return explicitState;

    const albumId = track.album?.id;
    return Boolean(albumId && albumTrackCounts.get(albumId) === 1);
}

function buildSingles(allTracks) {
    const albumTrackCounts = collectAlbumTrackCounts(allTracks);
    const seen = new Set();

    return allTracks
        .filter((track) => isSingleTrack(track, albumTrackCounts))
        .filter((track) => {
            if (!track?.id || seen.has(track.id)) return false;
            seen.add(track.id);
            return true;
        })
        .sort((a, b) =>
            String(a.title || '').localeCompare(String(b.title || ''), undefined, {
                sensitivity: 'base',
                numeric: true,
            })
        );
}

function collectRenderedAlbumArtwork() {
    const artwork = new Map();
    const selectors = ['#library-albums-container .card[data-album-id]', '#library-singles-container .card[data-album-id]'];

    for (const selector of selectors) {
        document.querySelectorAll(selector).forEach((card) => {
            const albumId = String(card.dataset.albumId || '');
            const image = card.querySelector('img.card-image');
            const url = image?.currentSrc || image?.src || image?.getAttribute('src');
            if (albumId && url) artwork.set(albumId, url);
        });
    }

    return artwork;
}

function applyRenderedAlbumArtwork(tracks, artwork) {
    for (const track of tracks) {
        const albumId = String(track?.album?.id || '');
        const cover = artwork.get(albumId);
        if (track?.album && cover) track.album.cover = cover;
    }
}

function installArtworkFallbacks(ui, container, tracks) {
    const api = ui?.api?.getAPI?.();
    if (!api?.getCoverUrl) return;

    const tracksById = new Map(tracks.map((track) => [String(track.id), track]));
    const albumRequests = new Map();

    const getAlbum = (albumId) => {
        if (!albumRequests.has(albumId)) {
            albumRequests.set(
                albumId,
                ui.api
                    .getAlbum(albumId)
                    .then((result) => result?.album || result)
                    .catch(() => null)
            );
        }
        return albumRequests.get(albumId);
    };

    container.querySelectorAll('.track-item[data-track-id]').forEach((row) => {
        const track = tracksById.get(String(row.dataset.trackId || ''));
        const image = row.querySelector('img.track-item-cover');
        if (!track || !image) return;

        const recover = async () => {
            if (image.dataset.albumArtworkFallback === 'done') return;
            image.dataset.albumArtworkFallback = 'done';

            const albumId = String(track.album?.id || '');
            if (!albumId) {
                image.src = '/images/navichrome_logo.svg';
                return;
            }

            const album = await getAlbum(albumId);
            const cover = album?.cover;
            const fallbackUrl = cover ? api.getCoverUrl(cover, '80') : '';

            if (fallbackUrl && fallbackUrl !== image.src) {
                track.album.cover = cover;
                image.src = fallbackUrl;
                return;
            }

            image.src = '/images/navichrome_logo.svg';
        };

        image.addEventListener('error', recover, { once: true });
        if (image.complete && image.naturalWidth === 0) recover();
    });
}

export async function prepareLibrarySingles(ui) {
    const cachedTracks = readSinglesCache(ui);
    if (cachedTracks) {
        return { tracks: cachedTracks, fromCache: true, error: null };
    }

    try {
        const allTracks = await fetchAllTracks(ui);
        const tracks = buildSingles(allTracks);
        writeSinglesCache(ui, tracks);
        return { tracks, fromCache: false, error: null };
    } catch (error) {
        console.error('Failed to prepare Navidrome singles:', error);
        return { tracks: [], fromCache: false, error };
    }
}

export async function renderLibrarySingles(ui, prepared = null) {
    const container = document.getElementById('library-singles-container');
    if (!container) return;

    const renderedArtwork = collectRenderedAlbumArtwork();

    container.classList.remove('card-grid');
    container.classList.add('track-list');

    const result = prepared || (await prepareLibrarySingles(ui));
    if (result?.error) {
        container.innerHTML = createPlaceholder(`Could not load singles: ${result.error.message}`);
        return;
    }

    const singles = Array.isArray(result?.tracks) ? result.tracks : [];
    if (!singles.length) {
        container.innerHTML = createPlaceholder('No singles found in Navidrome.');
        return;
    }

    applyRenderedAlbumArtwork(singles, renderedArtwork);
    await ui.renderListWithTracks(container, singles, true);
    installArtworkFallbacks(ui, container, singles);
}
