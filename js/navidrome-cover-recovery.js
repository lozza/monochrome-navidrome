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
