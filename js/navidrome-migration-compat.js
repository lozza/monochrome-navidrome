import { NavidromeAPI } from './navidrome-api.js';

// Restoring the saved queue happens before routing starts. If Navidrome
// credentials are missing, legacy UI restore code can ask for cover art before
// the user has any chance to open Settings. Navidrome's buildUrl() correctly
// rejects that request, but letting the exception escape bricks the whole SPA.
// Artwork is optional during startup, so return no artwork until the server is
// configured instead of aborting Player.initialize().
const originalGetCoverUrl = NavidromeAPI.prototype.getCoverUrl;
NavidromeAPI.prototype.getCoverUrl = function (id, size = '320') {
    if (!id) return '';

    const value = String(id);
    if (/^(?:blob:|data:|https?:)/i.test(value)) return value;

    if (typeof this.isConfigured === 'function' && !this.isConfigured()) {
        return '';
    }

    try {
        return originalGetCoverUrl.call(this, id, size);
    } catch (error) {
        if (String(error?.message || error).includes('Connect Navidrome')) {
            return '';
        }
        throw error;
    }
};

const originalGetCoverSrcset = NavidromeAPI.prototype.getCoverSrcset;
NavidromeAPI.prototype.getCoverSrcset = function (id) {
    if (typeof this.isConfigured === 'function' && !this.isConfigured()) {
        return '';
    }

    try {
        return originalGetCoverSrcset.call(this, id);
    } catch (error) {
        if (String(error?.message || error).includes('Connect Navidrome')) {
            return '';
        }
        throw error;
    }
};

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
