import { showNotification } from './downloads.js';
import { SVG_BIN } from './icons.js';
import { createNavidromePlaylistService } from './navidrome-playlist-service.js';
import { escapeHtml, trackDataStore } from './utils.js';

let activeUI = null;
let service = null;
let installed = false;

function rerenderRoute() {
    window.dispatchEvent(new Event('popstate'));
}

function currentPlaylistId() {
    return window.location.pathname.match(/^\/playlist\/([^/]+)$/)?.[1] || null;
}

function nativeModal() {
    return document.getElementById('playlist-modal');
}

function setLegacyPlaylistFieldsVisible(visible) {
    const cover = document.getElementById('playlist-cover-wrapper');
    const importSection = document.getElementById('import-section');
    const share = document.getElementById('playlist-share-btn');
    if (cover) cover.style.display = visible ? '' : 'none';
    if (importSection) importSection.style.display = 'none';
    if (share) share.style.display = 'none';
}

function clearNativeModal() {
    const modal = nativeModal();
    if (!modal) return;
    delete modal.dataset.navidromeMode;
    delete modal.dataset.navidromePlaylistId;
    delete modal._pendingTracks;
    setLegacyPlaylistFieldsVisible(true);
}

function openNativeModal({ mode, playlistId = '', name = '', comment = '', isPublic = false, tracks = [] }) {
    const modal = nativeModal();
    if (!modal) return;

    modal.dataset.navidromeMode = mode;
    modal.dataset.navidromePlaylistId = playlistId;
    modal._pendingTracks = Array.isArray(tracks) ? tracks : [];

    const title = document.getElementById('playlist-modal-title');
    const nameInput = document.getElementById('playlist-name-input');
    const description = document.getElementById('playlist-description-input');
    const publicToggle = document.getElementById('playlist-public-toggle');

    if (title) title.textContent = mode === 'edit' ? 'Edit Playlist' : 'Create Playlist';
    if (nameInput) nameInput.value = name;
    if (description) description.value = comment;
    if (publicToggle) publicToggle.checked = isPublic;

    setLegacyPlaylistFieldsVisible(false);
    modal.classList.add('active');
    nameInput?.focus();
}

export function openCreateNavidromePlaylist(tracks = []) {
    openNativeModal({ mode: 'create', tracks });
}

async function openEditNavidromePlaylist(playlistId) {
    const data = await service.get(playlistId);
    if (!service.canEdit(data.playlist)) {
        showNotification('This playlist is read-only for the current Navidrome user.');
        return;
    }

    openNativeModal({
        mode: 'edit',
        playlistId,
        name: data.playlist.name || data.playlist.title || '',
        comment: data.playlist.comment || '',
        isPublic: data.playlist.public === true,
    });
}

async function saveNativeModal(event) {
    const modal = nativeModal();
    if (!modal?.dataset.navidromeMode) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const saveButton = document.getElementById('playlist-modal-save');
    const name = document.getElementById('playlist-name-input')?.value.trim() || '';
    const comment = document.getElementById('playlist-description-input')?.value.trim() || '';
    const isPublic = document.getElementById('playlist-public-toggle')?.checked === true;

    if (!name) {
        showNotification('Please enter a playlist name.');
        return true;
    }

    const oldLabel = saveButton?.textContent || 'Save';
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Saving…';
    }

    try {
        if (modal.dataset.navidromeMode === 'edit') {
            await service.updateMetadata(modal.dataset.navidromePlaylistId, {
                name,
                comment,
                public: isPublic,
            });
            showNotification(`Updated playlist “${name}”`);
        } else {
            const tracks = Array.isArray(modal._pendingTracks) ? modal._pendingTracks : [];
            await service.create(name, tracks, { comment, public: isPublic });
            const detail = tracks.length ? ` with ${tracks.length} tracks` : '';
            showNotification(`Created playlist “${name}”${detail}`);
        }

        modal.classList.remove('active');
        clearNativeModal();
        rerenderRoute();
    } catch (error) {
        console.error('Navidrome playlist save failed:', error);
        showNotification(`Could not save playlist: ${error.message}`);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = oldLabel;
        }
    }

    return true;
}

