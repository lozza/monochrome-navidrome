import { NavidromeAPI } from './navidrome-api.js';

function normalize(value) {
    return String(value || '')
        .trim()
        .toLocaleLowerCase();
}

function dedupeTracks(tracks = []) {
    const seenIds = new Set();
    const seenPaths = new Set();
    const seenMetadata = new Set();
    const unique = [];

    for (const track of tracks) {
        if (!track) continue;

        const id = String(track.id || '').trim();
        const path = normalize(track.navidrome?.path || track.path);
        const metadataKey = [
            normalize(track.title),
            normalize(track.artist?.name || track.artists?.[0]?.name),
            normalize(track.album?.title || track.album?.name),
            String(track.volumeNumber || track.discNumber || 1),
            String(track.trackNumber || track.track || ''),
            String(Math.round(Number(track.duration) || 0)),
        ].join('\u0000');

        const duplicateById = id && seenIds.has(id);
        const duplicateByPath = path && seenPaths.has(path);
        const duplicateByMetadata = metadataKey && seenMetadata.has(metadataKey);

        if (duplicateById || duplicateByPath || duplicateByMetadata) continue;

        if (id) seenIds.add(id);
        if (path) seenPaths.add(path);
        if (metadataKey) seenMetadata.add(metadataKey);
        unique.push(track);
    }

    return unique;
}

const originalSearchTracks = Reflect.get(NavidromeAPI.prototype, 'searchTracks');
NavidromeAPI.prototype.searchTracks = async function (query, options = {}) {
    const result = await originalSearchTracks.call(this, query, options);
    const items = dedupeTracks(result?.items || []);

    return {
        ...result,
        items,
        totalNumberOfItems: items.length,
    };
};
