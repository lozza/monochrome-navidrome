# Docker deployment

The root [`docker-compose.yml`](docker-compose.yml) runs the published Navidrome fork and proxies `/navidrome/` to
your Navidrome server. It can be used from the command line or pasted into a Portainer stack.

```bash
docker compose up -d
```

The default address is `http://YOUR-SERVER-IP:3002`.

## Configuration

| Variable          | Default                            | Purpose                                        |
| ----------------- | ---------------------------------- | ---------------------------------------------- |
| `MONOCHROME_PORT` | `3002`                             | Port exposed on the Docker host                |
| `NAVIDROME_URL`   | `http://host.docker.internal:4533` | Navidrome address reachable from the container |

If Navidrome is on the same Docker network, use its service name instead, for example
`NAVIDROME_URL=http://navidrome:4533`.

In Monochrome, sign in with server URL `/navidrome` and your normal Navidrome username and password.

## Portainer

1. Open **Stacks > Add stack**.
2. Use **Web editor** and paste the root Compose file, or use **Repository** with this repository and
   `docker-compose.yml` as the Compose path.
3. Deploy the stack.
4. To update later, choose **Update the stack**, enable **Re-pull image**, and deploy again.

## Cloudflare Tunnel

When cloudflared is a separate container using `host.docker.internal`, set the public hostname service to:

```text
http://host.docker.internal:3002
```

When both containers share a Docker network, use the internal container port instead:

```text
http://monochrome-navidrome:4173
```

Do not point Cloudflare at `4173` through the Docker host unless that port is explicitly published. The supplied
Compose file publishes host port `3002` to container port `4173`.

## Data

The frontend does not need a data volume. Library data, favourites, playlists and listening history live in
Navidrome. Browser storage only keeps this device's connection settings and a fallback cache.
