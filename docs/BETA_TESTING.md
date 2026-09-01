# Navichrome beta testing guide

This guide covers `0.1.0-beta.1`. Never use a maintainer's real credentials in automated tests or public reports.

## Automated release gates

Run from a clean checkout with Node.js 24:

```bash
npm ci --no-audit --no-fund
npm run format:check
npm run lint:js
npm run lint:css
npm run lint:html
npm run test:navidrome
npm run test:unit
npm run build
npm run audit:bundle
npx playwright test
```

The Playwright suite uses deterministic OpenSubsonic responses and fake `test-only` credentials. It runs the core
journeys in desktop and mobile-sized Chromium. The large Singles test runs once on desktop to control CI time.

## Core browser matrix

Test a fresh profile and an upgraded installed PWA where practical.

| Journey                                           | Desktop Chromium | Mobile-sized Chromium | Firefox | Safari/iOS |
| ------------------------------------------------- | ---------------- | --------------------- | ------- | ---------- |
| Successful and failed sign-in                     | Automated        | Automated             | Manual  | Manual     |
| Sign-out removes local credentials                | Automated        | Automated             | Manual  | Manual     |
| Home and recently added                           | Automated        | Automated             | Manual  | Manual     |
| Albums, artists, album details                    | Automated        | Automated             | Manual  | Manual     |
| Starred tracks and My Playlists                   | Automated        | Automated             | Manual  | Manual     |
| Search and missing server                         | Automated        | Automated             | Manual  | Manual     |
| Playback and queue next/previous                  | Automated        | Automated             | Manual  | Manual     |
| Scrobble and server-backed recent history         | Automated/mocked | Automated/mocked      | Manual  | Manual     |
| Missing artwork recovery                          | Automated        | Automated             | Manual  | Manual     |
| PWA stale-cache upgrade                           | Automated        | Automated             | Manual  | Manual     |
| Optional AutoEq failure does not block navigation | Automated        | Automated             | Manual  | Manual     |
| Seeking, shuffle, repeat, downloads, lyrics       | Manual           | Manual                | Manual  | Manual     |

For manual checks, record browser/OS, Navidrome version, direct/proxied access, image digest, and the version/build
commit shown on **About**.

## Final beta sign-off checklist

Use this list against the candidate that will be promoted. A checked item means it has evidence from the automated
suite or the current real deployment; unchecked items still need a short manual confirmation.

### Build and deployment

- [x] GitHub formatting, lint, test and production-build checks pass for commit `21ba7ae9e598`.
- [x] The candidate image reports Navichrome `0.1.0-beta.1` and revision `21ba7ae9e598cec78c044ca080dcd6a5468b6efd`.
- [x] The existing Portainer stack runs healthy on host port `3002` and internal port `4173`.
- [x] The stack still uses container name `monochrome-navidrome`, the configured Navidrome URL and the host-gateway
      mapping.
- [x] The application returns HTTP 200 and `/navidrome/` reaches the configured reverse proxy.
- [ ] Open **About** in the deployed application and confirm the version and commit shown there.
- [ ] Open the public Cloudflare Tunnel address and confirm Home, artwork and playback work without mixed-content or
      certificate errors.

### Account and server handling

- [ ] Sign in successfully with a real Navidrome account.
- [ ] Try one incorrect password and confirm a clear error is shown without revealing the password.
- [ ] Sign out, refresh, and confirm the previous account does not sign in automatically.
- [ ] Sign back in and confirm this device keeps its own credentials and preferences.
- [ ] Temporarily use an invalid or unavailable server address and confirm the app fails cleanly, then restore
      `/navidrome`.

### Library and navigation

- [ ] Home loads recently added and recommended content.
- [ ] Albums, artists and an album detail page load and navigate correctly.
- [ ] Starred tracks match Navidrome's server data.
- [ ] **My Playlists** matches Navidrome's playlists; do not expect playlist editing.
- [ ] Search returns tracks, albums and artists and opens the selected result.
- [ ] Recent shows server-backed listening history.
- [x] Singles remains responsive on the real library and when reopened.
- [x] Singles contains the complete catalogue in alphabetical order, with prefixed/non-letter titles under `0`.
- [x] The `0` and A-Z index responds immediately and lands on the correct group.
- [x] Singles artwork stays at the normal row size while loading and scrolling.

### Playback and history

