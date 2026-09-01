# Beta readiness audit

## Baseline

- Remote branch: `origin/main`
- Starting commit: `94e47e6b855ba8f9298fe2c2a00cae21104b13e7`
- Work branch: `beta-readiness-0.1.0`
- Open issue at baseline: [#2, Singles either takes a long time to load, or shows large album art](https://github.com/lozza/monochrome-navidrome/issues/2)

Before beta changes, the production build and HTML lint passed and the focused Navidrome API test had six passing
cases. Formatting failed. JavaScript lint reported 260 errors and 44 warnings; CSS lint reported 155 errors. The
existing browser test command failed. These are baseline failures, not regressions introduced by the beta work.

The inherited workflows used `npm install`, automatic source fixes, `continue-on-error`, and `|| true`, allowing
quality failures to look successful.

## Production code inventory

The production entry imports the Navidrome/OpenSubsonic adapter, router/UI, player and queue, settings/storage,
downloads and metadata workers, artwork recovery, lyrics, media-session integration, PWA update handling, visualizers,
and optional local-file/AutoEq modules.

Retained code was required by a visible, working feature:

- Navidrome auth, library, favorites, playlists, search, streaming, downloads, lyrics, and scrobbling
- queue, seek, shuffle, repeat, media session, and device-local preferences
- artwork recovery, local files, audio metadata/remuxing, visualizers, and AutoEq
- PWA installation/update and Docker reverse-proxy support

The following inherited code was removed because it was unreachable, depended on the old public service, duplicated
the active application, or exposed an unsupported feature:

- Monochrome/Samidy accounts, profiles, authentication, Appwrite, PocketBase, and Better Auth
- TIDAL/provider fallbacks and old shared API/instance managers
- Sentry, analytics, ListenBrainz, Last.fm, Libre.fm, Maloja, PodcastIndex, and listening-party networking
- community playlists/theme store, editor picks, Album of the Year discovery, application-download, Donate, Discord,
  and Unreleased surfaces
- Cloudflare Pages functions/database schema, obsolete worker proxies, mobile/desktop packaging, duplicate React
  source, and generated discovery data/workflows
- obfuscated and non-removable hardcoded content filters unrelated to the self-hosted Navidrome library
- unreferenced Monochrome packaging/promotional images and orphaned account/profile/support styles

Music track, album, playlist, and bulk-download paths were retained.

## Dependencies

Removed packages proved exclusive to deleted code:

- `@capacitor/android`, `@capacitor/app`, `@capacitor/browser`, `@capacitor/core`,
  `@capacitor/haptics`, `@capacitor/ios`, and `@capgo/capacitor-media-session`
- `@sentry/browser`, `@uimaxbai/am-lyrics`, `appwrite`, `better-auth`, `pocketbase`, `cookie-session`,
  `events`, and `jose`
- `formidable` and `vite-bundle-visualizer`
- unused `simple-icons` and the duplicate npm copy of the already vendored Butterchurn presets

Retained runtime/build dependencies have a current import or build role: TagLib and FFmpeg for music downloads and
metadata, client-zip for bulk downloads, HLS/Shaka for playback, Fuse for the command palette, Kawarp/Butterchurn for
visible visualizers, Lucide/SVGO/mime for icon build transforms, UUID for timed operations, the File System Access
types for local files, and the lint/test/PWA toolchain.

## Security and privacy findings

- The current tracked tree and production bundle contain no high-confidence private-key, GitHub-token, AWS-key,
  Slack-token, or JWT-shaped values.
- A binary-inclusive history heuristic produced eight JWT-shaped byte sequences. A text-diff `git log -G` scan found
  no matching committed text, so these were not confirmed credentials and no values were printed.
- No hardcoded Authorization header or private service endpoint remains.
- Navidrome passwords are not logged. Requests use a random salt and password-derived OpenSubsonic token.
- Server URL, username, and password are stored in browser `localStorage` on each device and removed on sign-out.
- Playback/scrobble and recent-history data go only to the configured Navidrome server. No path sends credentials,
  library data, or playback data to Monochrome/Samidy.
- The previously disclosed Cloudflare Tunnel token is not present. Rotation is an external operator action and is not
  a repository change.

The bundle audit checks real build identity, obsolete-service markers, telemetry markers, promotional remnants, and
high-confidence credential shapes without printing matched values.

## Production outbound allowlist

| Fixed destination            | Feature                            | Configuration/behavior                                  |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------- |
| Same origin and `/navidrome` | All Navidrome/OpenSubsonic traffic | Required; proxy target set by operator                  |
| `lrclib.net`                 | Lyrics fallback                    | No credential; used only after server lyrics are absent |
| `api.github.com`             | AutoEq index                       | User-initiated optional feature                         |
| `raw.githubusercontent.com`  | AutoEq profile                     | User-selected optional profile                          |
| `cdn.jsdelivr.net`           | AutoEq profile fallback            | Used only if the primary profile request fails          |
| `github.com`                 | Source and issue links             | User navigation, not background data submission         |

The CSP's `connect-src` matches the four required/optional API origins. Page metadata's `schema.org` URL and SVG
namespace URLs are identifiers, not outbound requests.

## Compatibility

The public repository, GHCR image, `latest` and SHA tag behavior, `3002:4173` mapping, `/navidrome` in-app server
URL, `NAVIDROME_URL=http://host.docker.internal:4533`, and `host.docker.internal:host-gateway` mapping remain
unchanged. The displayed product/version is Navichrome `0.1.0-beta.1`, with a real 12-character commit identity.

## Issue #2 status

The recorded starting commit was reproduced with a deterministic 10,000-track library. Full rendering completed in
9.93 seconds, but track artwork had no explicit row dimensions and no persistent Singles cache appeared within a
60-second wait. The beta branch now uses a bounded virtual list and stores the complete compact catalogue in
IndexedDB. Its regression test proves a maximum 80-row DOM, `40x40` dimensions with size-`80` artwork requests,
complete catalogue access, exact A-Z navigation and no additional full server scan when Singles is reopened. The same
candidate passed a real-library check for smooth reopening, instant accurate index jumps, full-catalogue next/previous
and correctly sized artwork. Issue #2 was closed with that evidence on 1 September 2026.
