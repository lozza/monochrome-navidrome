import { createPlaceholder } from './utils.js';

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

function preferAlbumArtwork(track) {
    if (!track?.album) return track;

    const currentCover = String(track.album.cover || '');
    if (/^(?:al-|https?:|blob:|data:)/i.test(currentCover)) return track;

    const albumId = String(track.album.id || '').trim();
    if (!albumId) return track;

    track.album.cover = `al-${albumId.replace(/^al-/i, '')}`;
    return track;
}

async function fetchAllTracks(ui, pageSize = 500) {
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
        tracks.push(...songs.map((song) => preferAlbumArtwork(api.mapTrack(song))));

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

export async function renderLibrarySingles(ui) {
    const container = document.getElementById('library-singles-container');
    if (!container) return;

    container.classList.remove('card-grid');
    container.classList.add('track-list');
    container.innerHTML = ui.createSkeletonTracks?.(8, true) || '<div class="placeholder-text">Loading singles…</div>';

    try {
        const allTracks = await fetchAllTracks(ui);
        const albumTrackCounts = collectAlbumTrackCounts(allTracks);
        const seen = new Set();
        const singles = allTracks
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

        if (!singles.length) {
            container.innerHTML = createPlaceholder('No singles found in Navidrome.');
            return;
        }

        await ui.renderListWithTracks(container, singles, true);
    } catch (error) {
        console.error('Failed to render Navidrome singles:', error);
        container.innerHTML = createPlaceholder(`Could not load singles: ${error.message}`);
    }
}
