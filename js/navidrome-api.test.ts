import { afterEach, describe, expect, test, vi } from 'vitest';
import md5 from './md5.js';
import { NavidromeAPI } from './navidrome-api.js';

const settings = {
    getUrl: () => 'https://music.example.test/',
    getUsername: () => 'laurence',
    getPassword: () => 'correct horse battery staple',
};

function jsonResponse(payload: object) {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function subsonic(payload: object = {}) {
    return {
        'subsonic-response': {
            status: 'ok',
            version: '1.16.1',
            type: 'navidrome',
            serverVersion: '0.59.0',
            ...payload,
        },
    };
}

afterEach(() => vi.unstubAllGlobals());

describe('NavidromeAPI', () => {
    test('uses salted token authentication and never puts the password in a request URL', () => {
        const api = new NavidromeAPI(settings);
        const url = new URL(api.buildUrl('ping'));
        const salt = url.searchParams.get('s');

        expect(url.origin).toBe('https://music.example.test');
        expect(url.pathname).toBe('/rest/ping.view');
        expect(url.searchParams.get('u')).toBe('laurence');
        expect(url.searchParams.get('t')).toBe(md5(`correct horse battery staple${salt}`));
        expect(url.searchParams.get('p')).toBeNull();
        expect(url.toString()).not.toContain('correct%20horse');
    });

    test('maps search3 songs, albums and artists into Monochrome data shapes', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
                if (url.pathname.endsWith('/search3.view')) {
                    return Promise.resolve(
                        jsonResponse(
                            subsonic({
                                searchResult3: {
                                    artist: [{ id: 'artist-hash', name: 'Tone Stith', coverArt: 'artist-cover' }],
                                    album: [
                                        {
                                            id: 'album-uuid',
                                            name: 'FWM',
                                            artist: 'Tone Stith',
                                            artistId: 'artist-hash',
                                            coverArt: 'album-cover',
                                            year: 2021,
                                            songCount: 9,
                                        },
                                    ],
                                    song: [
                                        {
                                            id: 'track-hash',
                                            title: 'Lonely',
                                            artist: 'Tone Stith',
                                            artistId: 'artist-hash',
                                            album: 'FWM',
                                            albumId: 'album-uuid',
                                            coverArt: 'album-cover',
                                            duration: 201,
                                            suffix: 'flac',
                                        },
                                    ],
                                },
                            })
                        )
                    );
                }
                return Promise.resolve(jsonResponse(subsonic({ playlists: { playlist: [] } })));
            })
        );

        const result = (await new NavidromeAPI(settings).search('Tone Stith')) as {
            tracks: { items: Array<Record<string, unknown>> };
            albums: { items: Array<Record<string, unknown>> };
            artists: { items: Array<Record<string, unknown>> };
        };

        expect(result.tracks.items[0]).toMatchObject({
            id: 'track-hash',
            title: 'Lonely',
            audioQuality: 'LOSSLESS',
            artist: { id: 'artist-hash', name: 'Tone Stith' },
            album: { id: 'album-uuid', title: 'FWM', cover: 'album-cover' },
        });
        expect(result.albums.items[0]).toMatchObject({
            id: 'album-uuid',
            title: 'FWM',
            numberOfTracks: 9,
        });
        expect(result.artists.items[0]).toMatchObject({ id: 'artist-hash', picture: 'artist-cover' });
    });

    test('returns album tracks and an authenticated direct stream URL', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
                if (url.pathname.endsWith('/getAlbum.view')) {
                    return Promise.resolve(
                        jsonResponse(
                            subsonic({
                                album: {
                                    id: 'album-uuid',
                                    name: 'FWM',
                                    artist: 'Tone Stith',
                                    artistId: 'artist-hash',
                                    song: [
                                        {
                                            id: 'track-hash',
                                            title: 'Lonely',
                                            artist: 'Tone Stith',
                                            artistId: 'artist-hash',
                                            album: 'FWM',
                                            albumId: 'album-uuid',
                                            contentType: 'audio/flac',
                                        },
                                    ],
                                },
                            })
                        )
                    );
                }
                throw new Error(`Unexpected URL ${url}`);
            })
        );

        const api = new NavidromeAPI(settings);
        const album = await api.getAlbum('album-uuid');
        const stream = await api.getStreamUrl('track-hash');
        const streamUrl = new URL(stream.url);

        expect(album.tracks).toHaveLength(1);
        expect(album.tracks[0].id).toBe('track-hash');
        expect(stream).toMatchObject({ playbackType: 'direct', mimeType: 'audio/flac', provider: 'navidrome' });
        expect(streamUrl.pathname).toBe('/rest/stream.view');
        expect(streamUrl.searchParams.get('id')).toBe('track-hash');
        expect(streamUrl.searchParams.get('t')).toBeTruthy();
    });

    test('surfaces OpenSubsonic errors', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve(
                    jsonResponse({
                        'subsonic-response': {
                            status: 'failed',
                            version: '1.16.1',
                            error: { code: 40, message: 'Wrong username or password' },
                        },
                    })
                )
            )
        );

        await expect(new NavidromeAPI(settings).ping()).rejects.toThrow('Wrong username or password');
    });

    test('reads and updates native Navidrome stars', async () => {
        const calls: string[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
                calls.push(url.pathname);
                if (url.pathname.endsWith('/getStarred2.view')) {
                    return Promise.resolve(
                        jsonResponse(subsonic({ starred2: { song: [{ id: 'liked-track' }], album: [], artist: [] } }))
                    );
                }
                return Promise.resolve(jsonResponse(subsonic()));
            })
        );

        const api = new NavidromeAPI(settings);
        expect(await api.isFavorite('track', 'liked-track')).toBe(true);
        await api.setFavorite('track', 'new-track', true);
        expect(await api.isFavorite('track', 'new-track')).toBe(true);
        await api.setFavorite('track', 'liked-track', false);
        expect(await api.isFavorite('track', 'liked-track')).toBe(false);
        expect(calls.filter((path) => path.endsWith('/getStarred2.view'))).toHaveLength(1);
        expect(calls).toContain('/rest/star.view');
        expect(calls).toContain('/rest/unstar.view');
    });
});
