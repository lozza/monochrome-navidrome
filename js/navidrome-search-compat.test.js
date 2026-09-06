import { describe, expect, it } from 'vitest';
import { NavidromeAPI } from './navidrome-api.js';
import './navidrome-search-compat.js';

describe('Navidrome search compatibility', () => {
    it('hides duplicate search rows for the same song even when Navidrome gives them different ids', async () => {
        const api = Object.create(NavidromeAPI.prototype);
        const originalSearch = Reflect.get(NavidromeAPI.prototype, 'search');

        NavidromeAPI.prototype.search = async () => ({
            tracks: {
                items: [
                    {
                        id: 'first-id',
                        title: 'Dance With My Father',
                        artist: { name: 'Luther Vandross' },
                        album: { title: 'Dance With My Father' },
                        trackNumber: 5,
                        volumeNumber: 1,
                        duration: 266,
                        navidrome: { path: 'Luther Vandross/Dance With My Father/05 Dance With My Father.flac' },
                    },
                    {
                        id: 'second-id',
                        title: 'Dance With My Father',
                        artist: { name: 'Luther Vandross' },
                        album: { title: 'Dance With My Father' },
                        trackNumber: 5,
                        volumeNumber: 1,
                        duration: 266,
                        navidrome: { path: 'Luther Vandross/Dance With My Father/05 Dance With My Father.flac' },
                    },
                ],
                limit: 30,
                offset: 0,
                totalNumberOfItems: 2,
            },
            artists: { items: [] },
            albums: { items: [] },
            playlists: { items: [] },
            videos: { items: [] },
        });

        try {
            const result = await api.searchTracks('dance with my father');
            expect(result.items).toHaveLength(1);
            expect(result.items[0].title).toBe('Dance With My Father');
        } finally {
            NavidromeAPI.prototype.search = originalSearch;
        }
    });
});
