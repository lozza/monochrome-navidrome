import md5 from './md5.js';
import { navidromeSettings } from './navidrome-settings.js';

const API_VERSION = '1.16.1';
const CLIENT_NAME = 'navichrome';

const emptyResult = () => ({ items: [], limit: 0, offset: 0, totalNumberOfItems: 0 });

function asArray(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
}

function formatResult(items, limit = items.length, offset = 0) {
    return { items, limit, offset, totalNumberOfItems: items.length };
}

function normalizeBaseUrl(value) {
    return String(value || '')
        .trim()
        .replace(/\/+$/, '');
}

function randomSalt() {
    const bytes = new Uint8Array(12);
    globalThis.crypto?.getRandomValues?.(bytes);
    if (bytes.every((byte) => byte === 0)) {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function qualityFromSong(song = {}) {
    if (Number(song.bitDepth) > 16 || Number(song.samplingRate) > 48000) return 'HI_RES_LOSSLESS';
    const suffix = String(song.suffix || song.transcodedSuffix || '').toLowerCase();
    if (['flac', 'alac', 'wav', 'aiff', 'aif'].includes(suffix) || String(song.contentType).includes('flac')) {
        return 'LOSSLESS';
    }
    if (Number(song.bitRate) > 192) return 'HIGH';
    return 'LOW';
}

/**
 * Adapts Navidrome's OpenSubsonic responses to the data shape consumed by
 * Monochrome's existing UI. IDs deliberately remain strings: Navidrome IDs are
 * hashes/UUIDs and must never be coerced to numbers.
 */
export class NavidromeAPI {
    constructor(settings = navidromeSettings) {
        this.settings = settings;
        this.cache = new Map();
        this.trackCache = new Map();
        this.favoriteCache = null;
        this.favoriteCachePromise = null;
    }

    get baseUrl() {
        return normalizeBaseUrl(this.settings.getUrl());
    }

    get username() {
        return String(this.settings.getUsername() || '').trim();
    }

    get password() {
        return String(this.settings.getPassword() || '');
    }

    isConfigured() {
        return Boolean(this.baseUrl && this.username && this.password);
    }

    // Compatibility for existing startup code when an old unified-playback
    // preference is still present in localStorage.
    async getUnifiedTurnstileJwt() {
        return null;
    }

    buildAuthParams() {
        const salt = randomSalt();
        return {
            u: this.username,
            s: salt,
            t: md5(`${this.password}${salt}`),
            v: API_VERSION,
            c: CLIENT_NAME,
            f: 'json',
        };
    }

    buildUrl(method, params = {}) {
        if (!this.isConfigured()) {
            throw new Error('Connect Navidrome in Settings > Instances first.');
        }

        const query = new URLSearchParams(this.buildAuthParams());
        for (const [key, value] of Object.entries(params)) {
            if (value === undefined || value === null || value === '') continue;
            for (const item of asArray(value)) query.append(key, String(item));
        }
        return `${this.baseUrl}/rest/${method}.view?${query}`;
    }

    async request(method, params = {}, options = {}) {
        const response = await fetch(this.buildUrl(method, params), {
            method: options.method || 'GET',
            signal: options.signal,
        });
        if (!response.ok) {
            throw new Error(`Navidrome request failed: HTTP ${response.status}`);
        }

        const json = await response.json();
        const root = json['subsonic-response'];
        if (!root) throw new Error('Navidrome returned an invalid OpenSubsonic response.');
        if (root.status !== 'ok') {
            const message = root.error?.message || `OpenSubsonic error ${root.error?.code || 'unknown'}`;
            throw new Error(message);
        }
        return root;
    }

    async ping() {
        const root = await this.request('ping');
        return {
            ok: true,
            type: root.type || 'Navidrome',
            version: root.serverVersion || root.version,
            openSubsonic: root.openSubsonic === true,
        };
    }

    mapArtist(raw = {}) {
        return {
            ...raw,
            id: String(raw.id || ''),
            name: raw.name || 'Unknown Artist',
            picture: raw.coverArt || raw.artistImageUrl || raw.id || null,
            type: 'ARTIST',
            numberOfAlbums: raw.albumCount || 0,
        };
    }

    mapAlbum(raw = {}) {
        const artist = this.mapArtist({ id: raw.artistId || '', name: raw.artist || 'Unknown Artist' });
        const releaseDate = raw.year ? `${raw.year}-01-01` : raw.originalReleaseDate || raw.releaseDate;
        return {
            ...raw,
            id: String(raw.id || ''),
            title: raw.name || raw.title || 'Unknown Album',
            name: raw.name || raw.title || 'Unknown Album',
            artist,
            artists: [artist],
            cover: raw.coverArt || raw.id || null,
            releaseDate,
            duration: raw.duration || 0,
            numberOfTracks: raw.songCount || asArray(raw.song).length,
            numberOfVideos: 0,
            numberOfVolumes: raw.discTitles?.length || 1,
            audioQuality: 'LOSSLESS',
            audioModes: ['STEREO'],
            allowStreaming: true,
            streamReady: true,
            explicit: false,
            type: 'ALBUM',
        };
    }

    mapTrack(raw = {}) {
        const artist = this.mapArtist({ id: raw.artistId || '', name: raw.artist || 'Unknown Artist' });
        const album = {
            id: String(raw.albumId || ''),
            title: raw.album || 'Unknown Album',
            name: raw.album || 'Unknown Album',
            cover: raw.coverArt || raw.albumId || null,
            releaseDate: raw.year ? `${raw.year}-01-01` : raw.originalReleaseDate || raw.releaseDate,
            artist,
        };
        const replayGain = raw.replayGain || {};
        const track = {
            ...raw,
            id: String(raw.id || ''),
            title: raw.title || 'Unknown Track',
            artist,
            artists: [artist],
            album,
            duration: Number(raw.duration) || 0,
            trackNumber: Number(raw.track) || 0,
            volumeNumber: Number(raw.discNumber) || 1,
            streamStartDate: raw.year ? `${raw.year}-01-01` : raw.created || album.releaseDate,
            audioQuality: qualityFromSong(raw),
            audioModes: ['STEREO'],
            mediaMetadata: { tags: [] },
            replayGain: replayGain.trackGain ?? 0,
            peak: replayGain.trackPeak ?? 1,
            albumReplayGain: replayGain.albumGain ?? 0,
            albumPeakAmplitude: replayGain.albumPeak ?? 1,
            allowStreaming: true,
            isUnavailable: false,
            explicit: false,
            type: 'track',
            navidrome: raw,
        };
        this.trackCache.set(track.id, track);
        return track;
    }

    mapPlaylist(raw = {}) {
        return {
            ...raw,
            id: String(raw.id || ''),
            uuid: String(raw.id || ''),
            name: raw.name || 'Untitled Playlist',
            title: raw.name || 'Untitled Playlist',
            description: raw.comment || '',
            duration: raw.duration || 0,
            numberOfTracks: raw.songCount || asArray(raw.entry).length,
            cover: raw.coverArt || null,
            squareImage: raw.coverArt || null,
            type: 'PLAYLIST',
        };
    }

    async search(query, options = {}) {
        const limit = Number(options.limit) || 30;
        const offset = Number(options.offset) || 0;
        const root = await this.request(
            'search3',
            {
                query,
                artistCount: limit,
                artistOffset: offset,
                albumCount: limit,
                albumOffset: offset,
                songCount: limit,
                songOffset: offset,
            },
            options
        );
        const result = root.searchResult3 || {};
        const [playlists, videos] = await Promise.all([
            this.searchPlaylists(query, options).catch(() => emptyResult()),
            Promise.resolve(emptyResult()),
        ]);
        return {
            tracks: formatResult(
                asArray(result.song).map((song) => this.mapTrack(song)),
                limit,
                offset
            ),
            artists: formatResult(
                asArray(result.artist).map((artist) => this.mapArtist(artist)),
                limit,
                offset
            ),
            albums: formatResult(
                asArray(result.album).map((album) => this.mapAlbum(album)),
                limit,
                offset
            ),
            playlists,
            videos,
        };
    }

    async searchTracks(query, options = {}) {
        return (await this.search(query, options)).tracks;
    }

    async searchArtists(query, options = {}) {
        return (await this.search(query, options)).artists;
    }

    async searchAlbums(query, options = {}) {
        return (await this.search(query, options)).albums;
    }

    async searchPlaylists(query, options = {}) {
        const root = await this.request('getPlaylists', {}, options);
        const normalizedQuery = String(query || '')
            .trim()
            .toLocaleLowerCase();
        const all = asArray(root.playlists?.playlist).map((playlist) => this.mapPlaylist(playlist));
        const items = normalizedQuery
            ? all.filter((playlist) => playlist.name.toLocaleLowerCase().includes(normalizedQuery))
            : all;
        return formatResult(items, items.length, 0);
    }

    async searchVideos() {
        return emptyResult();
    }

    async getAlbums(type = 'newest', size = 24, offset = 0) {
        const root = await this.request('getAlbumList2', { type, size, offset });
        return asArray(root.albumList2?.album).map((album) => this.mapAlbum(album));
    }

    async getAllAlbums(pageSize = 500) {
        const albums = [];
        let offset = 0;

        while (true) {
            const batch = await this.getAlbums('alphabeticalByName', pageSize, offset);
            albums.push(...batch);
            if (batch.length < pageSize) break;
            offset += batch.length;
        }

        return albums;
    }

    async getRecentTracks(pageSize = 500, limit = 100) {
        const tracks = [];
        let offset = 0;

        while (true) {
            const root = await this.request('search3', {
                query: '""',
                artistCount: 0,
                albumCount: 0,
                songCount: pageSize,
                songOffset: offset,
            });
            const songs = asArray(root.searchResult3?.song);
            tracks.push(...songs);
            if (songs.length < pageSize) break;
            offset += songs.length;
        }

        return tracks
            .filter((song) => song.played)
            .sort((a, b) => new Date(b.played).getTime() - new Date(a.played).getTime())
            .slice(0, limit)
            .map((song) => ({ ...this.mapTrack(song), timestamp: new Date(song.played).getTime() }));
    }

    async scrobble(id, submission = true) {
        await this.request('scrobble', {
            id: String(id),
            submission,
            time: Date.now(),
        });
    }

    async getLyricsBySongId(id) {
        const root = await this.request('getLyricsBySongId', { id });
        return root.lyricsList || null;
    }

    async getArtists() {
        const root = await this.request('getArtists');
        return asArray(root.artists?.index)
            .flatMap((index) => asArray(index.artist))
            .map((artist) => this.mapArtist(artist))
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }

    async getPlaylists() {
        const root = await this.request('getPlaylists');
        return asArray(root.playlists?.playlist)
            .map((playlist) => this.mapPlaylist(playlist))
            .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    }

    async getTrackMetadata(id) {
        const cleanId = String(id);
        if (this.trackCache.has(cleanId)) return this.trackCache.get(cleanId);
        const root = await this.request('getSong', { id: cleanId });
        if (!root.song) throw new Error('Track not found');
        return this.mapTrack(root.song);
    }

    async getTrack(id) {
        const track = await this.getTrackMetadata(id);
        return { track, info: track };
    }

    async getAlbum(id) {
        const root = await this.request('getAlbum', { id });
        if (!root.album) throw new Error('Album not found');
        return {
            album: this.mapAlbum(root.album),
            tracks: asArray(root.album.song).map((song) => this.mapTrack(song)),
        };
    }

    async getArtist(id) {
        const root = await this.request('getArtist', { id });
        if (!root.artist) throw new Error('Artist not found');
        const artist = this.mapArtist(root.artist);
        const albums = asArray(root.artist.album).map((album) => this.mapAlbum(album));
        const top = await this.request('getTopSongs', { artist: artist.name, count: 50 }).catch(() => null);
        const topTracks = asArray(top?.topSongs?.song).map((song) => this.mapTrack(song));
        return {
            ...artist,
            albums,
            eps: albums.filter((album) => ['ep', 'single'].includes(String(album.albumType || '').toLowerCase())),
            topTracks,
            tracks: topTracks,
            videos: [],
            mixes: {},
        };
    }

    async getPlaylist(id) {
        const root = await this.request('getPlaylist', { id });
        if (!root.playlist) throw new Error('Playlist not found');
        const playlist = this.mapPlaylist(root.playlist);
        const tracks = asArray(root.playlist.entry).map((song) => this.mapTrack(song));
        return { playlist: { ...playlist, tracks }, tracks };
    }

    async getArtistInfo(id) {
        const root = await this.request('getArtistInfo2', { id, count: 20, includeNotPresent: false });
        return root.artistInfo2 || {};
    }

    async getArtistBiography(id) {
        const info = await this.getArtistInfo(id).catch(() => null);
        return info?.biography ? { text: info.biography, source: 'Navidrome metadata' } : null;
    }

    async getSimilarArtists(id) {
        const info = await this.getArtistInfo(id).catch(() => null);
        return asArray(info?.similarArtist).map((artist) => this.mapArtist(artist));
    }

    async getArtistTopTracks(id, options = {}) {
        const artist = await this.getArtist(id);
        const offset = Number(options.offset) || 0;
        const limit = Number(options.limit) || 50;
        const tracks = artist.topTracks.slice(offset, offset + limit);
        return { tracks, offset, limit, hasMore: artist.topTracks.length > offset + limit };
    }

    async getSimilarAlbums() {
        return this.getAlbums('random', 12);
    }

    async getTrackRecommendations(id) {
        const track = await this.getTrackMetadata(id);
        if (!track.artist?.id) return [];
        const root = await this.request('getSimilarSongs2', { id: track.artist.id, count: 25 }).catch(() => null);
        return asArray(root?.similarSongs2?.song)
            .filter((song) => String(song.id) !== String(id))
            .map((song) => this.mapTrack(song));
    }

    async getRecommendedTracksForPlaylist(tracks, limit = 20) {
        const seen = new Set(asArray(tracks).map((track) => String(track.id)));
        const recommendations = [];
        for (const seed of asArray(tracks).slice(0, 3)) {
            const items = await this.getTrackRecommendations(seed.id).catch(() => []);
            for (const track of items) {
                if (!seen.has(track.id)) {
                    seen.add(track.id);
                    recommendations.push(track);
                }
                if (recommendations.length >= limit) return recommendations;
            }
        }
        return recommendations;
    }

    async loadFavorites() {
        if (this.favoriteCache) return this.favoriteCache;
        if (this.favoriteCachePromise) return this.favoriteCachePromise;

        this.favoriteCachePromise = this.request('getStarred2')
            .then((root) => {
                const starred = root.starred2 || {};
                this.favoriteCache = {
                    track: new Set(asArray(starred.song).map((item) => String(item.id))),
                    album: new Set(asArray(starred.album).map((item) => String(item.id))),
                    artist: new Set(asArray(starred.artist).map((item) => String(item.id))),
                };
                return this.favoriteCache;
            })
            .finally(() => {
                this.favoriteCachePromise = null;
            });
        return this.favoriteCachePromise;
    }

    async isFavorite(type, id) {
        if (!['track', 'album', 'artist'].includes(type)) return false;
        const favorites = await this.loadFavorites();
        return favorites[type].has(String(id));
    }

    async setFavorite(type, id, liked) {
        const param = type === 'track' ? 'id' : type === 'album' ? 'albumId' : type === 'artist' ? 'artistId' : null;
        if (!param) return;
        await this.request(liked ? 'star' : 'unstar', { [param]: id });
        const favorites = await this.loadFavorites();
        if (liked) favorites[type].add(String(id));
        else favorites[type].delete(String(id));
    }

    getCoverUrl(id, size = '320') {
        if (!id) return '';
        if (/^(?:blob:|data:|https?:)/i.test(String(id))) return String(id);
        return this.buildUrl('getCoverArt', { id, size: Number.parseInt(size, 10) || 320 });
    }

    getCoverSrcset(id) {
        if (!id || /^(?:blob:|data:|https?:)/i.test(String(id))) return '';
        return [160, 320, 640, 1280].map((size) => `${this.getCoverUrl(id, size)} ${size}w`).join(', ');
    }

    getArtistPictureUrl(id, size = '320') {
        return this.getCoverUrl(id, size);
    }

    getArtistPictureSrcset(id) {
        return this.getCoverSrcset(id);
    }

    async enrichArtistsWithPicture(artists) {
        return artists;
    }

    async getStreamUrl(id, quality = 'LOSSLESS') {
        const maxBitRate = quality === 'LOW' ? 96 : quality === 'HIGH' ? 320 : undefined;
        const track = await this.getTrackMetadata(id).catch(() => null);
        return {
            url: this.buildUrl('stream', { id, maxBitRate, estimateContentLength: true }),
            playbackType: 'direct',
            mimeType: track?.contentType || 'audio/mpeg',
            provider: 'navidrome',
            rgInfo: track
                ? {
                      trackReplayGain: track.replayGain || 0,
                      trackPeakAmplitude: track.peak || 1,
                      albumReplayGain: track.albumReplayGain || 0,
                      albumPeakAmplitude: track.albumPeakAmplitude || 1,
                  }
                : null,
        };
    }

    usesSingleUsePlaybackUrls() {
        return false;
    }

    async downloadTrack(id, _quality, _filename, options = {}) {
        const response = await fetch(this.buildUrl('download', { id }), { signal: options.signal });
        if (!response.ok) throw new Error(`Navidrome download failed: HTTP ${response.status}`);
        return response.blob();
    }

    async clearCache() {
        this.cache.clear();
        this.trackCache.clear();
        this.favoriteCache = null;
        this.favoriteCachePromise = null;
    }

    getCacheStats() {
        return { entries: this.cache.size + this.trackCache.size, streamUrls: 0 };
    }

    getArtistSocials() {
        return [];
    }

    getVideoCoverUrl() {
        return '';
    }

    extractStreamUrlFromManifest(manifest) {
        return manifest;
    }
}
