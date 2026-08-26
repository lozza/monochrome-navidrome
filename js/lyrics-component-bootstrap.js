let lyricsComponentPromise = null;

export function ensureLyricsComponentBootstrapped() {
    if (!lyricsComponentPromise) {
        lyricsComponentPromise = import('@uimaxbai/am-lyrics/am-lyrics.js').catch((error) => {
            lyricsComponentPromise = null;
            console.error('Failed to load lyrics component:', error);
            throw error;
        });
    }

    return lyricsComponentPromise;
}

// Start loading immediately. ES module imports are cached, so the legacy loader
// in lyrics.js can safely attempt the same import later without loading twice.
ensureLyricsComponentBootstrapped().catch(() => {});
