# Security policy

## Supported version

Only the current Navichrome beta receives security fixes. The project is pre-release software; update to the newest
published image before reporting an issue.

## Reporting a vulnerability

Use GitHub's private **Report a vulnerability** flow for this repository when available:

`https://github.com/lozza/monochrome-navidrome/security/advisories/new`

If private reporting is unavailable, open a minimal issue asking the maintainer for a private contact route. Do not
post exploit details, credentials, tokens, cookies, signed media URLs, personal hostnames, or private library data in a
public issue.

Include the Navichrome version/build commit, affected deployment path, impact, reproduction prerequisites, and whether
the issue affects the browser, container proxy, or Navidrome server. Allow reasonable time for triage before public
disclosure.

## Credential model

Navichrome stores the configured server URL, username, and password in each browser's `localStorage`. Sign-out removes
those values. OpenSubsonic calls use a random salt and password-derived token, but local storage is readable by anyone
who can access the browser profile or execute script in that origin.

Operators should:

- serve remote access over HTTPS
- protect the device and browser profile
- use a dedicated least-privilege Navidrome account where appropriate
- sign out on shared devices
- keep Cloudflare and other infrastructure tokens outside Git and Compose
- rotate any credential or tunnel token after disclosure

Navichrome must not log credentials or send them, library data, or playback data to a Monochrome/Samidy service. The
documented optional outbound services are listed in [README.md](README.md#credentials-history-and-privacy).

## Security headers

The production container applies a Content Security Policy, clickjacking protection, MIME-sniffing protection, a
strict referrer policy, and a restrictive permissions policy. Changes to allowed network destinations require
documentation, tests, and review.
