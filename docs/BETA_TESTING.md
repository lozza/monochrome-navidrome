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

## Issue #2: large Singles acceptance

[Issue #2](https://github.com/lozza/monochrome-navidrome/issues/2) reports that Singles is slow to open or displays
oversized artwork.

The regression fixture contains 10,000 tracks across 200 albums and 40 artists. The required assertions are:

- a scheduled browser task completes within two seconds after opening Singles
- rows appear progressively in an initial bounded group and batches of at most 200
- every track eventually appears, one row per track, alphabetically
- row images declare `40x40` dimensions and Navidrome artwork is requested at size `80`
- the persisted cache is at most 1,500 tracks and 1.5 million characters
- the full catalogue remains available in session memory
- reopening Singles causes no additional full server scan and no new full DOM sort

The starting `main` commit (`94e47e6b855b`) was exercised separately with this 10,000-track fixture. The catalogue
finished rendering in 9.93 seconds in the measured run, but row images had no explicit width/height attributes, and a
second run produced no persisted Singles cache even after a 60-second wait. Current `main` therefore does not meet the
acceptance criteria despite its recent performance commits.

The deterministic test passes on the beta branch with explicit `40x40` row dimensions, size-`80` artwork requests, a
bounded persistent cache, and no repeat catalogue scan. Keep issue #2 open until the pull request's GitHub checks are
green and a maintainer decides whether synthetic evidence is sufficient or wants an additional real-library browser
run. If a real-library check is performed, report track count and timings without exposing library contents.

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
