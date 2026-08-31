import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
    SINGLES_PERFORMANCE_LIMITS,
    compactTrackForCache,
    createPersistedSinglesCache,
    dedupeAndSortTracks,
} from './library-singles.js';
import { navidromeSettings } from './navidrome-settings.js';
import { removeStalePwaRuntimeCaches } from './pwa-cache.js';
import { getSinglesAlphaKey } from './singles-alpha.js';

class MemoryStorage {
    constructor() {
        this.values = new Map();
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        this.values.set(key, String(value));
    }

    removeItem(key) {
        this.values.delete(key);
    }
}

beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('Navidrome credentials', () => {
    test('stores a per-device login and removes every credential on logout', () => {
        navidromeSettings.setCredentials({
            url: 'https://music.example.test///',
            username: ' listener ',
            password: 'x',
        });

        expect(navidromeSettings.getUrl()).toBe('https://music.example.test');
        expect(navidromeSettings.getUsername()).toBe('listener');
        expect(navidromeSettings.isConfigured()).toBe(true);

        navidromeSettings.clear();

        expect(localStorage.getItem(navidromeSettings.URL_KEY)).toBeNull();
        expect(localStorage.getItem(navidromeSettings.USERNAME_KEY)).toBeNull();
        expect(localStorage.getItem(navidromeSettings.PASSWORD_KEY)).toBeNull();
        expect(navidromeSettings.isConfigured()).toBe(false);
    });
});

describe('large Singles catalogue', () => {
    test('groups symbol and number prefixes under 0 instead of the following letter', () => {
        const sorted = dedupeAndSortTracks([
            { id: 'p', title: 'Perfect' },
            { id: 'symbol-p', title: '!Perfect' },
            { id: 'number', title: '2026 Mix' },
            { id: 'a', title: 'Alpha' },
        ]);

        expect(getSinglesAlphaKey('!Perfect')).toBe('0');
        expect(getSinglesAlphaKey('(Perfect)')).toBe('0');
        expect(getSinglesAlphaKey('2026 Mix')).toBe('0');
        expect(getSinglesAlphaKey('Perfect')).toBe('P');
        expect(getSinglesAlphaKey('Été')).toBe('E');
        expect(sorted.slice(0, 2).map((track) => track.id)).toEqual(expect.arrayContaining(['symbol-p', 'number']));
        expect(sorted.slice(2).map((track) => track.id)).toEqual(['a', 'p']);
    });

    test('sorts all tracks once and creates a bounded compact persistent cache', () => {
        const tracks = Array.from({ length: 10_000 }, (_, index) => ({
            id: `track-${index}`,
            title: `Track ${String(10_000 - index).padStart(5, '0')}`,
            artist: { id: `artist-${index % 40}`, name: `Artist ${index % 40}` },
            album: {
                id: `album-${index % 200}`,
                title: `Album ${index % 200}`,
                cover: `/navidrome/rest/getCoverArt.view?id=${index % 200}&credential=must-not-be-cached`,
            },
            duration: 180,
            internalDebugPayload: 'x'.repeat(200),
        }));

        tracks.push({ ...tracks[0] });
        const sorted = dedupeAndSortTracks(tracks);
        const { payload, serialized } = createPersistedSinglesCache(sorted, 1_750_000_000_000);

        expect(sorted).toHaveLength(10_000);
        expect(sorted[0].title.localeCompare(sorted.at(-1).title, undefined, { numeric: true })).toBeLessThan(0);
        expect(payload.totalTracks).toBe(10_000);
        expect(payload.complete).toBe(false);
        expect(payload.tracks.length).toBeLessThanOrEqual(SINGLES_PERFORMANCE_LIMITS.persistedTrackLimit);
        expect(serialized.length).toBeLessThanOrEqual(SINGLES_PERFORMANCE_LIMITS.persistedCharacterLimit);
        expect(payload.tracks[0]).toEqual(compactTrackForCache(sorted[0]));
        expect(serialized).not.toContain('internalDebugPayload');
        expect(serialized).not.toContain('must-not-be-cached');
        expect(SINGLES_PERFORMANCE_LIMITS).toMatchObject({
            scanPageSize: 1000,
            initialRenderSize: 80,
            renderChunkSize: 200,
        });
    });
});

describe('PWA cache upgrade', () => {
    test('deletes stale script/media caches and preserves the active application cache', async () => {
        const deleted = [];
        const cacheStorage = {
            keys: vi
                .fn()
                .mockResolvedValue([
                    'scripts',
                    'scripts-2.5.1',
                    'scripts-0.1.0-beta.1',
                    'static-resources',
                    'images',
                    'media',
                ]),
            delete: vi.fn(async (name) => {
                deleted.push(name);
                return true;
            }),
        };

        const removed = await removeStalePwaRuntimeCaches(cacheStorage, '0.1.0-beta.1');

        expect(removed).toEqual(['scripts', 'scripts-2.5.1', 'media']);
        expect(deleted).toEqual(removed);
    });
});
