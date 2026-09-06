import { describe, expect, it } from 'vitest';
import { NavidromeAPI } from './navidrome-api.js';
import './navidrome-search-compat.js';

describe('Navidrome search metadata dedupe', () => {
    it('hides the same song when duplicate Navidrome rows have different ids and no path', async () => {
        const api = Object.create(NavidromeAPI.prototype);
        const originalSearch = Reflect.get(NavidromeAPI.prototype, 'search');

        NavidromeAPI.prototype.search = async () => ({
            tracks: {
                items: [
                    {
                        id: 'row-a',
                        title: 'Apologize',
                        artist: { name: 'Luther Vandross' },
                        album: { title: 'Dance With My Father' },
                        trackNumber: 1,
                        volumeNumber: 1,
                        duration: 299,
                    },
                    {
                        id: 'row-b',
                        title: 'Apologize',
                        artist: { name: 'Luther Vandross' },
                        album: { title: 'Dance With My Father' },
                        trackNumber: 1,
                        volumeNumber: 1,
                        duration: 299,
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
            const result = await api.searchTracks('apologize');
            expect(result.items).toHaveLength(1);
        } finally {
            NavidromeAPI.prototype.search = originalSearch;
        }
    });
});
