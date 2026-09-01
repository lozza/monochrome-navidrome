# Changelog

All notable changes to Navichrome are documented here.

## [0.1.0-beta.1] - 2026-09-01

### Added

- Real Navichrome version and Git commit identity in the application and Docker image metadata
- Deterministic Navidrome/OpenSubsonic API, core, desktop, mobile-sized, PWA-upgrade, and 10,000-track Singles tests
- Production-bundle identity, obsolete-service, telemetry, and credential-shape audit
- Content Security Policy and documented outbound-service allowlist
- Beta deployment, testing, privacy, security, and issue-reporting documentation

### Changed

- Singles loads a full Navidrome catalogue progressively in bounded batches, requests row artwork at an appropriate
  size, keeps the full sorted list only for the session, and persists a compact bounded cache
- The Singles 0–Z index keeps symbol/number-prefixed titles in the `0` group, follows the letter pressed on touch
  devices, and shows a back-to-top button after scrolling. The index waits for the complete catalogue instead of
  briefly showing letters from the compact cache, and title sorting reuses one natural-sort collator to avoid the
  initial performance regression
- Tightened the Start Infinite Radio button on mobile and restored clear spacing before the first recommended track
- Widened the Singles alphabet touch lane on mobile and kept scrubbing responsive across unavailable letters
- Restored the bundled Inter font so mobile text uses the intended metrics without contacting Google Fonts
- PWA navigation and media use network-safe strategies while versioned application caches are replaced on update
- CI uses `npm ci`, read-only formatting/lint checks, deterministic browser tests, a production build, and the bundle
  audit
- Docker publishing retains `ghcr.io/lozza/monochrome-navidrome`, `latest`, and SHA tags while allowing a future
  semantic prerelease tag

### Removed

- Monochrome/Samidy account and profile code
- Appwrite, PocketBase, Better Auth, Sentry, analytics, and old public-service endpoints
- TIDAL/provider fallback, listening-party, PodcastIndex, ListenBrainz, Last.fm/Libre.fm/Maloja, editor-picks,
  application-download, Donate, Discord, Unreleased, and community-theme-store remnants
- unused Cloudflare functions, desktop/mobile packaging workflows, generated discovery feeds, and obsolete
  dependencies

### Compatibility

- Repository: `https://github.com/lozza/monochrome-navidrome`
- Image: `ghcr.io/lozza/monochrome-navidrome`
- Host/container ports: `3002:4173`
- In-app server URL: `/navidrome`
- Default proxy target: `NAVIDROME_URL=http://host.docker.internal:4533`

## [0.1.0-alpha.1] - 2026-08-29

This is a retrospective label for the early Navichrome preview at commit
`94e47e6b855ba8f9298fe2c2a00cae21104b13e7`. That snapshot still carried the
inherited application version `2.5.1` and predates the beta cleanup, security
work, and large-library Singles testing. Its Docker image is retained for
comparison and rollback; new installations should use the beta.

Docker image: `ghcr.io/lozza/monochrome-navidrome:sha-94e47e6`

[0.1.0-beta.1]: https://github.com/lozza/monochrome-navidrome/compare/v0.1.0-alpha.1...v0.1.0-beta.1
[0.1.0-alpha.1]: https://github.com/lozza/monochrome-navidrome/releases/tag/v0.1.0-alpha.1
