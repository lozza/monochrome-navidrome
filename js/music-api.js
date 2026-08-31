// js/music-api.js

import { NavidromeAPI } from './navidrome-api.js';

/**
 * MusicAPI - Singleton class that provides a unified interface for accessing music streaming services.
 *
 * Uses a Navidrome/OpenSubsonic server for searching,
 * retrieving metadata, streaming, and managing playlists, artists, albums, tracks, and podcasts.
 *
 * @class MusicAPI
 * @classdesc Manages API interactions with music providers and provides caching mechanisms
 * for cover artwork and video metadata.
 *
 * @example
 * // Initialize the MusicAPI
 * await MusicAPI.initialize(settings);
 *
 * // Get the singleton instance
 * const api = MusicAPI.instance;
 *
 * // Search for tracks
 * const results = await api.search('query');
 *
 * // Get a specific track
 * const track = await api.getTrack('track-id');
 *
 * // Get stream URL
 * const streamUrl = await api.getStreamUrl('track-id', 'HIGH');
 *
 * @property {NavidromeAPI} navidromeAPI - The Navidrome API instance
 * @property {Object} _settings - Configuration settings
 * @property {Map} videoArtworkCache - Cache for video artwork data
 *
 * @throws {Error} Throws if instance is accessed before initialization
 * @throws {Error} Throws if initialize is called more than once
 */
export class MusicAPI {
    static #instance = null;
    /**
     * @type {MusicAPI}
     */
    static get instance() {
        if (!MusicAPI.#instance) {
            throw new Error('MusicAPI not initialized. Call MusicAPI.initialize(settings) first.');
        }
        return MusicAPI.#instance;
    }

    /** @private */
    constructor(settings) {
        this.navidromeAPI = new NavidromeAPI();
        this._settings = settings;
        this.videoArtworkCache = new Map();
    }

    static async initialize(settings) {
        if (MusicAPI.#instance) {
            throw new Error('MusicAPI is already initialized');
        }

        const api = new MusicAPI(settings);
        return (MusicAPI.#instance = api);
    }

    getCurrentProvider() {
        return 'navidrome';
    }

    isConfigured() {
        return this.getAPI().isConfigured?.() === true;
    }

    async getAlbums(type = 'newest', size = 24, offset = 0) {
        return this.getAPI().getAlbums(type, size, offset);
    }

    async getAllAlbums(pageSize = 500) {
        return this.getAPI().getAllAlbums(pageSize);
    }

    async getRecentTracks(pageSize = 500, limit = 100) {
        return this.getAPI().getRecentTracks(pageSize, limit);
    }

    async scrobble(id, submission = true) {
        return this.getAPI().scrobble(id, submission);
    }

    async getLyrics(id) {
        return this.getAPI().getLyricsBySongId?.(this.stripProviderPrefix(id));
    }

    async getArtists() {
        return this.getAPI().getArtists();
    }

    async enrichArtistsWithPicture(artists) {
        return this.getAPI().enrichArtistsWithPicture?.(artists) || artists;
    }

    async enrichTrack(track) {
        const detailed = await this.getAPI()
            .getTrackMetadata(this.stripProviderPrefix(track.id))
            .catch(() => null);
        return { enrichedTrack: detailed ? { ...track, ...detailed } : track };
    }

    async getPlaylists() {
        return this.getAPI().getPlaylists();
    }

    // Get the appropriate API based on provider
    getAPI() {
        return this.navidromeAPI;
    }

    // Search methods
    async search(query, options = {}) {
        const api = this.getAPI();
        if (typeof api.search === 'function') {
            return api.search(query, options);
        }

        // Fallback for providers that don't implement unified search
        const [tracksResult, videosResult, artistsResult, albumsResult, playlistsResult] = await Promise.all([
            api.searchTracks(query, options),
            api.searchVideos ? api.searchVideos(query, options) : Promise.resolve({ items: [] }),
            api.searchArtists(query, options),
            api.searchAlbums(query, options),
            api.searchPlaylists ? api.searchPlaylists(query, options) : Promise.resolve({ items: [] }),
        ]);

        return {
            tracks: tracksResult,
            videos: videosResult,
            artists: artistsResult,
            albums: albumsResult,
            playlists: playlistsResult,
        };
    }

    async searchTracks(query, options = {}) {
        return this.getAPI().searchTracks(query, options);
    }

    async searchArtists(query, options = {}) {
        return this.getAPI().searchArtists(query, options);
    }

    async searchAlbums(query, options = {}) {
        return this.getAPI().searchAlbums(query, options);
    }

    async searchPlaylists(query, options = {}) {
        return this.getAPI().searchPlaylists(query, options);
    }

    async searchVideos(query, options = {}) {
        return this.getAPI().searchVideos(query, options);
    }

    // Get methods
    async getTrack(id, quality) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        return api.getTrack(cleanId, quality);
    }

