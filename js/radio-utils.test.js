import { describe, expect, test } from 'vitest';
import { normalizeRadioSeeds } from './radio-utils.js';

describe('radio seed selection', () => {
    test('normalizes a single seed and removes duplicate or invalid entries', () => {
        const seeds = normalizeRadioSeeds([
            { id: 'one' },
            { id: 'one', title: 'duplicate' },
            null,
            { title: 'missing id' },
        ]);

        expect(seeds).toEqual([{ id: 'one' }]);
    });

    test('returns an empty list when no playable seeds are available', () => {
        expect(normalizeRadioSeeds()).toEqual([]);
        expect(normalizeRadioSeeds([{ title: 'missing id' }])).toEqual([]);
    });
});
