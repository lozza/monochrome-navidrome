import { describe, expect, test } from 'vitest';
import { contextActionSupportsType, shouldConfirmQueueClear } from './queue-enhancements.js';

describe('queue enhancements', () => {
    test('only asks for clear confirmation when the queue is non-empty', () => {
        expect(shouldConfirmQueueClear([])).toBe(false);
        expect(shouldConfirmQueueClear([{ id: 'song-1' }])).toBe(true);
    });

    test('keeps playback queue actions on playable context types', () => {
        expect(contextActionSupportsType('play-card', 'track')).toBe(true);
        expect(contextActionSupportsType('play-next', 'album')).toBe(true);
        expect(contextActionSupportsType('add-to-queue', 'playlist')).toBe(true);
        expect(contextActionSupportsType('play-next', 'artist')).toBe(false);
    });

    test('makes star actions consistent for tracks and library entities', () => {
        expect(contextActionSupportsType('toggle-like', 'track')).toBe(true);
        expect(contextActionSupportsType('toggle-like', 'album')).toBe(true);
        expect(contextActionSupportsType('toggle-like', 'artist')).toBe(true);
        expect(contextActionSupportsType('toggle-like', 'playlist')).toBe(true);
        expect(contextActionSupportsType('toggle-like', 'video')).toBe(false);
    });
});
