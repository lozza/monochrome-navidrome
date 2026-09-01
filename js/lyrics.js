import { sidePanelManager } from './side-panel.js';
import { buildTrackFilename, getTrackArtists, getTrackTitle } from './utils.js';

const LRCLIB_ORIGIN = 'https://lrclib.net';
const CACHE_LIMIT = 100;

function boundedSet(map, key, value) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    while (map.size > CACHE_LIMIT) map.delete(map.keys().next().value);
}

function normalizeArtist(track) {
    return getTrackArtists(track) || track?.artist?.name || '';
}

function normalizeDurationSeconds(duration) {
    const value = Number(duration || 0);
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.round(value > 100_000 ? value / 1000 : value);
}

function formatTimestamp(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(safe / 60);
    const remainder = safe - minutes * 60;
    return `[${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}]`;
}

function structuredLyricsToLrc(structured) {
    const entries = Array.isArray(structured) ? structured : structured ? [structured] : [];
    const preferred = entries.find((entry) => entry?.synced === true) || entries[0];
    const lines = Array.isArray(preferred?.line) ? preferred.line : [];
    const lrc = lines
        .map((line) => {
            const text = line?.value ?? line?.text ?? '';
            const start = Number(line?.start ?? line?.startTime);
            if (!text) return '';
            return Number.isFinite(start) ? `${formatTimestamp(start / 1000)}${text}` : text;
        })
        .filter(Boolean)
        .join('\n');
    return lrc || preferred?.lyrics || preferred?.value || '';
}

export class LyricsManager {
    static #instance = null;

    static get instance() {
        return LyricsManager.#instance;
    }

    static async initialize(api) {
        LyricsManager.#instance = new LyricsManager(api);
        return LyricsManager.#instance;
    }

    constructor(api = null) {
        this.api = api;
        this.lyricsCache = new Map();
        this.timingOffset = 0;
    }

