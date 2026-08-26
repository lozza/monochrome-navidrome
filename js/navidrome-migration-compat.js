import { NavidromeAPI } from './navidrome-api.js';

function normalizeIsrcValue(value) {
    if (value === undefined || value === null || value === '') return '';

    if (Array.isArray(value)) {
        for (const item of value) {
            const normalized = normalizeIsrcValue(item);
            if (normalized) return normalized;
        }
        return '';
    }

    if (typeof value === 'object') {
        return normalizeIsrcValue(value.value ?? value.isrc ?? value.code ?? value.id ?? '');
    }

    return String(value).trim();
}

function normalizeTrackIsrc(track) {
    if (!track || typeof track !== 'object') return track;

    const source = track.isrc ?? track.mediaMetadata?.isrc ?? track.audioQuality?.isrc ?? '';
    track.isrc = normalizeIsrcValue(source);
    return track;
}

// Navidrome/OpenSubsonic implementations can expose ISRC as a structured or
// repeated value. Legacy lyrics code expects a scalar string and calls trim()
// directly, so normalize it at the adapter boundary.
const originalMapTrack = NavidromeAPI.prototype.mapTrack;
NavidromeAPI.prototype.mapTrack = function (raw = {}) {
    return normalizeTrackIsrc(originalMapTrack.call(this, raw));
};

// Also repair tracks already persisted in the browser queue by an older build.
// This runs before Player.loadQueueState(), so reopening Lyrics for a restored
// song cannot hit the same non-string ISRC value.
try {
    const queueKey = 'monochrome-queue';
    const storedQueue = localStorage.getItem(queueKey);
    if (storedQueue) {
        const state = JSON.parse(storedQueue);
        let changed = false;

        for (const key of ['queue', 'shuffledQueue', 'originalQueueBeforeShuffle']) {
            if (!Array.isArray(state?.[key])) continue;
            for (const track of state[key]) {
                if (!track || typeof track !== 'object') continue;
                const before = track.isrc;
                normalizeTrackIsrc(track);
                if (before !== track.isrc) changed = true;
            }
        }

        if (changed) localStorage.setItem(queueKey, JSON.stringify(state));
    }
} catch (error) {
    console.warn('Could not normalize saved Navidrome queue metadata:', error);
}

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
                    normalizeTrackIsrc(enrichedTrack);
                }
            } catch (error) {
                console.warn('Could not hydrate Navidrome track before download:', error);
            }
        }

        return { enrichedTrack };
    };
}
