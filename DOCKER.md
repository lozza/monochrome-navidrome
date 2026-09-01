# Docker deployment

The supported beta deployment uses `ghcr.io/lozza/monochrome-navidrome:latest`. The inherited image and container
names remain unchanged for existing installations; the product displayed in the browser is Navichrome.

The root [docker-compose.yml](docker-compose.yml) publishes host port `3002` to container port `4173` and proxies
`/navidrome/` to the configured Navidrome server.

```bash
docker compose pull
docker compose up -d
```

## Configuration

| Variable          | Default                            | Purpose                                                    |
| ----------------- | ---------------------------------- | ---------------------------------------------------------- |
| `MONOCHROME_PORT` | `3002`                             | Compatibility name for the port exposed on the Docker host |
| `NAVIDROME_URL`   | `http://host.docker.internal:4533` | Navidrome address reachable from the container             |

Keep `host.docker.internal:host-gateway` when Navidrome is published by the Docker host. When both containers share a
Docker network, `NAVIDROME_URL=http://navidrome:4533` (using the actual service name) is also valid.

In Navichrome, sign in with server URL `/navidrome` and the user's normal Navidrome credentials.

## Portainer

1. Open **Stacks > Add stack**.
2. Use **Web editor** and paste the root Compose file, or use **Repository** with this repository and
   `docker-compose.yml` as the Compose path.
3. Deploy and wait for the health check.
4. Open `http://YOUR-SERVER-IP:3002`.
5. To update, choose **Update the stack**, enable **Re-pull image**, and deploy again.

## Cloudflare Tunnel

Use one of these origin services:

```text
http://host.docker.internal:3002
```

or, on a shared Docker network:

```text
http://monochrome-navidrome:4173
```

Do not publish a tunnel token in Compose, Git, screenshots, or issue logs. Rotate a token outside this repository if it
has ever been disclosed. Do not point the tunnel at host port `4173` unless you have separately published that port.

## Data and credentials

No application data volume is required. Library data, stars, playlists, scrobbles, and recently played history live in
Navidrome. The browser stores its own server URL, username, password, preferences, queue, and bounded caches. Each
device must sign in separately. Use HTTPS for remote access and sign out before handing a browser profile to another
person.

## Build metadata

Source builds require a real commit:

```bash
docker build --build-arg BUILD_COMMIT="$(git rev-parse HEAD)" -f docker/Dockerfile .
```

The published workflow keeps `latest` and SHA tags and can create a semantic prerelease tag from a future
`v0.1.0-beta.1` Git tag. The beta-readiness branch itself is not eligible to publish an image.
