import { db } from './db.js';
import { MusicAPI } from './music-api.js';

function asArray(value) {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
}

async function getNavidromeStarredTracks() {
    const api = MusicAPI.instance?.getAPI?.();
    if (!api?.isConfigured?.() || !api?.request || !api?.mapTrack) return null;

    const root = await api.request('getStarred2');
    return asArray(root.starred2?.song).map((song) => api.mapTrack(song));
}

if (!db.__navidromeStarredCompatInstalled) {
    const originalGetFavorites = db.getFavorites.bind(db);

    db.getFavorites = async function getFavoritesWithNavidrome(type) {
        if (type !== 'track') return originalGetFavorites(type);

        try {
            const starredTracks = await getNavidromeStarredTracks();
            if (starredTracks) return starredTracks;
        } catch (error) {
            console.warn('Could not load starred tracks from Navidrome; using local favorites:', error);
        }

        return originalGetFavorites(type);
    };

    db.__navidromeStarredCompatInstalled = true;
}