    async fetchLyrics(trackId, track = null) {
        const cacheKey = String(trackId || track?.id || '');
        if (cacheKey && this.lyricsCache.has(cacheKey)) return this.lyricsCache.get(cacheKey);

        const serverLyrics = await this.api?.getLyrics?.(cacheKey).catch(() => null);
        if (serverLyrics) {
            const subtitles = structuredLyricsToLrc(serverLyrics.structuredLyrics || serverLyrics);
            if (subtitles) {
                const result = {
                    subtitles,
                    plainLyrics: serverLyrics.plainLyrics || '',
                    lyricsProvider: 'Navidrome',
                };
                if (cacheKey) boundedSet(this.lyricsCache, cacheKey, result);
                return result;
            }
        }

        if (!track) return null;
        const title = getTrackTitle(track);
        const artist = normalizeArtist(track);
        if (!title || !artist) return null;

        const params = new URLSearchParams({ track_name: title, artist_name: artist });
        const album = track.album?.title || track.album?.name;
        const duration = normalizeDurationSeconds(track.duration);
        if (album) params.set('album_name', album);
        if (duration) params.set('duration', String(duration));

        try {
            const response = await fetch(`${LRCLIB_ORIGIN}/api/get?${params}`, {
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) return null;
            const payload = await response.json();
            const subtitles = payload.syncedLyrics || payload.plainLyrics || '';
            if (!subtitles) return null;
            const result = {
                subtitles,
                plainLyrics: payload.plainLyrics || '',
                lyricsProvider: 'LRCLIB',
            };
            if (cacheKey) boundedSet(this.lyricsCache, cacheKey, result);
            return result;
        } catch {
            return null;
        }
    }

    parseSyncedLyrics(subtitles) {
        if (!subtitles) return [];
        return String(subtitles)
            .split(/\r?\n/)
            .flatMap((line) => {
                const matches = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
                const text = line.replace(/\[(\d+):(\d+(?:\.\d+)?)\]/g, '').trim();
                if (!matches.length || !text) return [];
                return matches.map((match) => ({
                    time: Number(match[1]) * 60 + Number(match[2]),
                    text,
                }));
            })
            .sort((a, b) => a.time - b.time);
    }

    generateLRCContent(lyricsData, track) {
        if (!lyricsData?.subtitles) return null;
        const header = [
            `[ti:${getTrackTitle(track)}]`,
            `[ar:${normalizeArtist(track)}]`,
            `[al:${track?.album?.title || track?.album?.name || 'Unknown Album'}]`,
            `[by:${lyricsData.lyricsProvider || 'Unknown'}]`,
            '',
        ].join('\n');
        return `${header}${lyricsData.subtitles}`;
    }

    getLRC(lyricsData, track) {
        const content = this.generateLRCContent(lyricsData, track);
        if (!content) return null;
        const name = buildTrackFilename(track, 'LOSSLESS').replace(/\.[^.]+$/, '.lrc');
        return new File([content], name, { type: 'text/plain;charset=utf-8' });
    }

    downloadLRC(lyricsData, track) {
        const file = this.getLRC(lyricsData, track);
        if (!file) return false;
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
        return true;
    }
}

function cleanupLyrics(container) {
    container?.lyricsCleanup?.();
    if (container) container.lyricsCleanup = null;
}

async function renderLyrics(container, track, audioPlayer, manager) {
    cleanupLyrics(container);
    container.replaceChildren();

    const status = document.createElement('p');
    status.className = 'placeholder';
    status.textContent = 'Loading lyrics…';
    container.appendChild(status);

    const data = await manager.fetchLyrics(track?.id, track);
    if (!data) {
        status.textContent = 'No lyrics were found for this track.';
        return null;
    }

    const synced = manager.parseSyncedLyrics(data.subtitles);
    const lines = synced.length
        ? synced
        : String(data.plainLyrics || data.subtitles)
              .split(/\r?\n/)
              .filter(Boolean)
              .map((text) => ({ time: null, text }));

    const list = document.createElement('div');
    list.className = 'navichrome-lyrics';
    const elements = lines.map((line) => {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = 'navichrome-lyrics-line';
        element.textContent = line.text;
        if (line.time === null) element.disabled = true;
        else {
            element.addEventListener('click', () => {
                audioPlayer.currentTime = Math.max(0, line.time - manager.timingOffset / 1000);
            });
        }
        list.appendChild(element);
        return element;
    });

    const provider = document.createElement('small');
    provider.className = 'navichrome-lyrics-provider';
    provider.textContent = `Lyrics: ${data.lyricsProvider}`;
    container.replaceChildren(list, provider);

    let activeIndex = -1;
    const update = () => {
        if (!synced.length) return;
        const time = audioPlayer.currentTime + manager.timingOffset / 1000;
        let nextIndex = -1;
        for (let index = 0; index < synced.length; index += 1) {
            if (synced[index].time <= time) nextIndex = index;
            else break;
        }
        if (nextIndex === activeIndex) return;
        if (activeIndex >= 0) elements[activeIndex]?.classList.remove('active');
        activeIndex = nextIndex;
        if (activeIndex >= 0) {
            elements[activeIndex]?.classList.add('active');
            elements[activeIndex]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    };
    audioPlayer.addEventListener('timeupdate', update);
    container.lyricsCleanup = () => audioPlayer.removeEventListener('timeupdate', update);
    update();
    return list;
}

function renderControls(container, track, audioPlayer, manager) {
    const earlier = document.createElement('button');
    const offset = document.createElement('span');
    const later = document.createElement('button');
    const close = document.createElement('button');
    earlier.type = later.type = close.type = 'button';
    earlier.className = later.className = close.className = 'btn-icon';
    earlier.textContent = '−';
    later.textContent = '+';
    close.textContent = '×';
    earlier.title = 'Show lyrics 0.5 seconds earlier';
    later.title = 'Show lyrics 0.5 seconds later';
    close.title = 'Close lyrics';
    const updateOffset = () => {
        offset.textContent = `${manager.timingOffset >= 0 ? '+' : ''}${(manager.timingOffset / 1000).toFixed(1)}s`;
    };
    earlier.addEventListener('click', () => {
        manager.timingOffset -= 500;
        updateOffset();
    });
    later.addEventListener('click', () => {
        manager.timingOffset += 500;
        updateOffset();
    });
    close.addEventListener('click', () => {
        clearLyricsPanelSync(audioPlayer, sidePanelManager.panel);
        sidePanelManager.close();
    });
    updateOffset();
    container.replaceChildren(earlier, offset, later, close);
    void track;
}

export function openLyricsPanel(track, audioPlayer, lyricsManager, forceOpen = false) {
    const manager = lyricsManager || LyricsManager.instance || new LyricsManager();
    sidePanelManager.open(
        'lyrics',
        'Lyrics',
        (container) => renderControls(container, track, audioPlayer, manager),
        (container) => renderLyrics(container, track, audioPlayer, manager),
        forceOpen
    );
}

export async function renderLyricsInFullscreen(track, audioPlayer, lyricsManager, container) {
    return renderLyrics(container, track, audioPlayer, lyricsManager || LyricsManager.instance || new LyricsManager());
}

export function clearFullscreenLyricsSync(container) {
    cleanupLyrics(container);
}

export function clearLyricsPanelSync(_audioPlayer, panel = sidePanelManager.panel) {
    cleanupLyrics(panel);
    cleanupLyrics(panel?.querySelector?.('#side-panel-content'));
}
