//router.js
import { getTrackArtists } from './utils.js';
import { prepareLibrarySingles, renderLibrarySingles } from './library-singles.js';
import { prepareNavidromePlaylistsLayout, promoteNavidromePlaylists } from './navidrome-library-playlists.js';
import './navidrome-migration-compat.js';
import './navidrome-starred-compat.js';
import './navidrome-cover-recovery.js';

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

        switch (page) {
            case 'search':
                await ui.renderSearchPage(decodeURIComponent(param));
                break;
            case 'album': {
                await ui.renderAlbumPage(param, null);
                break;
            }
            case 'artist': {
                await ui.renderArtistPage(param, null);
                break;
            }
            case 'playlist': {
                await ui.renderPlaylistPage(param, 'api', null);
                break;
            }
            case 'track': {
                await ui.renderTrackPage(param, null);
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
            case 'home':
                await ui.renderHomePage();
                break;
            default:
                if (['settings', 'about', 'account'].includes(page)) {
                    ui.showPage(page);
                } else {
                    window.history.replaceState({}, '', '/');
                    await ui.renderHomePage();
                }
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
