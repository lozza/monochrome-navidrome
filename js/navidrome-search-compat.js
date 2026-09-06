import { NavidromeAPI } from './navidrome-api.js';

function dedupeTracks(tracks = []) {
    const seen = new Set();
    const unique = [];

    for (const track of tracks) {
        if (!track) continue;

        const id = String(track.id || '').trim();
        const fallbackKey = [
            String(track.title || '').trim().toLocaleLowerCase(),
            String(track.artist?.id || track.artist?.name || '').trim().toLocaleLowerCase(),
            String(track.album?.id || track.album?.title || '').trim().toLocaleLowerCase(),
            String(track.trackNumber || ''),
            String(track.duration || ''),
        ].join('\u0000');
        const key = id ? `id:${id}` : `meta:${fallbackKey}`;

        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(track);
    }

    return unique;
}

const originalSearchTracks = NavidromeAPI.prototype.searchTracks;
NavidromeAPI.prototype.searchTracks = async function (query, options = {}) {
    const result = await originalSearchTracks.call(this, query, options);
    const items = dedupeTracks(result?.items || []);

    return {
        ...result,
        items,
        totalNumberOfItems: items.length,
    };
};