    async getTrackMetadata(id) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        return api.getTrackMetadata(cleanId);
    }

    async getAlbum(id) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        return api.getAlbum(cleanId);
    }

    async getArtist(id) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        return api.getArtist(cleanId);
    }

    async getArtistBiography(id) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        if (typeof api.getArtistBiography === 'function') {
            return api.getArtistBiography(cleanId);
        }
        return null;
    }

    async getVideo(id) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        return api.getVideo(cleanId);
    }

    async getVideoStreamUrl(id) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        if (typeof api.getVideoStreamUrl === 'function') {
            return api.getVideoStreamUrl(cleanId);
        }
    }

    async getArtistSocials(artistName) {
        return this.getAPI().getArtistSocials(artistName);
    }

    async getPlaylist(id, _provider = null) {
        return this.getAPI().getPlaylist(id);
    }

    async getMix(id) {
        return this.getAPI().getMix?.(id);
    }

    async getTrackRecommendations(id) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        if (typeof api.getTrackRecommendations === 'function') {
            return api.getTrackRecommendations(cleanId);
        }
        return [];
    }

    // Stream methods
    async getStreamUrl(id, quality) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        return api.getStreamUrl(cleanId, quality);
    }

    async isFavorite(type, id) {
        return this.getAPI().isFavorite?.(type, this.stripProviderPrefix(id)) ?? false;
    }

    async setFavorite(type, id, liked) {
        return this.getAPI().setFavorite?.(type, this.stripProviderPrefix(id), liked);
    }

    usesSingleUsePlaybackUrls() {
        return this.getAPI().usesSingleUsePlaybackUrls?.() === true;
    }

    // Cover/artwork methods
    getCoverUrl(id, size = '320') {
        if (typeof id === 'string' && id.startsWith('blob:')) {
            return id;
        }
        return this.getAPI().getCoverUrl(this.stripProviderPrefix(id), size);
    }

    getCoverSrcset(id) {
        if (typeof id === 'string' && id.startsWith('blob:')) {
            return '';
        }
        return this.getAPI().getCoverSrcset(this.stripProviderPrefix(id));
    }

    getVideoCoverUrl(imageId, size = '1280') {
        if (!imageId) {
            return null;
        }
        if (typeof imageId === 'string' && imageId.startsWith('blob:')) {
            return imageId;
        }
        return this.getAPI().getVideoCoverUrl(this.stripProviderPrefix(imageId), size);
    }

    async getVideoArtwork(title, artist) {
        void title;
        void artist;
        return null;
    }

    getArtistPictureUrl(id, size = '320') {
        return this.getAPI().getArtistPictureUrl(this.stripProviderPrefix(id), size);
    }

    getArtistPictureSrcset(id) {
        return this.getAPI().getArtistPictureSrcset(this.stripProviderPrefix(id));
    }

    async getArtistBanner(artistName) {
        void artistName;
        return null;
    }

    extractStreamUrlFromManifest(manifest) {
        return this.getAPI().extractStreamUrlFromManifest(manifest);
    }

    // Helper methods
    getProviderFromId(id) {
        void id;
        return null;
    }

    stripProviderPrefix(id) {
        return id;
    }

    // Download methods
    async downloadTrack(id, quality, filename, options = {}) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(id);
        return api.downloadTrack(cleanId, quality, filename, options);
    }

    // Similar/recommendation methods
    async getSimilarArtists(artistId) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(artistId);
        return api.getSimilarArtists(cleanId);
    }

    async getArtistTopTracks(artistId, options = {}) {
        return this.getAPI().getArtistTopTracks(artistId, options);
    }

    async getSimilarAlbums(albumId) {
        const api = this.getAPI();
        const cleanId = this.stripProviderPrefix(albumId);
        return api.getSimilarAlbums(cleanId);
    }

    async getRecommendedTracksForPlaylist(tracks, limit = 20, options = {}) {
        return this.getAPI().getRecommendedTracksForPlaylist(tracks, limit, options);
    }

    // Cache methods
    async clearCache() {
        await this.getAPI().clearCache();
    }

    getCacheStats() {
        return this.getAPI().getCacheStats();
    }

    // Settings accessor for compatibility
    get settings() {
        return this._settings;
    }
}

export const musicAPI = new MusicAPI();
