/**
 * Compatibility surface for inherited playback callbacks.
 *
 * Navichrome submits playback history directly to Navidrome/OpenSubsonic in
 * events.js. This class never contacts a third-party service.
 */
export class MultiScrobbler {
    isAuthenticated() {
        return false;
    }

    async updateNowPlaying() {}

    async onTrackChange() {}

    onPlaybackStop() {}

    async loveTrack() {}
}
