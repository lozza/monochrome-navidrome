<p align="center">
  <img src="images/navichrome_logo_black.svg" alt="Navichrome logo" width="128">
</p>

# Navichrome

A self-hosted web player for [Navidrome](https://www.navidrome.org/) and compatible OpenSubsonic servers.

Navichrome is a Navidrome-focused fork of Monochrome. It uses your own Navidrome server for authentication, library data,
playback, favourites, playlists and listening history.

## Features

- Sign in with your Navidrome username and password
- Cross-device recently played history stored by Navidrome
- Full album, single and artist browsing
- Navidrome playlists and starred tracks
- Search, playback, artwork, lyrics and downloads
- Responsive desktop and mobile web interface
- Prebuilt Docker image for Portainer and Docker Compose

## Docker Compose

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

In Portainer, open **Stacks > Add stack > Web editor**, paste the Compose file, and deploy it.

The example expects Navidrome on port `4533` of the same Docker host. Change `NAVIDROME_URL` if yours is elsewhere.
If the containers share a Docker network, you can use the Navidrome service name, such as
`http://navidrome:4533`.

Open `http://YOUR-SERVER-IP:3002` and sign in using:

- Server URL: `/navidrome`
- Your Navidrome username
- Your Navidrome password

For Cloudflare Tunnel, point your public hostname at `http://host.docker.internal:3002` from a separate cloudflared
container, or at `http://monochrome-navidrome:4173` when both containers share a Docker network.

## Updating

In Portainer, open the stack, choose **Update the stack**, enable **Re-pull image**, and deploy it again.

## Local development

```bash
git clone https://github.com/lozza/monochrome-navidrome.git
cd monochrome-navidrome
npm install
npm run dev
```

For local development, use a Navidrome URL that permits browser requests or place both applications behind the same
reverse proxy. Production Docker deployments should normally use `/navidrome`.

## Repository

- [Source code](https://github.com/lozza/monochrome-navidrome)
- [Issues](https://github.com/lozza/monochrome-navidrome/issues)
- Container image: `ghcr.io/lozza/monochrome-navidrome:latest`

Based on the original [Monochrome project](https://github.com/monochrome-music/monochrome).