async function openPlaylistPicker(tracks, title = 'Add to Playlist') {
    const selectedTracks = (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean);
    if (!selectedTracks.length) return;

    const modal = document.getElementById('playlist-select-modal');
    const list = document.getElementById('playlist-select-list');
    const cancel = document.getElementById('playlist-select-cancel');
    const overlay = modal?.querySelector('.modal-overlay');
    if (!modal || !list || !cancel || !overlay) return;

    let playlists;
    try {
        playlists = await service.list();
    } catch (error) {
        showNotification(`Could not load playlists: ${error.message}`);
        return;
    }

    const heading = modal.querySelector('h3');
    if (heading) heading.textContent = title;

    const playlistOptions = playlists
        .map((playlist) => {
            const id = escapeHtml(String(playlist.id || playlist.uuid));
            const name = escapeHtml(playlist.name || playlist.title || 'Untitled Playlist');
            const count = Number(playlist.numberOfTracks || playlist.songCount || 0);
            return `
                <div class="modal-option" data-navidrome-playlist-id="${id}">
                    <span>${name}</span>
                    <span style="color: var(--muted-foreground); font-size: 0.85rem;">${count} tracks</span>
                </div>
            `;
        })
        .join('');

    list.innerHTML = `
        <div class="modal-option create-new-option" data-navidrome-create="true">
            <span style="font-weight: 600; color: var(--primary);">+ Create New Playlist</span>
        </div>
        ${playlistOptions}
    `;

    const close = () => {
        modal.classList.remove('active');
        cancel.removeEventListener('click', close);
        overlay.removeEventListener('click', close);
        list.removeEventListener('click', choose);
    };

    const choose = async (event) => {
        const option = event.target.closest('.modal-option');
        if (!option) return;

        if (option.dataset.navidromeCreate === 'true') {
            close();
            openCreateNavidromePlaylist(selectedTracks);
            return;
        }

        const playlistId = option.dataset.navidromePlaylistId;
        if (!playlistId) return;
        option.setAttribute('aria-busy', 'true');

        try {
            const result = await service.addTracks(playlistId, selectedTracks);
            const name = result.playlist?.name || option.querySelector('span')?.textContent || 'playlist';
            const noun = selectedTracks.length === 1 ? 'track' : 'tracks';
            showNotification(`Added ${selectedTracks.length} ${noun} to ${name}`);
            close();
            if (currentPlaylistId() === playlistId) rerenderRoute();
        } catch (error) {
            showNotification(`Could not add to playlist: ${error.message}`);
            option.removeAttribute('aria-busy');
        }
    };

    cancel.addEventListener('click', close);
    overlay.addEventListener('click', close);
    list.addEventListener('click', choose);
    modal.classList.add('active');
}

function selectedPageTracks() {
    return [...document.querySelectorAll('.track-item.selected')]
        .map((element) => trackDataStore.get(element))
        .filter(Boolean);
}

async function contextTracks(menu) {
    if (menu?._selectedTracks?.length) return menu._selectedTracks;
    if (!menu?._contextTrack) return [];
    if (menu._contextType !== 'album') return [menu._contextTrack];
    const album = await activeUI.api.getAlbum(menu._contextTrack.id);
    return album.tracks || [];
}

async function handleAddToPlaylist(target, event) {
    const nowPlaying = target.closest('#now-playing-add-playlist-btn, #mobile-add-playlist-btn, #fs-add-playlist-btn');
    if (nowPlaying && activeUI.player.currentTrack) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await openPlaylistPicker([activeUI.player.currentTrack]);
        return true;
    }

    if (target.closest('[data-action="add-to-playlist-selected"]')) {
        const tracks = selectedPageTracks();
        if (!tracks.length) return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        await openPlaylistPicker(tracks);
        return true;
    }

    if (target.closest('#context-menu [data-action="add-to-playlist"]')) {
        const menu = document.getElementById('context-menu');
        const tracks = await contextTracks(menu);
        if (!tracks.length) return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        menu.style.display = 'none';
        await openPlaylistPicker(tracks);
        return true;
    }

    return false;
}

function addRemoveButtons(container, tracks, playlistId) {
    const indexes = new Map();
    tracks.forEach((track, index) => {
        const id = String(track.id);
        if (!indexes.has(id)) indexes.set(id, []);
        indexes.get(id).push(index);
    });

    container.querySelectorAll('.track-item').forEach((item) => {
        const track = trackDataStore.get(item);
        if (!track) return;
        const serverIndex = (indexes.get(String(track.id)) || []).shift();
        if (serverIndex === undefined) return;

        const actions = item.querySelector('.track-item-actions');
        if (!actions || actions.querySelector('.navidrome-remove-from-playlist-btn')) return;

        const button = document.createElement('button');
        button.className = 'track-action-btn navidrome-remove-from-playlist-btn';
        button.title = 'Remove from playlist';
        button.dataset.navidromePlaylistId = playlistId;
        button.dataset.navidromePlaylistIndex = String(serverIndex);
        button.innerHTML = SVG_BIN(20);
        actions.prepend(button);
    });

    container.classList.add('is-editable');
}

function enableReordering(container, playlistId) {
    const sortMode = localStorage.getItem(`playlist-sort-${playlistId}`);
    if (sortMode && sortMode !== 'custom') return;

    let dragging = null;
    let saving = false;
    container.querySelectorAll('.track-item').forEach((item) => {
        item.draggable = true;
    });

    container.addEventListener('dragstart', (event) => {
        const item = event.target.closest('.track-item');
        if (!item || event.target.closest('button, a, input')) return;
        dragging = item;
        item.classList.add('dragging');
    });

    container.addEventListener('dragover', (event) => {
        if (!dragging) return;
        event.preventDefault();
        const target = event.target.closest('.track-item');
        if (!target || target === dragging) return;
        const rect = target.getBoundingClientRect();
        const after = event.clientY > rect.top + rect.height / 2;
        target.parentNode.insertBefore(dragging, after ? target.nextSibling : target);
    });

    container.addEventListener('dragend', () => {
        dragging?.classList.remove('dragging');
    });

    container.addEventListener('drop', async (event) => {
        if (!dragging || saving) return;
        event.preventDefault();
        dragging.classList.remove('dragging');
        dragging = null;

        const orderedTracks = [...container.querySelectorAll('.track-item')]
            .map((item) => trackDataStore.get(item))
            .filter(Boolean);

        saving = true;
        try {
            await service.reorder(playlistId, orderedTracks);
            showNotification('Playlist order saved');
            rerenderRoute();
        } catch (error) {
            showNotification(`Could not save playlist order: ${error.message}`);
            rerenderRoute();
        } finally {
            saving = false;
        }
    });
}

