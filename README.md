 <p align="center">
  <a href="https://monochrome.tf">
    <img src="https://github.com/monochrome-music/monochrome/blob/main/public/assets/512.png?raw=true" alt="Monochrome Logo" width="150px">
  </a>
</p>

<h1 align="center">Monochrome</h1>

> This fork is being converted into a dedicated web player for
> [Navidrome](https://www.navidrome.org/) and other compatible OpenSubsonic servers.

## Navidrome fork status

The first working integration includes:

- Navidrome connection settings and a connection test
- Salted OpenSubsonic token authentication (the password is not sent in the URL)
- Recently added albums on first use
- Track, album and artist search
- Album, artist and playlist pages
- Direct browser playback, artwork and downloads
- Similar songs/artists and random-album fallbacks
- Navidrome starred tracks, albums and artists
- A same-origin Navidrome proxy in the production Docker image

TIDAL-only discovery feeds, music videos and mixes are disabled. Monochrome's local playlist system is still present;
editing native Navidrome playlists is planned separately.

### Docker quick start

The container proxies `/navidrome/` to the Navidrome server, which avoids browser CORS issues:

```bash
cd docker
NAVIDROME_URL=http://host.docker.internal:4533 docker compose up -d --build
```

Open `http://localhost:3000`, choose **Settings > Instances**, and enter:

- Server URL: `/navidrome`
- Your Navidrome username and password

If both containers share a Docker network, `NAVIDROME_URL` can instead use the Navidrome service name, such as
`http://navidrome:4533`.

### Local development

```bash
npm install
npm run dev
```

For local development, either enter a full Navidrome URL that permits browser requests or put both apps behind the
same reverse proxy. Production Docker deployments should normally use `/navidrome`.

---

<p align="center">
  <strong>An open-source, privacy-respecting, ad-free music app.</strong>
</p>

<p align="center">
  <a href="https://monochrome.tf">Website</a> -
  <a href="https://ko-fi.com/monochrometf">Donate</a> -
  <a href="#features">Features</a> -
  <a href="#usage">Usage</a> -
  <a href="#self-hosting">Self-Hosting</a> -
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://github.com/monochrome-music/monochrome/stargazers">
    <img src="https://img.shields.io/github/stars/monochrome-music/monochrome?style=for-the-badge&color=ffffff&labelColor=000000" alt="GitHub stars">
  </a>
  <a href="https://github.com/monochrome-music/monochrome/forks">
    <img src="https://img.shields.io/github/forks/monochrome-music/monochrome?style=for-the-badge&color=ffffff&labelColor=000000" alt="GitHub forks">
  </a>
  <a href="https://github.com/monochrome-music/monochrome/issues">
    <img src="https://img.shields.io/github/issues/monochrome-music/monochrome?style=for-the-badge&color=ffffff&labelColor=000000" alt="GitHub issues">
  </a>
</p>

---

## What is Monochrome?

**Monochrome** is an open-source, privacy-respecting, ad-free web music player. It provides a beautiful, minimalist interface for streaming high-quality music without the clutter of traditional streaming platforms.

[![Monochrome UI: NASIR by Nas](https://i.samidy.xyz/NASIR.png)](https://monochrome.tf/album/90502209)

## [![Monochrome UI: Jump Out by Osamason](https://i.samidy.xyz/jumpout.png)](https://monochrome.tf/album/413189044)

## Features

### Audio Quality

- High-quality High-Res/lossless audio streaming
- Support for local music files
- API caching for improved performance

### Interface

- Dark, minimalist interface optimized for focus
- Animated Album Covers For Supported Albums
- Customizable themes & Community Theme Store
- Accurate and unique audio visualizer
- Offline-capable Progressive Web App (PWA)
- Media Session API integration for system controls

### Library & Organization

- Recently Played tracking for easy history access
- Comprehensive Personal Library for favorites
- Queue management with shuffle and repeat modes
- Native Podcast support & organization
- Playlist import from other platforms
- Public playlists for social sharing
- Smart recommendations for new songs, albums & artists
- Infinite Recommendation Radio
- Explore Page (Hot & New) for discovering newly added music and whats trending overall or within each genre

### Lyrics & Metadata

- Lyrics support with karaoke mode
- Genius integration for lyrics
- Track downloads with automatic metadata embedding

### Integrations

- Account system for cross-device syncing
- Customizable & Public Profiles
- Real-time Listening Parties for synced playback with friends
- Last.fm and ListenBrainz integration for scrobbling
- OAuth support (Google, Discord, GitHub, Spotify)
- Unreleased music from [ArtistGrid](https://artistgrid.cx)
- Dynamic Discord Embeds
- Artist Biography + Social Links for learning more about your favorite artists
- Multiple API instance support with failover

### Power User Features

- Keyboard shortcuts & Command Palette (CTRL+K) for power users

---

## Quick Start

### Live Instance

Our Recommended way to use monochrome is through our official instance:

**[monochrome.tf](https://monochrome.tf)** / **[monochrome.samidy.com](https://monochrome.samidy.com)**

For alternative instances, check [INSTANCES.md](INSTANCES.md).

---

## Self-Hosting

NOTE: Accounts will not work on self-hosted instances. Our Appwrite authentication system only allows authorized domains.

We had to heavily customize the authentication system and write several custom scripts to support features like SMTP and Google OAuth (which are currently bugged in Appwrite). Because of this, we can no longer provide a self-hostable accounts system.

> [!WARNING]
> You will not be able to stream music after self-hosting and placing the website on a domain. Our API is configured to only accept official instances of Monochrome so you can only stream music on localhost after self-hosting. However, if you have a working and paid HiFi API endpoint then Settings > Instances > Turn on Dev Mode > Place your endpoint there.

### Option 1: Docker (Recommended)

```bash
git clone https://github.com/monochrome-music/monochrome.git
cd monochrome/docker
docker compose up -d
```

Visit `http://localhost:3000`

### Tailscale Access

Visit `http://<tailscale_server_hostname_or_ip>:3000`

By default, the app uses Vite preview, which restricts access to localhost.  
To allow access over Tailscale:

1. Open `vite.config.js`

2. Uncomment and configure the `preview` section:

```js
preview: {
    host: true,
    allowedHosts: ['<your_tailscale_hostname>'], // e.g. pi5.tailf5f622.ts.net
},
```

3. Restart with a fresh container (if already running):

```bash
docker compose down
docker compose up -d
```

For development mode and advanced setups, see [DOCKER.md](DOCKER.md).

### Option 2: Manual Installation

#### Prerequisites

- [Bun](https://bun.sh/) (Preferred) or [Node.js](https://nodejs.org/) (Version 20+ or 22+ recommended)
- [Git](https://git-scm.com/)

#### PocketBase Schema

The current PocketBase collection schema is stored in [`database/pb_schema.json`](database/pb_schema.json). Import this schema into a fresh PocketBase instance when setting up account data storage.

#### Local Development

1. **Clone the repository:**

    ```bash
    git clone https://github.com/monochrome-music/monochrome.git
    cd monochrome
    ```

2. **Install dependencies:**

    ```bash
    bun install
    # or
    npm install # NPM is included with Node.js
    ```

3. **Start the development server:**

    ```bash
    bun run dev
    # or
    npm run dev
    ```

4. **Open your browser:**
   Navigate to `http://localhost:5173/`

#### Building for Production

```bash
bun run build
# or
npm run build
```

---

## Usage

### Basic Usage

1. Visit the [Website](https://monochrome.tf) or your local development server
2. Search for your favorite artists, albums, or tracks
3. Click play to start streaming
4. Use the media controls to manage playback, queue, and volume

### Keyboard Shortcuts

| Shortcut      | Action                       |
| ------------- | ---------------------------- |
| `Space`       | Play / Pause                 |
| `→`           | Seek forward 10s             |
| `←`           | Seek backward 10s            |
| `Shift` + `→` | Next track                   |
| `Shift` + `←` | Previous track               |
| `↑`           | Volume up                    |
| `↓`           | Volume down                  |
| `M`           | Mute / Unmute                |
| `S`           | Toggle shuffle               |
| `R`           | Toggle repeat                |
| `Q`           | Open queue                   |
| `L`           | Toggle lyrics                |
| `/`           | Focus search                 |
| `Esc`         | Close modals                 |
| `[`           | Previous visualizer preset   |
| `]`           | Next visualizer preset       |
| `\`           | Toggle visualizer auto-cycle |
| `Ctrl` + `K`  | Command Palette              |

### Account Features

To sync your library, history, and playlists across devices:

1. Click the "Accounts" Section
2. Sign in with Google or Email
3. Your data will automatically sync across all devices

---

## Contributing

We welcome contributions from the community! Please see our [Contributing Guide](CONTRIBUTING.md) for:

- Setting up your development environment
- Code style and linting
- Project structure
- Before You Contribute
- Commit message conventions
- Deployment information

---

<p align="center">
  <a href="https://fmhy.net/audio#streaming-sites">
    <img src="https://raw.githubusercontent.com/monochrome-music/monochrome/refs/heads/main/public/assets/asseenonfmhy880x310.png" alt="As seen on FMHY" height="50">
  </a>
</p>

<p align="center">
  <a href="https://notbyai.fyi">
    <img src="https://i.samidy.xyz/Developed-By-Humans-Not-By-AI-Badge-black%402x.png" alt="Developed by Humans" height="50">
  </a>
</p>

<p align="center">
  Made with ❤️ by the Monochrome team
</p>

## Star History

<a href="https://star-history.dera.page/#monochrome-music/monochrome&type=date&logscale&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://star-history.dera.page/svg?repos=monochrome-music/monochrome&type=date&theme=dark&logscale&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://star-history.dera.page/svg?repos=monochrome-music/monochrome&type=date&logscale&legend=top-left" />
   <img alt="Star History Chart" src="https://star-history.dera.page/svg?repos=monochrome-music/monochrome&type=date&logscale&legend=top-left" />
 </picture>
</a>
