import { NavidromeAPI } from './navidrome-api.js';

// Some legacy single-track download code still calls the old provider-specific
// enrichTrack() method before handing the track back to MusicAPI.downloadTrack().
// Navidrome does not need provider enrichment, but hydrating the track first
// preserves the richer metadata the old path expected for filenames/folders.
if (typeof NavidromeAPI.prototype.enrichTrack !== 'function') {
    NavidromeAPI.prototype.enrichTrack = async function (track) {
        let enrichedTrack = track;

        if (track?.id && typeof this.getTrackMetadata === 'function') {
            try {
                const metadata = await this.getTrackMetadata(track.id);
                if (metadata) {
                    enrichedTrack = {
                        ...track,
                        ...metadata,
                        album: {
                            ...(track.album || {}),
                            ...(metadata.album || {}),
                        },
                        artist: metadata.artist || track.artist,
                        artists: metadata.artists || track.artists,
                    };
                }
            } catch (error) {
                console.warn('Could not hydrate Navidrome track before download:', error);
            }
        }

        return { enrichedTrack };
    };
}
