export const PLAYABLE_CONTEXT_TYPES = new Set(['track', 'video', 'album', 'playlist', 'user-playlist', 'mix']);

export function shouldConfirmQueueClear(queue) {
    return Array.isArray(queue) && queue.length > 0;
}

export function contextActionSupportsType(action, type) {
    if (['play-card', 'play-next', 'add-to-queue'].includes(action)) {
        return PLAYABLE_CONTEXT_TYPES.has(type);
    }
    if (action === 'toggle-like') {
        return ['track', 'album', 'artist', 'playlist', 'user-playlist'].includes(type);
    }
    return true;
}
