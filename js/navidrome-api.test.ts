import { afterEach, describe, expect, test, vi } from 'vitest';
import md5 from './md5.js';
import { NavidromeAPI } from './navidrome-api.js';

const settings = {
    getUrl: () => 'https://music.example.test/',
    getUsername: () => 'laurence',
    getPassword: () => 'x',
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
        expect(url.searchParams.get('t')).toBe(md5(`x${salt}`));
        expect(url.searchParams.get('p')).toBeNull();
    });

    test('maps search3 songs, albums and artists into Navichrome data shapes', async () => {
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

    test('accepts a successful Navidrome login and reports server identity', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(jsonResponse(subsonic({ openSubsonic: true }))))
        );

        await expect(new NavidromeAPI(settings).ping()).resolves.toEqual({
            ok: true,
            type: 'navidrome',
            version: '0.59.0',
            openSubsonic: true,
        });
    });

    test('reports an unavailable or invalid Navidrome server without hiding the failure', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(new Response('Bad gateway', { status: 502 })))
        );
        await expect(new NavidromeAPI(settings).ping()).rejects.toThrow('HTTP 502');

        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(jsonResponse({ unexpected: true })))
        );
        await expect(new NavidromeAPI(settings).ping()).rejects.toThrow('invalid OpenSubsonic response');
    });

    test('submits native scrobbles and derives recent history from server playback timestamps', async () => {
        const requests: URL[] = [];
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
                requests.push(url);
                if (url.pathname.endsWith('/search3.view')) {
                    return Promise.resolve(
                        jsonResponse(
                            subsonic({
                                searchResult3: {
                                    song: [
                                        {
                                            id: 'older',
                                            title: 'Older',
                                            artist: 'Artist',
                                            played: '2026-08-28T20:00:00Z',
                                        },
                                        { id: 'never', title: 'Never played', artist: 'Artist' },
                                        {
                                            id: 'newer',
                                            title: 'Newer',
                                            artist: 'Artist',
                                            played: '2026-08-29T20:00:00Z',
                                        },
                                    ],
                                },
                            })
                        )
                    );
                }
                return Promise.resolve(jsonResponse(subsonic()));
            })
        );

        const api = new NavidromeAPI(settings);
        await api.scrobble('newer', true);
        const recent = await api.getRecentTracks(500, 20);

        const scrobble = requests.find((url) => url.pathname.endsWith('/scrobble.view'));
        expect(scrobble?.searchParams.get('id')).toBe('newer');
        expect(scrobble?.searchParams.get('submission')).toBe('true');
        expect(scrobble?.searchParams.get('time')).toMatch(/^\d+$/);
        expect(recent.map((track) => track.id)).toEqual(['newer', 'older']);
        expect(recent[0].timestamp).toBeGreaterThan(recent[1].timestamp);
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

    test('browses the complete Navidrome album, artist and playlist library', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((input: RequestInfo | URL) => {
                const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
                if (url.pathname.endsWith('/getAlbumList2.view')) {
                    const offset = Number(url.searchParams.get('offset'));
                    const albums =
                        offset === 0
                            ? [
                                  { id: 'album-b', name: 'Beta', artist: 'Artist B' },
                                  { id: 'album-a', name: 'Alpha', artist: 'Artist A' },
                              ]
                            : [{ id: 'album-c', name: 'Charlie', artist: 'Artist C' }];
                    return Promise.resolve(jsonResponse(subsonic({ albumList2: { album: albums } })));
                }
                if (url.pathname.endsWith('/getArtists.view')) {
                    return Promise.resolve(
                        jsonResponse(
                            subsonic({
                                artists: {
                                    index: [
                                        { name: 'B', artist: [{ id: 'artist-b', name: 'Beta Artist' }] },
                                        { name: 'A', artist: [{ id: 'artist-a', name: 'Alpha Artist' }] },
                                    ],
                                },
                            })
                        )
                    );
                }
                if (url.pathname.endsWith('/getPlaylists.view')) {
                    return Promise.resolve(
                        jsonResponse(
                            subsonic({
                                playlists: {
                                    playlist: [
                                        { id: 'playlist-b', name: 'Road Trip' },
                                        { id: 'playlist-a', name: 'Chill' },
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
        const [albums, artists, playlists] = await Promise.all([
            api.getAllAlbums(2),
            api.getArtists(),
            api.getPlaylists(),
        ]);

        expect(albums.map((album) => album.id)).toEqual(['album-b', 'album-a', 'album-c']);
        expect((artists as Array<{ name: string }>).map((artist) => artist.name)).toEqual([
            'Alpha Artist',
            'Beta Artist',
        ]);
        expect((playlists as Array<{ title: string }>).map((playlist) => playlist.title)).toEqual([
            'Chill',
            'Road Trip',
        ]);
    });
});
