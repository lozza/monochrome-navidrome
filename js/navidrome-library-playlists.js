import { trackDataStore } from './utils.js';

function getLibraryPlaylistElements() {
    return {
        navidromeTab: document.querySelector('#page-library .search-tab[data-tab="playlists"]'),
        navidromeTabContent: document.getElementById('library-tab-playlists'),
        navidromeContainer: document.getElementById('library-playlists-container'),
        myPlaylistsContainer: document.getElementById('my-playlists-container'),
        myFoldersContainer: document.getElementById('my-folders-container'),
    };
}

function renderPreparedPlaylists(ui, container, playlists) {
    if (!container) return;

    if (!playlists?.length) {
        container.innerHTML = '<div class="placeholder-text">No Navidrome playlists found.</div>';
        container.style.removeProperty('visibility');
        container.removeAttribute('aria-busy');
        return;
    }

    container.innerHTML = playlists.map((playlist) => ui.createPlaylistCardHTML(playlist)).join('');

    for (const playlist of playlists) {
        const element = container.querySelector(`[data-playlist-id="${playlist.uuid}"]`);
        if (element) trackDataStore.set(element, playlist);
    }

    container.style.removeProperty('visibility');
    container.removeAttribute('aria-busy');

    // Favourite-state decoration is not required before the cards become usable.
    // Let it finish in the background instead of holding the Library page hostage.
    window.setTimeout(() => {
        for (const playlist of playlists) {
            const element = container.querySelector(`[data-playlist-id="${playlist.uuid}"]`);
            if (element) void ui.updateLikeState(element, 'playlist', playlist.uuid);
        }
    }, 0);
}

export function prepareNavidromePlaylistsLayout(ui) {
    const { navidromeTab, navidromeTabContent, myPlaylistsContainer, myFoldersContainer } =
        getLibraryPlaylistElements();

    // Navidrome is the source of truth for playlists in Navichrome. Keep one
    // playlist area at the top of Library instead of showing a duplicate tab.
    navidromeTab?.remove();
    if (navidromeTabContent) navidromeTabContent.style.display = 'none';
    if (myFoldersContainer) myFoldersContainer.style.display = 'none';

    if (!myPlaylistsContainer || !ui?.api?.getPlaylists) return;

    // Previously this container stayed hidden until renderLibraryPage had
    // finished albums, artists, favourite-state lookups and local-library work.
    // Fetch the tiny playlist list independently so My Playlists becomes usable
    // as soon as Navidrome answers, while the rest of Library continues loading.
    myPlaylistsContainer.setAttribute('aria-busy', 'true');
    myPlaylistsContainer.style.removeProperty('visibility');
    myPlaylistsContainer.innerHTML = ui.createSkeletonCards?.(4, false) || '';

    void ui.api
        .getPlaylists()
        .then((playlists) => renderPreparedPlaylists(ui, myPlaylistsContainer, playlists))
        .catch((error) => {
            console.warn('Could not load Navidrome playlists early:', error);
            myPlaylistsContainer.innerHTML = '<div class="placeholder-text">Could not load Navidrome playlists.</div>';
            myPlaylistsContainer.removeAttribute('aria-busy');
        });
}

export function promoteNavidromePlaylists() {
    const { navidromeTab, navidromeTabContent, navidromeContainer, myPlaylistsContainer, myFoldersContainer } =
        getLibraryPlaylistElements();

    navidromeTab?.remove();
    if (myFoldersContainer) {
        myFoldersContainer.replaceChildren();
        myFoldersContainer.style.display = 'none';
    }

    if (myPlaylistsContainer && navidromeContainer && navidromeContainer.childNodes.length) {
        // renderLibraryPage also loads the playlist list as part of its normal
        // work. Once it finishes, swap in those canonical nodes so all existing
        // data/event associations are retained. Until then the independently
        // loaded cards above remain fully usable.
        const navidromePlaylistNodes = Array.from(navidromeContainer.childNodes);
        myPlaylistsContainer.replaceChildren(...navidromePlaylistNodes);
    }

    if (myPlaylistsContainer) {
        myPlaylistsContainer.style.removeProperty('visibility');
        myPlaylistsContainer.removeAttribute('aria-busy');
    }

    // The duplicate tab is no longer part of the Library UI.
    navidromeTabContent?.remove();
}
