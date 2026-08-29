import { trackDataStore } from './utils.js';
import { MusicAPI } from './music-api.js';

const resolvedAlbumCovers = new Map();
const pendingAlbumCovers = new Map();

function getApi() {
    return MusicAPI.instance?.getAPI?.() || null;
}

function getRequestedSize(image) {
    if (image.id === 'fullscreen-cover-image') return '1280';
    if (image.classList.contains('track-item-cover') || image.classList.contains('cover')) return '80';
    return '320';
}

function isNavidromeCoverRequest(image) {
    if (!(image instanceof HTMLImageElement)) return false;
    const src = String(image.currentSrc || image.src || image.getAttribute('src') || '');
    return src.includes('/rest/getCoverArt.view');
}

function concealArtwork(image) {
    if (!(image instanceof HTMLImageElement)) return;
    if (!Object.prototype.hasOwnProperty.call(image.dataset, 'navichromeArtworkOriginalVisibility')) {
        image.dataset.navichromeArtworkOriginalVisibility = image.style.visibility || '';
    }
    image.style.visibility = 'hidden';
}

function revealArtwork(image) {
    if (!(image instanceof HTMLImageElement)) return;
    const original = image.dataset.navichromeArtworkOriginalVisibility;
    if (original) image.style.visibility = original;
    else image.style.removeProperty('visibility');
}

function primeArtworkImage(image) {
    if (!(image instanceof HTMLImageElement)) return;

    if (image.dataset.navichromeArtworkLoadListener !== 'true') {
        image.dataset.navichromeArtworkLoadListener = 'true';
        image.addEventListener('load', () => revealArtwork(image));
    }

    if (!isNavidromeCoverRequest(image)) return;

    // Do not let the browser briefly paint its broken-image icon/alt text while
    // we resolve a better Navidrome cover ID. MutationObserver callbacks run
    // before the next paint, so newly inserted artwork stays visually stable.
    if (!(image.complete && image.naturalWidth > 0)) concealArtwork(image);
    else revealArtwork(image);
}

async function getAlbumIdForImage(image) {
    const albumCard = image.closest?.('[data-album-id]');
    if (albumCard?.dataset?.albumId) return String(albumCard.dataset.albumId);

    const trackRow = image.closest?.('[data-track-id]');
    if (trackRow) {
        const track = trackDataStore.get(trackRow);
        if (track?.album?.id) return String(track.album.id);
    }

    if (image.closest?.('.now-playing-bar') || image.id === 'fullscreen-cover-image') {
        try {
            const { Player } = await import('./player.js');
            const albumId = Player.instance?.currentTrack?.album?.id;
            if (albumId) return String(albumId);
        } catch {
            // Player may not be initialized yet.
        }
    }

    return '';
}

async function resolveAlbumCover(albumId) {
    if (!albumId) return '';
    if (resolvedAlbumCovers.has(albumId)) return resolvedAlbumCovers.get(albumId);
    if (pendingAlbumCovers.has(albumId)) return pendingAlbumCovers.get(albumId);

    const promise = (async () => {
        const api = getApi();
        if (!api?.request || !api?.getCoverUrl) return '';

        try {
            const root = await api.request('getAlbum', { id: albumId });
            const coverArt = root?.album?.coverArt;
            const resolved = coverArt ? String(coverArt) : '';
            resolvedAlbumCovers.set(albumId, resolved);
            return resolved;
        } catch (error) {
            console.warn(`Could not recover artwork for album ${albumId}:`, error);
            resolvedAlbumCovers.set(albumId, '');
            return '';
        } finally {
            pendingAlbumCovers.delete(albumId);
        }
    })();

    pendingAlbumCovers.set(albumId, promise);
    return promise;
}

function usePlaceholder(image) {
    if (image.dataset.navichromeArtworkPlaceholder === 'true') return;
    image.dataset.navichromeArtworkPlaceholder = 'true';
    image.removeAttribute('srcset');
    concealArtwork(image);
    image.src = '/images/navichrome_logo.svg';
}

async function recoverBrokenArtwork(image) {
    if (!(image instanceof HTMLImageElement)) return;
    if (image.dataset.navichromeArtworkRecovery === 'working') return;
    if (image.dataset.navichromeArtworkPlaceholder === 'true') return;

    const src = String(image.currentSrc || image.src || '');
    const looksLikeMusicArtwork =
        src.includes('/rest/getCoverArt.view') ||
        image.classList.contains('card-image') ||
        image.classList.contains('track-item-cover') ||
        image.classList.contains('cover') ||
        image.id === 'fullscreen-cover-image';

    if (!looksLikeMusicArtwork) return;

    // Keep a failed request invisible while recovery happens. Without this the
    // browser can alternate between an empty card and its broken-image/alt-text
    // rendering, which looks like the artwork is flashing.
    concealArtwork(image);
    image.dataset.navichromeArtworkRecovery = 'working';
    const albumId = await getAlbumIdForImage(image);
    const coverArt = await resolveAlbumCover(albumId);
    const api = getApi();

    if (coverArt && api?.getCoverUrl) {
        const recoveredUrl = api.getCoverUrl(coverArt, getRequestedSize(image));
        const previousUrl = String(image.currentSrc || image.src || '');
        if (recoveredUrl && recoveredUrl !== previousUrl) {
            image.removeAttribute('srcset');
            image.dataset.navichromeArtworkRecovery = 'retried';
            image.src = recoveredUrl;
            return;
        }
    }

    image.dataset.navichromeArtworkRecovery = 'failed';
    usePlaceholder(image);
}

if (!window.__navichromeCoverRecoveryInstalled) {
    window.__navichromeCoverRecoveryInstalled = true;

    document.querySelectorAll('img').forEach((image) => primeArtworkImage(image));

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
                primeArtworkImage(mutation.target);
                continue;
            }

            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                if (node instanceof HTMLImageElement) primeArtworkImage(node);
                node.querySelectorAll?.('img').forEach((image) => primeArtworkImage(image));
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'srcset'],
    });

    document.addEventListener(
        'error',
        (event) => {
            if (event.target instanceof HTMLImageElement) {
                void recoverBrokenArtwork(event.target);
            }
        },
        true
    );
}
