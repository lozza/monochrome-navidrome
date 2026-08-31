const DEFAULT_TRACKS = [
    song('track-1', 'Alpha Song', 'album-1', 'First Album', 'artist-1', 'Alice'),
    song('track-2', 'Beta Song', 'album-2', 'Second Album', 'artist-2', 'Bob'),
];

function song(id, title, albumId, album, artistId, artist, extra = {}) {
    return {
        id,
        title,
        albumId,
        album,
        artistId,
        artist,
        coverArt: `cover-${albumId}`,
        duration: 240,
        suffix: 'mp3',
        contentType: 'audio/mpeg',
        ...extra,
    };
}

function ok(payload = {}) {
    return {
        'subsonic-response': {
            status: 'ok',
            version: '1.16.1',
            type: 'navidrome',
            serverVersion: '0.59.0',
            openSubsonic: true,
            ...payload,
        },
    };
}

function failed(message = 'Wrong username or password') {
    return {
        'subsonic-response': {
            status: 'failed',
            version: '1.16.1',
            error: { code: 40, message },
        },
    };
}

function json(route, payload) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
}

function silentWav(seconds = 8) {
    const sampleRate = 8000;
    const dataLength = sampleRate * seconds * 2;
    const buffer = Buffer.alloc(44 + dataLength);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVEfmt ', 8);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

export async function installNavidromeMock(page, options = {}) {
    const state = { singlesPageRequests: 0, scrobbles: [], rejectLogin: false, optionalRequests: [] };
    const largeSinglesCount = options.largeSinglesCount || 0;

    await page.addInitScript(() => {
        if (!localStorage.getItem('__navichromeFixtureSeeded')) {
            localStorage.setItem('navidrome-url', '/navidrome');
            localStorage.setItem('navidrome-username', 'beta-listener');
            localStorage.setItem('navidrome-password', 'x');
            localStorage.setItem('__navichromeFixtureSeeded', 'true');
        }
    });

    await page.route('https://lrclib.net/**', (route) => route.abort('failed'));
    for (const pattern of [
        'https://api.github.com/**',
        'https://raw.githubusercontent.com/**',
        'https://cdn.jsdelivr.net/**',
    ]) {
        await page.route(pattern, (route) => {
            state.optionalRequests.push(route.request().url());
            return route.abort('failed');
        });
    }
    await page.route('**/navidrome/rest/**', async (route) => {
        const url = new URL(route.request().url());
        const endpoint = url.pathname
            .split('/')
            .at(-1)
            ?.replace(/\.view$/, '');

        if (endpoint === 'stream') {
            return route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() });
        }
        if (endpoint === 'download') {
            return route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from('download-fixture') });
        }
        if (endpoint === 'getCoverArt') {
            if (options.missingArtwork) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({
                status: 200,
                contentType: 'image/svg+xml',
                body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#5762d5"/></svg>',
            });
        }
        if (endpoint === 'ping') {
            return json(route, state.rejectLogin ? failed() : ok());
        }
        if (endpoint === 'getAlbumList2') {
            const offset = Number(url.searchParams.get('offset') || 0);
            const albums =
                offset === 0
                    ? [
                          {
                              id: 'album-1',
                              name: 'First Album',
                              artist: 'Alice',
                              artistId: 'artist-1',
                              coverArt: 'cover-album-1',
                              songCount: 8,
                              year: 2026,
                          },
                          {
                              id: 'album-2',
                              name: 'Second Album',
                              artist: 'Bob',
                              artistId: 'artist-2',
                              coverArt: 'cover-album-2',
                              songCount: 10,
                              year: 2025,
                          },
                      ]
                    : [];
            return json(route, ok({ albumList2: { album: albums } }));
        }
        if (endpoint === 'getArtists') {
            return json(
                route,
                ok({
                    artists: {
                        index: [
                            { name: 'A', artist: [{ id: 'artist-1', name: 'Alice', coverArt: 'artist-1' }] },
                            { name: 'B', artist: [{ id: 'artist-2', name: 'Bob', coverArt: 'artist-2' }] },
                        ],
                    },
                })
            );
        }
        if (endpoint === 'getPlaylists') {
            return json(route, ok({ playlists: { playlist: [{ id: 'playlist-1', name: 'Beta Mix', songCount: 2 }] } }));
        }
        if (endpoint === 'getStarred2') {
            return json(route, ok({ starred2: { song: [DEFAULT_TRACKS[0]], album: [], artist: [] } }));
        }
        if (endpoint === 'search3') {
            const query = url.searchParams.get('query');
            if (query === '""' && largeSinglesCount) {
                state.singlesPageRequests += 1;
                const offset = Number(url.searchParams.get('songOffset') || 0);
                const count = Number(url.searchParams.get('songCount') || 1000);
                const end = Math.min(offset + count, largeSinglesCount);
                const songs = [];
                for (let index = offset; index < end; index += 1) {
                    songs.push(
                        song(
                            `catalogue-${index}`,
                            `Track ${String(index).padStart(5, '0')}`,
                            `album-${index % 200}`,
                            `Album ${index % 200}`,
                            `artist-${index % 40}`,
                            `Artist ${index % 40}`
                        )
                    );
                }
                return json(route, ok({ searchResult3: { song: songs } }));
            }

            return json(route, ok({ searchResult3: { song: DEFAULT_TRACKS, album: [], artist: [] } }));
        }
        if (endpoint === 'getAlbum') {
            const id = url.searchParams.get('id');
            const matching = DEFAULT_TRACKS.filter((track) => track.albumId === id).map((track) =>
                options.missingArtwork ? { ...track, coverArt: undefined } : track
            );
            return json(
                route,
                ok({
                    album: {
                        id,
                        name: id === 'album-2' ? 'Second Album' : 'First Album',
                        artist: id === 'album-2' ? 'Bob' : 'Alice',
                        artistId: id === 'album-2' ? 'artist-2' : 'artist-1',
                        coverArt: options.missingArtwork ? undefined : `cover-${id}`,
                        song: matching,
                    },
                })
            );
        }
        if (endpoint === 'getArtist') {
            return json(route, ok({ artist: { id: 'artist-1', name: 'Alice', album: [] } }));
        }
        if (endpoint === 'getPlaylist') {
            return json(route, ok({ playlist: { id: 'playlist-1', name: 'Beta Mix', entry: DEFAULT_TRACKS } }));
        }
        if (endpoint === 'getSong') {
            return json(
                route,
                ok({
                    song: DEFAULT_TRACKS.find((track) => track.id === url.searchParams.get('id')) || DEFAULT_TRACKS[0],
                })
            );
        }
        if (endpoint === 'getLyricsBySongId') {
            return json(route, ok({ lyricsList: { structuredLyrics: [] } }));
        }
        if (endpoint === 'scrobble') {
            state.scrobbles.push({
                id: url.searchParams.get('id'),
                submission: url.searchParams.get('submission'),
            });
            return json(route, ok());
        }

        return json(route, ok());
    });

    return state;
}
