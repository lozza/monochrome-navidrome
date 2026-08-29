import { createPlaceholder } from './utils.js';

const SINGLES_CACHE_VERSION = 4;
const SINGLES_CACHE_TTL = 24 * 60 * 60 * 1000;
const SINGLES_CACHE_STALE_TTL = 7 * 24 * 60 * 60 * 1000;
const ALBUM_FETCH_CONCURRENCY = 12;
const TRACK_SCAN_PAGE_SIZE = 5000;

let refreshPromise = null;

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

function getExplicitSingleState(item) {
    const albumType = String(item?.albumType || item?.releaseType || '').trim().toLowerCase();
    if (albumType === 'single') return true;
    if (albumType === 'album' || albumType === 'ep') return false;

    const releaseTypes = normalizeReleaseTypes(item?.releaseTypes);
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

function isSingleAlbum(album) {
    const explicitState = getExplicitSingleState(album);
    if (explicitState !== null) return explicitState;
    return Number(album?.numberOfTracks) === 1;
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

        const age = Date.now() - cached.savedAt;
        if (age > SINGLES_CACHE_STALE_TTL) return null;

        return {
            tracks: cached.tracks,
            complete: cached.complete === true,
            fresh: age <= SINGLES_CACHE_TTL,
        };
    } catch {
        return null;
    }
}

function writeSinglesCache(ui, tracks, complete = true) {
    try {
        localStorage.setItem(
            getSinglesCacheKey(ui),
            JSON.stringify({
                savedAt: Date.now(),
                complete,
                tracks,
            })
        );
    } catch (error) {
        console.warn('Could not cache Singles:', error);
    }
}

async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
        while (nextIndex < items.length) {
            const index = nextIndex++;
            results[index] = await worker(items[index], index);
        }
    });

    await Promise.all(runners);
    return results;
}

function normalizeAlbumTrack(track, album) {
    if (!track) return null;

    if (track.album) {
        track.album.id = String(album?.id || track.album.id || '');
        track.album.title = album?.title || album?.name || track.album.title;
        if (album?.cover) track.album.cover = album.cover;
    }

    if (album?.releaseTypes && !track.releaseTypes) track.releaseTypes = album.releaseTypes;
    if (album?.albumType && !track.albumType) track.albumType = album.albumType;
    if (album?.releaseType && !track.releaseType) track.releaseType = album.releaseType;

    return track;
}

function dedupeAndSortSingles(tracks) {
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

async function fetchSinglesFromAlbums(ui) {
    const albums = await ui.api.getAllAlbums();
    const candidates = albums.filter(isSingleAlbum);

    if (!candidates.length) return [];

    const albumTrackGroups = await mapWithConcurrency(candidates, ALBUM_FETCH_CONCURRENCY, async (album) => {
        try {
            const result = await ui.api.getAlbum(album.id);
            const tracks = Array.isArray(result?.tracks) ? result.tracks : [];
            return tracks.map((track) => normalizeAlbumTrack(track, album));
        } catch (error) {
            console.warn(`Could not load Singles album ${album.id}:`, error);
            return [];
        }
    });

    return dedupeAndSortSingles(albumTrackGroups.flat());
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

    return tracks;
}

function collectAlbumTrackCounts(tracks) {
    const counts = new Map();
    for (const track of tracks) {
        const albumId = String(track?.album?.id || '');
        if (!albumId) continue;
        counts.set(albumId, (counts.get(albumId) || 0) + 1);
    }
    return counts;
}

function buildSinglesFromTracks(allTracks) {
    const albumTrackCounts = collectAlbumTrackCounts(allTracks);

    return dedupeAndSortSingles(
        allTracks.filter((track) => {
            const explicitState = getExplicitSingleState(track);
            if (explicitState !== null) return explicitState;

            const albumId = String(track?.album?.id || '');
            return Boolean(albumId && albumTrackCounts.get(albumId) === 1);
        })
    );
}

async function fetchCompleteSingles(ui) {
    try {
        const allTracks = await fetchAllTracks(ui);
        return buildSinglesFromTracks(allTracks);
    } catch (error) {
        console.warn('Full Singles metadata scan failed, falling back to album metadata:', error);
        return fetchSinglesFromAlbums(ui);
    }
}

async function refreshSingles(ui) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = fetchCompleteSingles(ui)
        .then((tracks) => {
            writeSinglesCache(ui, tracks, true);
            return tracks;
        })
        .finally(() => {
            refreshPromise = null;
        });

    return refreshPromise;
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

async function renderTracks(ui, container, tracks) {
    const renderedArtwork = collectRenderedAlbumArtwork();
    applyRenderedAlbumArtwork(tracks, renderedArtwork);
    await ui.renderListWithTracks(container, tracks, true);
    installArtworkFallbacks(ui, container, tracks);
}

export async function prepareLibrarySingles(ui) {
    const cached = readSinglesCache(ui);

    if (cached?.fresh && cached.complete) {
        return { tracks: cached.tracks, fromCache: true, stale: false, partial: false, error: null };
    }

    if (cached?.tracks?.length) {
        const completePromise = refreshSingles(ui).catch((error) => {
            console.warn('Could not refresh Singles in background:', error);
            return cached.tracks;
        });
        return {
            tracks: cached.tracks,
            fromCache: true,
            stale: !cached.fresh,
            partial: !cached.complete,
            completePromise,
            error: null,
        };
    }

    try {
        // Give the UI a quick first result from album metadata, then complete
        // it in the background using track-level release metadata. Navidrome
        // does not always expose release type consistently on album listings.
        const quickTracks = await fetchSinglesFromAlbums(ui);
        writeSinglesCache(ui, quickTracks, false);

        const completePromise = refreshSingles(ui).catch((error) => {
            console.warn('Could not complete Singles metadata scan:', error);
            return quickTracks;
        });

        return {
            tracks: quickTracks,
            fromCache: false,
            stale: false,
            partial: true,
            completePromise,
            error: null,
        };
    } catch (error) {
        console.error('Failed to prepare Navidrome singles:', error);
        return { tracks: [], fromCache: false, stale: false, partial: false, error };
    }
}

export async function renderLibrarySingles(ui, prepared = null) {
    const container = document.getElementById('library-singles-container');
    if (!container) return;

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
    } else {
        await renderTracks(ui, container, singles);
    }

    if (result?.completePromise) {
        result.completePromise.then(async (completeTracks) => {
            if (!Array.isArray(completeTracks) || !completeTracks.length) return;

            const currentIds = singles.map((track) => String(track.id)).join('|');
            const completeIds = completeTracks.map((track) => String(track.id)).join('|');
            if (currentIds === completeIds) return;

            await renderTracks(ui, container, completeTracks);
            import('./singles-alpha-index.js')
                .then(({ enhanceSinglesAlphabetIndex }) => enhanceSinglesAlphabetIndex())
                .catch(() => {});
        });
    }
}
