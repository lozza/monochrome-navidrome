import { createPlaceholder } from './utils.js';

const SINGLES_CACHE_VERSION = 5;
const SINGLES_CACHE_TTL = 24 * 60 * 60 * 1000;
const SINGLES_CACHE_STALE_TTL = 7 * 24 * 60 * 60 * 1000;
const TRACK_SCAN_PAGE_SIZE = 5000;

let refreshPromise = null;

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

        const age = Date.now() - cached.savedAt;
        if (age > SINGLES_CACHE_STALE_TTL) return null;

        return {
            tracks: cached.tracks,
            fresh: age <= SINGLES_CACHE_TTL,
        };
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

function dedupeAndSortTracks(tracks) {
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
    }

    return dedupeAndSortTracks(tracks);
}

async function refreshSingles(ui) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = fetchAllTracks(ui)
        .then((tracks) => {
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

async function renderTracks(ui, container, tracks) {
    const renderedArtwork = collectRenderedAlbumArtwork();
    applyRenderedAlbumArtwork(tracks, renderedArtwork);
    await ui.renderListWithTracks(container, tracks, true);
    installArtworkFallbacks(ui, container, tracks);
}

export async function prepareLibrarySingles(ui) {
    const cached = readSinglesCache(ui);

    if (cached?.fresh) {
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
    } else {
        await renderTracks(ui, container, tracks);
    }

    if (result?.completePromise) {
        result.completePromise.then(async (completeTracks) => {
            if (!Array.isArray(completeTracks) || !completeTracks.length) return;

            const currentIds = tracks.map((track) => String(track.id)).join('|');
            const completeIds = completeTracks.map((track) => String(track.id)).join('|');
            if (currentIds === completeIds) return;

            await renderTracks(ui, container, completeTracks);
            import('./singles-alpha-index.js')
                .then(({ enhanceSinglesAlphabetIndex }) => enhanceSinglesAlphabetIndex())
                .catch(() => {});
        });
    }
}
