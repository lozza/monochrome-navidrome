# Changelog

All notable changes to Navichrome are documented here.

## [0.1.0-beta.1] - Unreleased

### Added

- Real Navichrome version and Git commit identity in the application and Docker image metadata
- Deterministic Navidrome/OpenSubsonic API, core, desktop, mobile-sized, PWA-upgrade, and 10,000-track Singles tests
- Production-bundle identity, obsolete-service, telemetry, and credential-shape audit
- Content Security Policy and documented outbound-service allowlist
- Beta deployment, testing, privacy, security, and issue-reporting documentation

### Changed

- Singles loads a full Navidrome catalogue progressively in bounded batches, requests row artwork at an appropriate
  size, keeps the full sorted list only for the session, and persists a compact bounded cache
- The Singles A–Z index now follows the letter pressed on touch devices and shows a back-to-top button after scrolling
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
