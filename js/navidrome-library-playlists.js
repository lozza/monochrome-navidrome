function getLibraryPlaylistElements() {
    return {
        navidromeTab: document.querySelector('#page-library .search-tab[data-tab="playlists"]'),
        navidromeTabContent: document.getElementById('library-tab-playlists'),
        navidromeContainer: document.getElementById('library-playlists-container'),
        myPlaylistsContainer: document.getElementById('my-playlists-container'),
        myFoldersContainer: document.getElementById('my-folders-container'),
    };
}

export function prepareNavidromePlaylistsLayout() {
    const { navidromeTab, navidromeTabContent, myPlaylistsContainer, myFoldersContainer } =
        getLibraryPlaylistElements();

    // Navidrome is the source of truth for playlists in Navichrome. Keep one
    // playlist area at the top of Library instead of showing a duplicate tab.
    navidromeTab?.remove();
    if (navidromeTabContent) navidromeTabContent.style.display = 'none';

    if (myFoldersContainer) myFoldersContainer.style.display = 'none';
    if (myPlaylistsContainer) {
        myPlaylistsContainer.style.visibility = 'hidden';
        myPlaylistsContainer.setAttribute('aria-busy', 'true');
    }
}

export function promoteNavidromePlaylists() {
    const {
        navidromeTab,
        navidromeTabContent,
        navidromeContainer,
        myPlaylistsContainer,
        myFoldersContainer,
    } = getLibraryPlaylistElements();

    navidromeTab?.remove();
    if (myFoldersContainer) {
        myFoldersContainer.replaceChildren();
        myFoldersContainer.style.display = 'none';
    }

    if (myPlaylistsContainer && navidromeContainer) {
        // renderLibraryPage has already populated the Navidrome playlist tab.
        // Move those exact nodes so their trackDataStore associations and event
        // behaviour are preserved, while removing the old local playlist cards
        // and create-folder/create-playlist controls from this Navidrome view.
        const navidromePlaylistNodes = Array.from(navidromeContainer.childNodes);
        myPlaylistsContainer.replaceChildren(...navidromePlaylistNodes);
        myPlaylistsContainer.style.removeProperty('visibility');
        myPlaylistsContainer.removeAttribute('aria-busy');
    }

    // The duplicate tab is no longer part of the Library UI.
    navidromeTabContent?.remove();
}
