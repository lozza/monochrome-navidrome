import { db } from './db.js';
import { createPlaceholder, trackDataStore } from './utils.js';

let navigationPrepared = false;
let recentlyAddedLoaded = false;

function makeSidebarItem(id, href, icon, label) {
    const item = document.createElement('li');
    item.className = 'nav-item';
    item.id = id;
    item.innerHTML = `
        <a href="${href}">
            <use svg="!lucide/${icon}.svg" size="24" />
            <span>${label}</span>
        </a>
    `;
    return item;
}

function ensureSidebarItems() {
    const recentItem = document.getElementById('sidebar-nav-recent');
    if (!recentItem) return;

    if (!document.getElementById('sidebar-nav-playlists')) {
        recentItem.before(makeSidebarItem('sidebar-nav-playlists', '/playlists', 'list-music', 'Playlists'));
    }

    if (!document.getElementById('sidebar-nav-starred')) {
        recentItem.before(makeSidebarItem('sidebar-nav-starred', '/starred', 'heart', 'Starred'));
    }
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
