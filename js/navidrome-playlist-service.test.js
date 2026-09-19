import { describe, expect, test, vi } from 'vitest';
import { NavidromePlaylistService } from './navidrome-playlist-service.js';

function makeApi({ playlistTracks = [] } = {}) {
    const requests = [];
    let tracks = [...playlistTracks];
    const api = {
        username: 'laurence',
        async request(method, params) {
            requests.push({ method, params });
            if (method === 'createPlaylist') {
                tracks = (params.songId || []).map((id) => ({ id }));
                return { playlist: { id: 'playlist-1', name: params.name, owner: 'laurence' } };
            }
            if (method === 'updatePlaylist') {
                const remove = [...(params.songIndexToRemove || [])].sort((a, b) => b - a);
                remove.forEach((index) => tracks.splice(index, 1));
                for (const id of params.songIdToAdd || []) tracks.push({ id });
            }
            return {};
        },
        async getPlaylists() {
            return [{ id: 'playlist-1', name: 'Road Trip', owner: 'laurence' }];
        },
        async getPlaylist(id) {
            return {
                playlist: { id, name: 'Road Trip', owner: 'laurence' },
                tracks: tracks.map((track) => ({ ...track })),
            };
        },
    };
    return { api, requests };
}

describe('NavidromePlaylistService', () => {
    test('creates a real server playlist with repeated song IDs and metadata', async () => {
        const { api, requests } = makeApi();
        const service = new NavidromePlaylistService(api);

        const result = await service.create(
            'Driving',
            [{ id: 'song-a' }, { id: 'song-b' }, { id: 'local', isLocal: true }],
            { comment: 'Car playlist', public: false }
        );

        expect(requests[0]).toEqual({
            method: 'createPlaylist',
            params: { name: 'Driving', songId: ['song-a', 'song-b'] },
        });
        expect(requests[1]).toEqual({
            method: 'updatePlaylist',
            params: { playlistId: 'playlist-1', comment: 'Car playlist', public: false },
        });
        expect(result.tracks.map((track) => track.id)).toEqual(['song-a', 'song-b']);
    });

    test('renames and updates playlist metadata in Navidrome', async () => {
        const { api, requests } = makeApi();
        const service = new NavidromePlaylistService(api);

        await service.updateMetadata('playlist-1', {
            name: 'New Name',
            comment: 'Updated description',
            public: true,
        });

        expect(requests[0]).toEqual({
            method: 'updatePlaylist',
            params: {
                playlistId: 'playlist-1',
                name: 'New Name',
                comment: 'Updated description',
                public: true,
            },
        });
    });

    test('adds multiple tracks with one OpenSubsonic update', async () => {
        const { api, requests } = makeApi({ playlistTracks: [{ id: 'existing' }] });
        const service = new NavidromePlaylistService(api);

        const result = await service.addTracks('playlist-1', [{ id: 'song-a' }, { id: 'song-b' }]);

        expect(requests[0]).toEqual({
            method: 'updatePlaylist',
            params: { playlistId: 'playlist-1', songIdToAdd: ['song-a', 'song-b'] },
        });
        expect(result.tracks.map((track) => track.id)).toEqual(['existing', 'song-a', 'song-b']);
    });

    test('removes a requested track occurrence by server playlist index', async () => {
        const { api, requests } = makeApi({
            playlistTracks: [{ id: 'same' }, { id: 'other' }, { id: 'same' }],
        });
        const service = new NavidromePlaylistService(api);

        const result = await service.removeTrack('playlist-1', 'same', 1);

        expect(requests[0]).toEqual({
            method: 'updatePlaylist',
            params: { playlistId: 'playlist-1', songIndexToRemove: [2] },
        });
        expect(result.tracks.map((track) => track.id)).toEqual(['same', 'other']);
    });

    test('reorders by replacing server playlist entries without local persistence', async () => {
        const { api, requests } = makeApi({
            playlistTracks: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        });
        const service = new NavidromePlaylistService(api);

        const result = await service.reorder('playlist-1', [{ id: 'c' }, { id: 'a' }, { id: 'b' }]);

        expect(requests[0]).toEqual({
            method: 'updatePlaylist',
            params: {
                playlistId: 'playlist-1',
                songIndexToRemove: [0, 1, 2],
                songIdToAdd: ['c', 'a', 'b'],
            },
        });
        expect(result.tracks.map((track) => track.id)).toEqual(['c', 'a', 'b']);
    });

    test('deletes the Navidrome playlist and respects ownership metadata', async () => {
        const { api, requests } = makeApi();
        const service = new NavidromePlaylistService(api);
        const requestSpy = vi.spyOn(api, 'request');

        expect(service.canEdit({ owner: 'laurence' })).toBe(true);
        expect(service.canEdit({ owner: 'someone-else' })).toBe(false);

        await service.delete('playlist-1');
        expect(requestSpy).toHaveBeenCalledWith('deletePlaylist', { id: 'playlist-1' });
        expect(requests.at(-1)).toEqual({ method: 'deletePlaylist', params: { id: 'playlist-1' } });
    });
});
