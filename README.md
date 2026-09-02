<p align="center">
  <img src="images/navichrome_logo_black.svg" alt="Navichrome logo" width="128">
</p>

# Navichrome

> **Beta:** Navichrome `0.1.0-beta.1` is the first controlled beta of this self-hosted Navidrome/OpenSubsonic web
> player. Back up anything important, expect rough edges, and report reproducible problems.

Navichrome connects directly to a server you control. It does not require a Navichrome, Monochrome, or Samidy
account.

## Beta scope

The beta currently covers:

- Navidrome/OpenSubsonic sign-in, sign-out, and invalid-server handling
- Home and server-backed recently played content
- albums, artists, album details, search, starred tracks, and read-only Navidrome playlists shown as **My Playlists**
- **Singles**, with every library track alphabetized one per row and progressively rendered for large libraries
- playback, queue next/previous, seeking, shuffle, repeat, and Navidrome scrobbling
- artwork recovery and missing-artwork placeholders
- Navidrome lyrics with an optional LRCLIB fallback
- working track, album, and bulk music downloads
- installable PWA behavior with versioned cache cleanup
- Docker/Portainer deployment, the `/navidrome` reverse proxy, and Cloudflare Tunnel compatibility

Automated smoke tests cover desktop Chromium and a mobile-sized Chromium browser. Firefox and Safari still need manual
testing.

### Known limitations

- This is beta software. Do not treat it as the only copy of playlists or library metadata.
- Playlist editing and complete cross-device settings/queue sync are not claimed.
- Each device must sign in separately. Recently played history follows the same Navidrome account because it is
  submitted to and read from Navidrome; browser preferences remain device-local.
- Local Files requires the File System Access API and is therefore limited to compatible Chromium-based browsers.
- PWA navigation is network-first. Previously cached app code is removed during upgrades, but music is not promised
  for offline playback.
- Lighthouse is informational. Functional, lint, build, and bundle-audit checks are release gates.

See [Beta testing](docs/BETA_TESTING.md) for the test matrix and [Beta audit](docs/BETA_AUDIT.md) for the security,
dependency, and inherited-code inventory.

## Supported installation

The supported beta installation is the existing container image:

`ghcr.io/lozza/monochrome-navidrome:latest`

For a pinned beta deployment, use `ghcr.io/lozza/monochrome-navidrome:0.1.0-beta.1`.
Release notes and the historical alpha snapshot are listed on the [GitHub Releases page](https://github.com/lozza/monochrome-navidrome/releases).

The repository and image names are retained for compatibility; the displayed product name is **Navichrome**.

### Portainer or Docker Compose

```yaml
services:
    monochrome-navidrome:
        image: ghcr.io/lozza/monochrome-navidrome:latest
        container_name: monochrome-navidrome
        pull_policy: always
        ports:
            - '3002:4173'
        environment:
            NAVIDROME_URL: 'http://host.docker.internal:4533'
        extra_hosts:
            - 'host.docker.internal:host-gateway'
        restart: unless-stopped
        healthcheck:
            test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost:4173/']
            interval: 30s
            timeout: 5s
            retries: 3
            start_period: 15s
```

In Portainer:

1. Open **Stacks > Add stack > Web editor**.
2. Paste the Compose file and deploy it.
3. Open `http://YOUR-SERVER-IP:3002`.
4. In Navichrome, enter server URL `/navidrome` and your normal Navidrome username and password.

The example expects Navidrome on port `4533` of the Docker host. If both applications share a Docker network,
`NAVIDROME_URL` may instead use the Navidrome service name, such as `http://navidrome:4533`.

The root [docker-compose.yml](docker-compose.yml) preserves the same image, ports, proxy path, environment variable,
and host-gateway mapping. More deployment detail is in [DOCKER.md](DOCKER.md).

### Updating

In Portainer, open the stack, choose **Update the stack**, enable **Re-pull image**, and deploy again. With Docker
Compose, run:

```bash
docker compose pull
docker compose up -d
```

After an update, reload each installed PWA once while online so the new app shell activates and stale caches are
removed.

### Cloudflare Tunnel

Do not place tunnel tokens in Compose files, this repository, screenshots, or bug reports. Keep the token in
Cloudflare's supported secret/configuration mechanism and rotate any token that has been exposed.

- A separate cloudflared container can target `http://host.docker.internal:3002`.
- When cloudflared shares the application network, target `http://monochrome-navidrome:4173`.
- Preserve HTTPS at the public hostname. Navidrome credentials are device-local browser data and should not traverse
  an untrusted plaintext network.

No personal hostname or tunnel token is required by Navichrome.

## Credentials, history, and privacy

The server URL, username, and password are stored in that browser's `localStorage`. They are removed on sign-out.
OpenSubsonic requests use a new random salt and a password-derived token; Navichrome does not intentionally log the
password. Anyone with access to the browser profile can potentially read its local storage, so use a trusted device,
HTTPS, and the browser/OS account protections.

Playback submissions and recently played history are sent to the configured Navidrome server. That is why history can
follow the same Navidrome account across devices. Interface preferences, caches, queue state, and optional local
listening statistics stay on the device.

The production app has this fixed outbound allowlist:

| Destination                         | When used                                                                    | Required            |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------- |
| Same origin, including `/navidrome` | Authentication, library, artwork, audio, lyrics, downloads, scrobbling       | Yes                 |
| `https://lrclib.net`                | Lyrics fallback after Navidrome has no lyrics                                | Optional            |
| `https://api.github.com`            | Fetch the AutoEq headphone profile index after the user opens/imports AutoEq | Optional            |
| `https://raw.githubusercontent.com` | Fetch a selected AutoEq profile                                              | Optional            |
| `https://cdn.jsdelivr.net`          | Fallback delivery for a selected AutoEq profile                              | Optional            |
| `https://github.com`                | User-clicked source/issue links; no background application data              | Optional navigation |

Optional integrations are disabled by non-use, need no embedded credential, and fail without stopping navigation.
`schema.org` appearing in page metadata is an identifier namespace, not a network request.

## Reporting a beta bug

Use the [bug report form](https://github.com/lozza/monochrome-navidrome/issues/new/choose). Include:

- Navichrome version and build commit from **About**
- browser name/version, device/OS, viewport or mobile/desktop mode
- Navidrome version and whether it is direct, reverse-proxied, or behind Cloudflare
- deployment method, image tag or digest, and relevant non-secret Compose settings
- exact reproduction steps, expected/actual behavior, console errors, and network status codes
- approximate library size for browsing/performance reports

Redact usernames, passwords, tokens, signed URLs, cookies, personal domains, and music/library details that you do not
want public. Feature requests belong in the separate feature-request form.

## Local development

```bash
git clone https://github.com/lozza/monochrome-navidrome.git
cd monochrome-navidrome
npm ci
npm run dev
```

Before a pull request, run `npm run format:check`, `npm run lint`, `npm test`, and `npm run audit:bundle`.

## Project links

- [Source code](https://github.com/lozza/monochrome-navidrome)
- [Issues](https://github.com/lozza/monochrome-navidrome/issues)
- [Releases](https://github.com/lozza/monochrome-navidrome/releases)
- Container image: `ghcr.io/lozza/monochrome-navidrome:latest`

Navichrome retains attribution to the original Monochrome project under the repository's Apache-2.0 license.