- [ ] Start playback from Home, an album, starred tracks, a playlist and search.
- [x] Start playback from Singles and confirm next/previous follows the complete alphabetical catalogue.
- [ ] Seek forward and backward and confirm the displayed time remains accurate.
- [ ] Test shuffle, repeat-one, repeat-all and repeat-off.
- [ ] Add, remove and reorder queue entries, then use next and previous.
- [ ] Let a track play long enough to scrobble and confirm it appears in Navidrome's recently played history.
- [ ] On a second device using the same Navidrome account, confirm server-backed recent history follows the account.
      Device login and local settings are not expected to sync.

### Artwork, lyrics and downloads

- [ ] Open content with valid artwork and content with missing artwork; confirm recovery or the placeholder is sensible.
- [ ] Open lyrics for a track with server lyrics and, where available, a track using the documented lyrics fallback.
- [ ] Download one track and one album and confirm the resulting files are usable.
- [ ] Confirm artwork, audio, lyrics and downloads still work through the Cloudflare Tunnel.

### PWA and responsive layout

- [ ] Install the PWA, launch it, then refresh after an application update and confirm the new version replaces the
      old cache.
- [ ] Confirm navigation still works when the optional AutoEq service is unavailable.
- [ ] On a mobile-sized screen, check the menu, search bar, track rows, quality badges and now-playing controls for
      clipping or vertical misalignment.
- [ ] Start Infinite Radio on mobile and confirm the album art, button and bottom controls have balanced spacing.
- [ ] Scroll a long page and confirm the back-to-top control works.

### Release decision

- [ ] Record any remaining limitation in the pull request and changelog.
- [ ] Confirm no credentials, tokens, personal hostnames or private library details appear in the final diff or logs.
- [ ] Confirm all required GitHub checks are green on the final commit.
- [ ] Only after every required item is satisfied: merge PR #3 and promote the existing GHCR image name to `latest`.
- [ ] Do not publish a GitHub release or semantic beta image tag until the separate release decision is made.

## Issue #2: large Singles acceptance

[Issue #2](https://github.com/lozza/monochrome-navidrome/issues/2) reports that Singles is slow to open or displays
oversized artwork.

The regression fixture contains 10,000 tracks across 200 albums and 40 artists. The assertions are:

- a scheduled browser task completes within two seconds after opening Singles
- the complete catalogue is available alphabetically while no more than 80 virtual rows are present in the DOM
- row images declare `40x40` dimensions and Navidrome artwork is requested at size `80`
- the complete compact catalogue is stored asynchronously in IndexedDB
- reopening Singles causes no additional full server scan and no new full DOM sort
- the `0` and A-Z index reaches the exact group without scanning thousands of DOM nodes
- selecting a visible row builds next/previous playback from the complete catalogue

The starting `main` commit (`94e47e6b855b`) was exercised separately with this 10,000-track fixture. The catalogue
finished rendering in 9.93 seconds in the measured run, but row images had no explicit width/height attributes, and a
second run produced no persisted Singles cache even after a 60-second wait. Current `main` therefore does not meet the
acceptance criteria despite its recent performance commits.

The deterministic test passes on the beta branch with a bounded virtual DOM, explicit `40x40` row dimensions,
size-`80` artwork requests, a complete IndexedDB cache and no repeat catalogue scan. The same candidate was verified
against the real Portainer/Navidrome deployment: reopening is smooth, index jumps are immediate and accurate,
next/previous follows the complete Singles catalogue, and artwork remains correctly sized. Issue #2 was closed with
that evidence on 1 September 2026.

## Docker/Portainer verification

1. Validate `docker compose config`.
2. Build with `--build-arg BUILD_COMMIT=<full SHA>`.
3. Start the container with the root Compose contract.
4. Confirm the container health check is healthy.
5. Confirm host `3002` serves the app and container `4173` is not unintentionally changed.
6. Confirm `/navidrome/rest/ping.view` is proxied to `NAVIDROME_URL`.
7. Confirm a Cloudflare Tunnel origin can target host `3002` or the shared-network container at `4173`.

Do not place a Cloudflare token or a personal hostname in test artifacts.

## Reporting results

Include exact commands, exit status, test counts, version/build commit, Docker health, and any skipped manual target.
Redact credentials, cookies, tokens, signed URLs, usernames, personal hostnames, and private library metadata.
