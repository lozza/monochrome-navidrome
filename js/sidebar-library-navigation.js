import { db } from './db.js';
import { createPlaceholder, trackDataStore } from './utils.js';

let navigationPrepared = false;
let recentlyAddedLoaded = false;

const SIDEBAR_ICONS = {
    playlists: `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15V6"></path>
            <path d="M18.5 18.5a2.5 2.5 0 1 0 2.5-2.5V8"></path>
            <path d="M3 6h8"></path>
            <path d="M3 12h8"></path>
            <path d="M3 18h8"></path>
        </svg>
    `,
    starred: `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>
    `,
};

function makeSidebarItem(id, href, icon, label) {
    const item = document.createElement('li');
    item.className = 'nav-item';
    item.id = id;
    item.innerHTML = `
        <a href="${href}">
            ${icon}
            <span>${label}</span>
        </a>
    `;
    return item;
}

function ensureSidebarItems() {
    const mainList = document.querySelector('.sidebar-nav.main ul');
    if (!mainList) return;

    let playlistsItem = document.getElementById('sidebar-nav-playlists');
    let starredItem = document.getElementById('sidebar-nav-starred');

    if (!playlistsItem) {
        playlistsItem = makeSidebarItem('sidebar-nav-playlists', '/playlists', SIDEBAR_ICONS.playlists, 'Playlists');
    }

    if (!starredItem) {
        starredItem = makeSidebarItem('sidebar-nav-starred', '/starred', SIDEBAR_ICONS.starred, 'Starred');
    }

    const orderedItems = [
        document.getElementById('sidebar-nav-home'),
        document.getElementById('sidebar-nav-library'),
        playlistsItem,
        starredItem,
        document.getElementById('sidebar-nav-recent'),
    ];

    // Keep the visible order deterministic even if another part of the app
    // later moves one of these nodes in the DOM.
    mainList.style.display = 'flex';
    mainList.style.flexDirection = 'column';
    orderedItems.forEach((item, index) => {
        if (!item) return;
        item.style.order = String(index - orderedItems.length);
        mainList.appendChild(item);
    });

    const settingsItem = document.getElementById('sidebar-nav-settings');
    const bottomList = document.querySelector('.sidebar-nav.bottom ul');
    if (settingsItem && bottomList) bottomList.prepend(settingsItem);
}

function ensureStandalonePages() {
    const libraryPage = document.getElementById('page-library');
    if (!libraryPage) return;

    if (!document.getElementById('page-playlists')) {
        const playlistsPage = document.createElement('div');
        playlistsPage.id = 'page-playlists';
        playlistsPage.className = 'page';
        playlistsPage.innerHTML = `
            <section class="content-section">
                <h2 class="section-title">Playlists</h2>
                <div class="card-grid" id="playlists-page-container"></div>
            </section>
        `;
        libraryPage.after(playlistsPage);
    }

    if (!document.getElementById('page-starred')) {
        const starredPage = document.createElement('div');
        starredPage.id = 'page-starred';
        starredPage.className = 'page';
        starredPage.innerHTML = `
            <section class="content-section">
                <h2 class="section-title">Starred</h2>
                <div class="track-list" id="starred-page-container"></div>
            </section>
        `;
        document.getElementById('page-playlists')?.after(starredPage);
    }
}

function prepareLibraryLayout() {
    const libraryPage = document.getElementById('page-library');
    if (!libraryPage) return;

    const myPlaylistsContainer = document.getElementById('my-playlists-container');
    const myPlaylistsSection = myPlaylistsContainer?.closest('.content-section');
    if (myPlaylistsSection) myPlaylistsSection.style.display = 'none';

    libraryPage.querySelector('.search-tab[data-tab="tracks"]')?.remove();
    libraryPage.querySelector('.search-tab[data-tab="playlists"]')?.remove();

    const tabs = libraryPage.querySelector('.search-tabs');
    const albumsTab = libraryPage.querySelector('.search-tab[data-tab="albums"]');
    if (tabs && !libraryPage.querySelector('.search-tab[data-tab="recently-added"]')) {
        const recentTab = document.createElement('button');
        recentTab.className = 'search-tab active';
        recentTab.dataset.tab = 'recently-added';
        recentTab.textContent = 'Recently Added';
        tabs.insertBefore(recentTab, albumsTab || tabs.firstChild);
    }

    libraryPage.querySelectorAll('.search-tab').forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.tab === 'recently-added');
    });

    if (!document.getElementById('library-tab-recently-added')) {
        const recentContent = document.createElement('div');
        recentContent.id = 'library-tab-recently-added';
        recentContent.className = 'search-tab-content active';
        recentContent.innerHTML = '<div class="card-grid" id="library-recently-added-container"></div>';
        const albumsContent = document.getElementById('library-tab-albums');
        if (albumsContent) {
            albumsContent.before(recentContent);
        } else {
            libraryPage.querySelector('.content-section:last-of-type')?.appendChild(recentContent);
        }
    }

    libraryPage.querySelectorAll('.search-tab-content').forEach((content) => {
        content.classList.toggle('active', content.id === 'library-tab-recently-added');
    });
}

