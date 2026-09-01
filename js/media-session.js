function getSession() {
    return typeof navigator !== 'undefined' ? navigator.mediaSession : null;
}

export const MediaSession = {
    async setActionHandler({ action }, handler) {
        const session = getSession();
        if (!session?.setActionHandler) return;
        session.setActionHandler(action, handler);
    },

    async setMetadata(metadata) {
        const session = getSession();
        if (!session) return;
        session.metadata = Object.keys(metadata).length > 0 ? new MediaMetadata(metadata) : null;
    },

    async setPlaybackState({ playbackState }) {
        const session = getSession();
        if (session) session.playbackState = playbackState;
    },

    async setPositionState(position) {
        getSession()?.setPositionState?.(position);
    },
};