export async function enhanceNavidromePlaylistPage(ui, playlistId) {
    if (!service) service = createNavidromePlaylistService(ui.api);
    const data = await service.get(playlistId).catch(() => null);
    if (!data || !service.canEdit(data.playlist)) return;

    const edit = document.getElementById('edit-playlist-btn');
    const remove = document.getElementById('delete-playlist-btn');
    if (edit) {
        edit.style.display = 'flex';
        edit.dataset.navidromePlaylistId = playlistId;
    }
    if (remove) {
        remove.style.display = 'flex';
        remove.dataset.navidromePlaylistId = playlistId;
    }

    const trackList = document.getElementById('playlist-detail-tracklist');
    if (!trackList) return;
    addRemoveButtons(trackList, data.tracks || [], playlistId);
    enableReordering(trackList, playlistId);
}

export function enhanceNavidromePlaylistsPage() {
    const container = document.getElementById('playlists-page-container');
    const section = container?.closest('.content-section');
    if (!section || section.querySelector('#navidrome-create-playlist-btn')) return;

    const createButton = document.createElement('button');
    createButton.id = 'navidrome-create-playlist-btn';
    createButton.className = 'btn-primary';
    createButton.type = 'button';
    createButton.textContent = 'Create Playlist';

    const title = section.querySelector('.section-title');
    if (title) title.insertAdjacentElement('afterend', createButton);
    else section.prepend(createButton);
}

function addSaveQueueButton() {
    const title = document.getElementById('side-panel-title');
    const controls = document.getElementById('side-panel-controls');
    if (!controls || !title || !/queue/i.test(title.textContent || '')) return;
    if (controls.querySelector('#save-queue-as-playlist-btn')) return;

    const button = document.createElement('button');
    button.id = 'save-queue-as-playlist-btn';
    button.type = 'button';
    button.textContent = 'Save as playlist';
    controls.appendChild(button);
}

async function handleDocumentClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (await handleAddToPlaylist(target, event)) return;

    if (target.closest('#navidrome-create-playlist-btn, #create-playlist-btn, #library-create-playlist-card')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openCreateNavidromePlaylist();
        return;
    }

    if (target.closest('#playlist-modal-save')) {
        await saveNativeModal(event);
        return;
    }

    if (target.closest('#playlist-modal-cancel') && nativeModal()?.dataset.navidromeMode) {
        window.setTimeout(clearNativeModal, 0);
        return;
    }

    const removeTrack = target.closest('.navidrome-remove-from-playlist-btn');
    if (removeTrack) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await service.removeIndexes(removeTrack.dataset.navidromePlaylistId, [
            Number(removeTrack.dataset.navidromePlaylistIndex),
        ]);
        showNotification('Removed track from playlist');
        rerenderRoute();
        return;
    }

    const edit = target.closest('#edit-playlist-btn[data-navidrome-playlist-id]');
    if (edit) {
        event.preventDefault();
        event.stopImmediatePropagation();
        await openEditNavidromePlaylist(edit.dataset.navidromePlaylistId);
        return;
    }

    const remove = target.closest('#delete-playlist-btn[data-navidrome-playlist-id]');
    if (remove) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const playlistId = remove.dataset.navidromePlaylistId;
        const data = await service.get(playlistId);
        const name = data.playlist?.name || data.playlist?.title || 'this playlist';
        if (!confirm(`Delete “${name}” from Navidrome?`)) return;
        await service.delete(playlistId);
        showNotification(`Deleted playlist “${name}”`);
        window.history.pushState({}, '', '/playlists');
        rerenderRoute();
        return;
    }

    if (target.closest('#save-queue-as-playlist-btn')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const tracks = activeUI.player.getCurrentQueue?.() || [];
        if (!tracks.length) {
            showNotification('The queue is empty.');
            return;
        }
        openCreateNavidromePlaylist(tracks);
        return;
    }

    if (target.closest('#queue-btn, #fs-queue-btn')) {
        window.setTimeout(addSaveQueueButton, 0);
        window.setTimeout(addSaveQueueButton, 100);
    }
}

export function installNavidromePlaylistUI(ui) {
    activeUI = ui;
    service = createNavidromePlaylistService(ui.api);
    if (installed) return;
    installed = true;

    const addToPlaylist = document.querySelector('#context-menu [data-action="add-to-playlist"]');
    if (addToPlaylist) addToPlaylist.dataset.typeFilter = 'track,video,album';
    document.addEventListener('click', handleDocumentClick, true);
}
