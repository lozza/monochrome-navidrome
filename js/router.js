//router.js
import { getTrackArtists } from './utils.js';
import { loadProfile } from './profile.js';
import { prepareLibrarySingles, renderLibrarySingles } from './library-singles.js';
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
                const singlesTabButton = document.querySelector('#page-library .search-tab[data-tab="singles"]');

                if (singlesContainer) {
                    singlesContainer.style.visibility = 'hidden';
                    singlesContainer.setAttribute('aria-busy', 'true');
                }

                // Load My Playlists independently so the top of Library becomes
                // interactive without waiting for heavier library sections.
                prepareNavidromePlaylistsLayout(ui);

                await ui.renderLibraryPage();
                promoteNavidromePlaylists();

                // The legacy library renderer still fills this container with
                // release cards. Clear those immediately, but do not build the
                // thousands-of-rows Singles DOM until the user actually opens it.
                if (singlesContainer) {
                    singlesContainer.classList.remove('card-grid');
                    singlesContainer.classList.add('track-list');
                    singlesContainer.innerHTML = '<div class="placeholder-text">Loading tracks…</div>';
                    singlesContainer.style.removeProperty('visibility');
                    singlesContainer.removeAttribute('aria-busy');
                }

                let singlesPromise = null;
                let singlesRendered = false;
                const prepareSingles = () => (singlesPromise ||= prepareLibrarySingles(ui));

                const loadSingles = async () => {
                    if (singlesRendered) return;
                    singlesRendered = true;

                    if (singlesContainer) singlesContainer.setAttribute('aria-busy', 'true');
                    try {
                        const preparedSingles = await prepareSingles();
                        await renderLibrarySingles(ui, preparedSingles);
                    } catch (error) {
                        console.error('Could not render Singles:', error);
                        singlesRendered = false;
                    } finally {
                        singlesContainer?.removeAttribute('aria-busy');
                    }
                };

                if (singlesTabButton) {
                    if (singlesTabButton._navichromeSinglesHandler) {
                        singlesTabButton.removeEventListener('click', singlesTabButton._navichromeSinglesHandler);
                    }
                    singlesTabButton._navichromeSinglesHandler = loadSingles;
                    singlesTabButton.addEventListener('click', loadSingles);

                    if (singlesTabButton.classList.contains('active')) {
                        void loadSingles();
                    }
                }

                // Warm the data cache only when the browser has spare time. This
                // keeps normal Library navigation responsive while usually making
                // the first Singles click much faster.
                const warmSingles = () => void prepareSingles();
                if (typeof requestIdleCallback === 'function') {
                    requestIdleCallback(warmSingles, { timeout: 2500 });
                } else {
                    setTimeout(warmSingles, 1500);
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
