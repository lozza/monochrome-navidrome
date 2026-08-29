//router.js
import { getTrackArtists } from './utils.js';
import { loadProfile } from './profile.js';
import { prepareLibrarySingles, renderLibrarySingles } from './library-singles.js';
import { enhanceSinglesAlphabetIndex } from './singles-alpha-index.js';
import { prepareNavidromePlaylistsLayout, promoteNavidromePlaylists } from './navidrome-library-playlists.js';
import './navidrome-migration-compat.js';
import './navidrome-starred-compat.js';
import './navidrome-cover-recovery.js';
import './lyrics-component-bootstrap.js';

export function navigate(path) {
    if (path === window.location.pathname) {
        return;
    }
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
}

export function createRouter(ui) {
    const router = async () => {
        if (window.location.hash && window.location.hash.length > 1) {
            const hash = window.location.hash.substring(1);
            if (hash.includes('/')) {
                const newPath = hash.startsWith('/') ? hash : '/' + hash;
                window.history.replaceState(null, '', newPath);
            }
        }

        let path = window.location.pathname;

        if (path.startsWith('/')) path = path.substring(1);
        if (path.endsWith('/')) path = path.substring(0, path.length - 1);
        if (path === '' || path === 'index.html') path = 'home';

        const parts = path.split('/');
        const page = parts[0];
        const param = parts.slice(1).join('/');

        // Helper to extract provider prefix and ID from params
        // Supports formats like: /track/t/123 (Tidal), /track/123 (default)
        const extractProviderAndId = (p) => {
            if (p.startsWith('t/')) {
                return { provider: 'tidal', id: p.slice(2) };
            }
            return { provider: null, id: p };
        };

        switch (page) {
            case 'parties':
                await ui.renderPartiesPage();
                break;
            case 'party':
                await ui.renderPartyDetailPage(param);
                break;
            case 'search':
                await ui.renderSearchPage(decodeURIComponent(param));
                break;
            case 'album': {
                const { provider, id } = extractProviderAndId(param);
                await ui.renderAlbumPage(id, provider);
                break;
            }
            case 'artist': {
                const { provider, id } = extractProviderAndId(param);
                await ui.renderArtistPage(id, provider);
                break;
            }
            case 'playlist': {
                const { provider, id } = extractProviderAndId(param);
                await ui.renderPlaylistPage(id, 'api', provider);
                break;
            }
            case 'userplaylist':
                await ui.renderPlaylistPage(param, 'user');
                break;
            case 'folder':
                await ui.renderFolderPage(param);
                break;
            case 'mix': {
                const { provider, id } = extractProviderAndId(param);
                await ui.renderMixPage(id, provider);
                break;
            }
            case 'track': {
                const { provider, id } = extractProviderAndId(param);
                await ui.renderTrackPage(id, provider);
                break;
            }
            case 'library': {
                const singlesContainer = document.getElementById('library-singles-container');
                if (singlesContainer) {
                    singlesContainer.style.visibility = 'hidden';
                    singlesContainer.setAttribute('aria-busy', 'true');
                }

                // Load My Playlists independently so the top of Library becomes
                // interactive without waiting for the much heavier album/artist
                // rendering and favourite-state work below.
                prepareNavidromePlaylistsLayout(ui);

                // Start the full-library Singles scan at the same time as the
                // normal Library requests instead of waiting for one to finish
                // before beginning the other.
                const singlesPromise = prepareLibrarySingles(ui);

                try {
                    await ui.renderLibraryPage();
                    promoteNavidromePlaylists();
                    const preparedSingles = await singlesPromise;
                    await renderLibrarySingles(ui, preparedSingles);
                    enhanceSinglesAlphabetIndex();
                } finally {
                    if (singlesContainer) {
                        singlesContainer.style.removeProperty('visibility');
                        singlesContainer.removeAttribute('aria-busy');
                    }
                }
                break;
            }
            case 'recent':
                await ui.renderRecentPage();
                break;
            case 'podcasts':
                if (param) {
                    await ui.renderPodcastPage(param);
                } else {
                    await ui.renderPodcastsBrowsePage();
                }
                break;
            case 'home':
                await ui.renderHomePage();
                break;
            case 'user':
                if (param && param.startsWith('@') && !param.includes('/')) {
                    await loadProfile(decodeURIComponent(param.slice(1)));
                }
                break;
            default:
                ui.showPage(page);
                break;
        }
    };

    return router;
}

export function updateTabTitle(player) {
    if (player.currentTrack) {
        const track = player.currentTrack;
        document.title = `${track.title} • ${getTrackArtists(track)}`;
    } else {
        const path = window.location.pathname;
        if (path.startsWith('/album/') || path.startsWith('/playlist/') || path.startsWith('/track/')) {
            return;
        }
        document.title = 'Navichrome';
    }
}
