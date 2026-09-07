function asTrackId(value) {
    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (value.isLocal || value.isTracker) return null;
    return value.id == null ? null : String(value.id);
}

function uniqueIndexes(indexes) {
    return [...new Set((indexes || []).map(Number).filter((index) => Number.isInteger(index) && index >= 0))].sort(
        (a, b) => b - a
    );
}

/**
 * Thin native-playlist layer over Navidrome/OpenSubsonic.
 *
 * Navidrome remains the source of truth. This service deliberately contains no
 * IndexedDB/localStorage playlist fallback, so callers cannot accidentally
 * create a second playlist system while using the new playlist UI.
 */
export class NavidromePlaylistService {
    constructor(api) {
        this.api = api;
        this.nativeApi = typeof api?.getAPI === 'function' ? api.getAPI() : api;

        if (!this.nativeApi?.request || !this.nativeApi?.getPlaylist || !this.nativeApi?.getPlaylists) {
            throw new Error('Navidrome playlist service requires the Navidrome/OpenSubsonic API.');
        }
    }

    trackIds(tracks = []) {
        return (Array.isArray(tracks) ? tracks : [tracks]).map(asTrackId).filter(Boolean);
    }

    async list() {
        return this.nativeApi.getPlaylists();
    }

    async get(playlistId) {
        return this.nativeApi.getPlaylist(String(playlistId));
    }

    canEdit(playlist) {
        if (!playlist) return false;
        const owner = String(playlist.owner || '').trim();
        const username = String(this.nativeApi.username || '').trim();
        return !owner || !username || owner.localeCompare(username, undefined, { sensitivity: 'base' }) === 0;
    }

    async create(name, tracks = [], options = {}) {
        const cleanName = String(name || '').trim();
        if (!cleanName) throw new Error('Playlist name is required.');

        const root = await this.nativeApi.request('createPlaylist', {
            name: cleanName,
            songId: this.trackIds(tracks),
        });

        const playlistId = root.playlist?.id;
        if (!playlistId) {
            throw new Error('Navidrome created the playlist but did not return its ID.');
        }

        const metadata = {};
        if (options.comment !== undefined) metadata.comment = String(options.comment || '');
        if (options.public !== undefined) metadata.public = Boolean(options.public);

        if (Object.keys(metadata).length) {
            await this.nativeApi.request('updatePlaylist', {
                playlistId: String(playlistId),
                ...metadata,
            });
        }

        return this.get(playlistId);
    }

    async updateMetadata(playlistId, changes = {}) {
        const params = { playlistId: String(playlistId) };
        if (changes.name !== undefined) {
            const name = String(changes.name || '').trim();
            if (!name) throw new Error('Playlist name is required.');
            params.name = name;
        }
        if (changes.comment !== undefined) params.comment = String(changes.comment || '');
        if (changes.public !== undefined) params.public = Boolean(changes.public);

        if (Object.keys(params).length === 1) return this.get(playlistId);
        await this.nativeApi.request('updatePlaylist', params);
        return this.get(playlistId);
    }

    async delete(playlistId) {
        await this.nativeApi.request('deletePlaylist', { id: String(playlistId) });
        return true;
    }

    async addTracks(playlistId, tracks) {
        const songIds = this.trackIds(tracks);
        if (!songIds.length) return this.get(playlistId);

        await this.nativeApi.request('updatePlaylist', {
            playlistId: String(playlistId),
            songIdToAdd: songIds,
        });
        return this.get(playlistId);
    }

    async removeIndexes(playlistId, indexes) {
        const cleanIndexes = uniqueIndexes(indexes);
        if (!cleanIndexes.length) return this.get(playlistId);

        await this.nativeApi.request('updatePlaylist', {
            playlistId: String(playlistId),
            songIndexToRemove: cleanIndexes,
        });
        return this.get(playlistId);
    }

    async removeTrack(playlistId, trackId, occurrence = 0) {
        const { tracks = [] } = await this.get(playlistId);
        const cleanTrackId = String(trackId);
        const matches = [];
        tracks.forEach((track, index) => {
            if (String(track.id) === cleanTrackId) matches.push(index);
        });

        const index = matches[Math.max(0, Number(occurrence) || 0)];
        if (index === undefined) return { playlist: null, tracks };
        return this.removeIndexes(playlistId, [index]);
    }

    async replaceTracks(playlistId, tracks) {
        const current = await this.get(playlistId);
        const removeIndexes = current.tracks.map((_, index) => index);
        const songIds = this.trackIds(tracks);

        if (!removeIndexes.length && !songIds.length) return current;

        await this.nativeApi.request('updatePlaylist', {
            playlistId: String(playlistId),
            songIndexToRemove: removeIndexes,
            songIdToAdd: songIds,
        });
        return this.get(playlistId);
    }

    async reorder(playlistId, orderedTracks) {
        return this.replaceTracks(playlistId, orderedTracks);
    }
}

export function createNavidromePlaylistService(api) {
    return new NavidromePlaylistService(api);
}