export function ensureLibraryNavigation() {
    if (navigationPrepared) return;

    ensureSidebarItems();
    ensureStandalonePages();
    prepareLibraryLayout();
    navigationPrepared = true;
}

export async function renderPlaylistsPage(ui) {
    ensureLibraryNavigation();
    await ui.showPage('playlists');

    const container = document.getElementById('playlists-page-container');
    if (!container) return;

    container.innerHTML = ui.createSkeletonCards?.(8, false) || '';

    try {
        const playlists = await ui.api.getPlaylists();
        if (!playlists?.length) {
            container.innerHTML = createPlaceholder('No Navidrome playlists found.');
            return;
        }

        container.innerHTML = playlists.map((playlist) => ui.createPlaylistCardHTML(playlist)).join('');

        for (const playlist of playlists) {
            const element = container.querySelector(`[data-playlist-id="${playlist.uuid}"]`);
            if (element) trackDataStore.set(element, playlist);
        }

        window.setTimeout(() => {
            for (const playlist of playlists) {
                const element = container.querySelector(`[data-playlist-id="${playlist.uuid}"]`);
                if (element) void ui.updateLikeState(element, 'playlist', playlist.uuid);
            }
        }, 0);
    } catch (error) {
        console.error('Could not load playlists:', error);
        container.innerHTML = createPlaceholder('Could not load Navidrome playlists.');
    }
}

export async function renderStarredPage(ui) {
    ensureLibraryNavigation();
    await ui.showPage('starred');

    const container = document.getElementById('starred-page-container');
    if (!container) return;

    container.innerHTML = ui.createSkeletonTracks?.(10, true) || '';

    try {
        const tracks = await db.getFavorites('track');
        if (!tracks?.length) {
            container.innerHTML = createPlaceholder('No starred tracks yet.');
            return;
        }

        await ui.renderListWithTracks(container, tracks, true, false, false, true);
    } catch (error) {
        console.error('Could not load starred tracks:', error);
        container.innerHTML = createPlaceholder('Could not load starred tracks.');
    }
}

export async function renderRecentlyAddedLibrary(ui, force = false) {
    ensureLibraryNavigation();

    const container = document.getElementById('library-recently-added-container');
    if (!container || (recentlyAddedLoaded && !force)) return;

    container.innerHTML = ui.createSkeletonCards?.(12, false) || '';

    try {
        const albums = await ui.api.getAlbums('newest', 48);
        const seen = new Set();
        const uniqueAlbums = (albums || []).filter((album) => {
            const key = String(album?.id || `${album?.title || ''}:${album?.artist?.id || album?.artist?.name || ''}`);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        if (!uniqueAlbums.length) {
            container.innerHTML = createPlaceholder('No recently added albums found.');
            recentlyAddedLoaded = true;
            return;
        }

        container.innerHTML = uniqueAlbums.map((album) => ui.createAlbumCardHTML(album)).join('');

        for (const album of uniqueAlbums) {
            const element = container.querySelector(`[data-album-id="${album.id}"]`);
            if (element) trackDataStore.set(element, album);
        }

        recentlyAddedLoaded = true;
        window.setTimeout(() => {
            for (const album of uniqueAlbums) {
                const element = container.querySelector(`[data-album-id="${album.id}"]`);
                if (element) void ui.updateLikeState(element, 'album', album.id);
            }
        }, 0);
    } catch (error) {
        console.error('Could not load recently added albums:', error);
        container.innerHTML = createPlaceholder('Could not load recently added albums.');
    }
}
