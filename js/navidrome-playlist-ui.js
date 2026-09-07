import { showNotification } from './downloads.js';
import { SVG_BIN } from './icons.js';
import { parseDynamicCSV, parseJSPF, parseM3U, parseXML, parseXSPF } from './playlist-importer.js';
import { createNavidromePlaylistService } from './navidrome-playlist-service.js';
import { escapeHtml, trackDataStore } from './utils.js';

let installed = false;
let activeUI = null;
let playlistService = null;

function refreshCurrentRoute() {
    window.dispatchEvent(new Event('popstate'));
}

function getPlaylistModal() {
    return document.getElementById('playlist-modal');
}

function setCoverControlsVisible(visible) {
    const wrapper = document.getElementById('playlist-cover-wrapper');
    if (wrapper) wrapper.style.display = visible ? '' : 'none';

    const fileInput = document.getElementById('playlist-cover-file-input');
    const fileWrapper = fileInput?.closest('.playlist-cover-upload, .form-group, div');
    if (fileWrapper && fileWrapper !== wrapper) fileWrapper.style.display = visible ? '' : 'none';
}

function resetPlaylistModalMode() {
    const modal = getPlaylistModal();
    if (!modal) return;
    delete modal.dataset.navidromeMode;
    delete modal.dataset.navidromePlaylistId;
    delete modal._pendingTracks;
    setCoverControlsVisible(true);
}

function preparePlaylistModal({ mode, playlistId = '', name = '', description = '', isPublic = false, tracks = [] }) {
    const modal = getPlaylistModal();
    if (!modal) return false;

    modal.dataset.navidromeMode = mode;
    modal.dataset.navidromePlaylistId = playlistId;
    modal.dataset.editingId = playlistId;
    modal._pendingTracks = Array.isArray(tracks) ? tracks : [];

    const title = document.getElementById('playlist-modal-title');
    const nameInput = document.getElementById('playlist-name-input');
    const descriptionInput = document.getElementById('playlist-description-input');
    const publicToggle = document.getElementById('playlist-public-toggle');
    const importSection = document.getElementById('import-section');
    const shareButton = document.getElementById('playlist-share-btn');

    if (title) title.textContent = mode === 'edit' ? 'Edit Playlist' : 'Create Playlist';
    if (nameInput) nameInput.value = name;
    if (descriptionInput) descriptionInput.value = description;
    if (publicToggle) publicToggle.checked = Boolean(isPublic);
    if (shareButton) shareButton.style.display = 'none';
    if (importSection) importSection.style.display = mode === 'create' && !tracks.length ? 'block' : 'none';

    // OpenSubsonic playlist metadata has no custom cover URL field. Hiding the
    // old local-only cover controls avoids pretending a value will sync.
    setCoverControlsVisible(false);

    modal.classList.add('active');
    nameInput?.focus();
    return true;
}

export function openCreateNavidromePlaylist(tracks = []) {
    preparePlaylistModal({ mode: 'create', tracks });
}

async function openEditNavidromePlaylist(playlistId) {
    const data = await playlistService.get(playlistId);
    if (!playlistService.canEdit(data.playlist)) {
        showNotification('This playlist is read-only for the current Navidrome user.');
        return;
    }

    preparePlaylistModal({
        mode: 'edit',
        playlistId,
        name: data.playlist.name || data.playlist.title || '',
        description: data.playlist.comment || data.playlist.description || '',
        isPublic: data.playlist.public === true,
    });
}

async function parseSelectedImport() {
    const api = activeUI.api;
    const strictAlbumMatch = document.getElementById('strict-album-match-toggle')?.checked;
    const options = { strictArtistMatch: true, strictAlbumMatch };

    const inputs = [
        ['jspf-file-input', async (file) => parseJSPF(await file.text(), api)],
        ['csv-file-input', async (file) => parseDynamicCSV(await file.text(), api, undefined, options)],
        ['xspf-file-input', async (file) => parseXSPF(await file.text(), api)],
        ['xml-file-input', async (file) => parseXML(await file.text(), api)],
        ['m3u-file-input', async (file) => parseM3U(await file.text(), api)],
    ];

    for (const [id, parser] of inputs) {
        const file = document.getElementById(id)?.files?.[0];
        if (!file) continue;
        const result = await parser(file);
        const tracks = result?.tracks || [];
        if (!tracks.length) throw new Error(`No matching Navidrome tracks were found in ${file.name}.`);
        return tracks;
    }

    return [];
}

async function savePlaylistModal(event) {
    const modal = getPlaylistModal();
    if (!modal?.dataset.navidromeMode) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const saveButton = document.getElementById('playlist-modal-save');
    const name = document.getElementById('playlist-name-input')?.value.trim() || '';
    const description = document.getElementById('playlist-description-input')?.value.trim() || '';
    const isPublic = document.getElementById('playlist-public-toggle')?.checked === true;

    if (!name) {
        showNotification('Please enter a playlist name.');
        return true;
    }

    const originalText = saveButton?.textContent || 'Save';
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Saving…';
    }

    try {
        if (modal.dataset.navidromeMode === 'edit') {
            await playlistService.updateMetadata(modal.dataset.navidromePlaylistId, {
                name,
                comment: description,
                public: isPublic,
            });
            showNotification(`Updated playlist “${name}”`);
        } else {
            const importedTracks = await parseSelectedImport();
            const pendingTracks = Array.isArray(modal._pendingTracks) ? modal._pendingTracks : [];
            const tracks = [...pendingTracks, ...importedTracks];
            await playlistService.create(name, tracks, { comment: description, public: isPublic });
            showNotification(`Created playlist “${name}”${tracks.length ? ` with ${tracks.length} tracks` : ''}`);
        }

        modal.classList.remove('active');
        resetPlaylistModalMode();
        refreshCurrentRoute();
    } catch (error) {
        console.error('Navidrome playlist save failed:', error);
        showNotification(`Could not save playlist: ${error.message}`);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = originalText;
        }
    }

    return true;
}

async function showPlaylistPicker(tracks, title = 'Add to Playlist') {
    const cleanTracks = (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean);
    if (!cleanTracks.length) return;

    const modal = document.getElementById('playlist-select-modal');
    const list = document.getElementById('playlist-select-list');
    const cancelButton = document.getElementById('playlist-select-cancel');
    const overlay = modal?.querySelector('.modal-overlay');
    if (!modal || !list || !cancelButton || !overlay) return;

    let playlists;
    try {
        playlists = await playlistService.list();
    } catch (error) {
        showNotification(`Could not load playlists: ${error.message}`);
        return;
    }

    const heading = modal.querySelector('h3');
    if (heading) heading.textContent = title;

    list.innerHTML = `
        <div class="modal-option create-new-option" data-navidrome-create="true" style="border-bottom: 1px solid var(--border); margin-bottom: 0.5rem;">
            <span style="font-weight: 600; color: var(--primary);">+ Create New Playlist</span>
        </div>
        ${playlists
            .map(
                (playlist) => `
                    <div class="modal-option" data-navidrome-playlist-id="${escapeHtml(String(playlist.id || playlist.uuid))}">
                        <span>${escapeHtml(playlist.name || playlist.title || 'Untitled Playlist')}</span>
                        <span style="color: var(--muted-foreground); font-size: 0.85rem;">${Number(playlist.numberOfTracks || playlist.songCount || 0)} tracks</span>
                    </div>
                `
            )
            .join('')}
    `;

    const close = () => {
        modal.classList.remove('active');
        cancelButton.removeEventListener('click', close);
        overlay.removeEventListener('click', close);
        list.removeEventListener('click', choose);
    };

    const choose = async (event) => {
        const option = event.target.closest('.modal-option');
        if (!option) return;

        if (option.dataset.navidromeCreate === 'true') {
            close();
            openCreateNavidromePlaylist(cleanTracks);
            return;
        }

        const playlistId = option.dataset.navidromePlaylistId;
        if (!playlistId) return;
        option.setAttribute('aria-busy', 'true');

        try {
            const result = await playlistService.addTracks(playlistId, cleanTracks);
            const name = result.playlist?.name || option.querySelector('span')?.textContent || 'playlist';
            showNotification(`Added ${cleanTracks.length} ${cleanTracks.length === 1 ? 'track' : 'tracks'} to ${name}`);
            close();
        } catch (error) {
            console.error('Could not add tracks to Navidrome playlist:', error);
            showNotification(`Could not add to playlist: ${error.message}`);
            option.removeAttribute('aria-busy');
        }
    };

    cancelButton.addEventListener('click', close);
    overlay.addEventListener('click', close);
    list.addEventListener('click', choose);
    modal.classList.add('active');
}

function selectedTracksFromPage() {
    return [...document.querySelectorAll('.track-item.selected')]
        .map((element) => trackDataStore.get(element))
        .filter(Boolean);
}

async function handleAddToPlaylistTarget(target, event) {
    if (target.closest('#add-album-to-playlist-btn')) {
        const albumId = window.location.pathname.match(/^\/album\/([^/]+)/)?.[1];
        if (!albumId) return false;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const { album, tracks } = await activeUI.api.getAlbum(albumId);
        await showPlaylistPicker(tracks, `Add ${album.title || 'album'} to Playlist`);
        return true;
    }

    if (target.closest('#now-playing-add-playlist-btn, #mobile-add-playlist-btn, #fs-add-playlist-btn')) {
        const track = activeUI.player.currentTrack;
        if (!track) return false;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        await showPlaylistPicker([track]);
        return true;
    }

    const selectionButton = target.closest('[data-action="add-to-playlist-selected"]');
    if (selectionButton) {
        const tracks = selectedTracksFromPage();
        if (!tracks.length) return false;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        await showPlaylistPicker(tracks);
        return true;
    }

    const contextAction = target.closest('#context-menu [data-action="add-to-playlist"]');
    if (contextAction) {
        const menu = document.getElementById('context-menu');
        const tracks = menu?._selectedTracks?.length ? menu._selectedTracks : [menu?._contextTrack].filter(Boolean);
        if (!tracks.length) return false;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        menu.style.display = 'none';
        await showPlaylistPicker(tracks);
        return true;
    }

    return false;
}

function enableNativePlaylistReordering(container, playlistId) {
    if (!container || localStorage.getItem(`playlist-sort-${playlistId}`) && localStorage.getItem(`playlist-sort-${playlistId}`) !== 'custom') {
        return;
    }

    let dragging = null;
    let saving = false;
    const items = [...container.querySelectorAll('.track-item')];
    items.forEach((item) => {
        item.draggable = true;
        item.classList.add('navidrome-playlist-reorderable');
    });

    container.addEventListener('dragstart', (event) => {
        const item = event.target.closest('.track-item');
        if (!item || event.target.closest('button, a, input')) return;
        dragging = item;
        item.classList.add('dragging');
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
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

    container.addEventListener('dragend', () => dragging?.classList.remove('dragging'));

    container.addEventListener('drop', async (event) => {
        if (!dragging || saving) return;
        event.preventDefault();
        dragging.classList.remove('dragging');
        dragging = null;
        const orderedTracks = [...container.querySelectorAll('.track-item')].map((item) => trackDataStore.get(item)).filter(Boolean);
        if (!orderedTracks.length) return;

        saving = true;
        try {
            await playlistService.reorder(playlistId, orderedTracks);
            showNotification('Playlist order saved');
            refreshCurrentRoute();
        } catch (error) {
            console.error('Could not reorder Navidrome playlist:', error);
            showNotification(`Could not save playlist order: ${error.message}`);
            refreshCurrentRoute();
        } finally {
            saving = false;
        }
    });
}

function addNativeRemoveButtons(container, tracks, playlistId) {
    const serverIndexes = new Map();
    tracks.forEach((track, index) => {
        const key = String(track.id);
        if (!serverIndexes.has(key)) serverIndexes.set(key, []);
        serverIndexes.get(key).push(index);
    });

    container.querySelectorAll('.track-item').forEach((item) => {
        const track = trackDataStore.get(item);
        if (!track) return;
        const indexes = serverIndexes.get(String(track.id)) || [];
        const serverIndex = indexes.shift();
        if (serverIndex === undefined) return;

        item.dataset.navidromePlaylistIndex = String(serverIndex);
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

export async function enhanceNavidromePlaylistPage(ui, playlistId) {
    if (!playlistService) playlistService = createNavidromePlaylistService(ui.api);

    let data;
    try {
        data = await playlistService.get(playlistId);
    } catch (error) {
        console.warn('Could not inspect Navidrome playlist ownership:', error);
        return;
    }

    if (!playlistService.canEdit(data.playlist)) return;

    const editButton = document.getElementById('edit-playlist-btn');
    const deleteButton = document.getElementById('delete-playlist-btn');
    if (editButton) {
        editButton.style.display = 'flex';
        editButton.dataset.navidromePlaylistId = playlistId;
    }
    if (deleteButton) {
        deleteButton.style.display = 'flex';
        deleteButton.dataset.navidromePlaylistId = playlistId;
    }

    const container = document.getElementById('playlist-detail-tracklist');
    if (!container) return;
    addNativeRemoveButtons(container, data.tracks || [], playlistId);
    enableNativePlaylistReordering(container, playlistId);
}

export function enhanceNavidromePlaylistsPage() {
    const container = document.getElementById('playlists-page-container');
    const section = container?.closest('.content-section');
    if (!section || section.querySelector('#navidrome-create-playlist-btn')) return;

    const title = section.querySelector('.section-title');
    const header = document.createElement('div');
    header.className = 'section-header navidrome-playlists-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.gap = '1rem';
    header.style.marginBottom = '1rem';

    if (title) {
        title.style.marginBottom = '0';
        title.replaceWith(header);
        header.appendChild(title);
    } else {
        section.prepend(header);
    }

    const createButton = document.createElement('button');
    createButton.id = 'navidrome-create-playlist-btn';
    createButton.className = 'btn-primary';
    createButton.type = 'button';
    createButton.textContent = 'Create Playlist';
    header.appendChild(createButton);
}

function ensureQueueSaveButton() {
    const title = document.getElementById('side-panel-title');
    const controls = document.getElementById('side-panel-controls');
    if (!controls || !title || !/queue/i.test(title.textContent || '')) return;
    if (controls.querySelector('#save-queue-as-playlist-btn')) return;

    const button = document.createElement('button');
    button.id = 'save-queue-as-playlist-btn';
    button.className = 'btn-icon';
    button.type = 'button';
    button.title = 'Save queue as playlist';
    button.textContent = 'Save as playlist';
    controls.appendChild(button);
}

async function handleDocumentClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (await handleAddToPlaylistTarget(target, event)) return;

    if (target.closest('#navidrome-create-playlist-btn, #create-playlist-btn, #library-create-playlist-card')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        openCreateNavidromePlaylist();
        return;
    }

    if (target.closest('#playlist-modal-save')) {
        await savePlaylistModal(event);
        return;
    }

    if (target.closest('#playlist-modal-cancel') && getPlaylistModal()?.dataset.navidromeMode) {
        window.setTimeout(resetPlaylistModalMode, 0);
        return;
    }

    const removeButton = target.closest('.navidrome-remove-from-playlist-btn');
    if (removeButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        removeButton.disabled = true;
        try {
            await playlistService.removeIndexes(removeButton.dataset.navidromePlaylistId, [
                Number(removeButton.dataset.navidromePlaylistIndex),
            ]);
            showNotification('Removed track from playlist');
            refreshCurrentRoute();
        } catch (error) {
            removeButton.disabled = false;
            showNotification(`Could not remove track: ${error.message}`);
        }
        return;
    }

    const editButton = target.closest('#edit-playlist-btn[data-navidrome-playlist-id]');
    if (editButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        await openEditNavidromePlaylist(editButton.dataset.navidromePlaylistId);
        return;
    }

    const deleteButton = target.closest('#delete-playlist-btn[data-navidrome-playlist-id]');
    if (deleteButton) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const playlistId = deleteButton.dataset.navidromePlaylistId;
        const data = await playlistService.get(playlistId);
        const name = data.playlist?.name || data.playlist?.title || 'this playlist';
        if (!confirm(`Delete “${name}” from Navidrome?`)) return;
        try {
            await playlistService.delete(playlistId);
            showNotification(`Deleted playlist “${name}”`);
            window.history.pushState({}, '', '/playlists');
            refreshCurrentRoute();
        } catch (error) {
            showNotification(`Could not delete playlist: ${error.message}`);
        }
        return;
    }

    if (target.closest('#save-queue-as-playlist-btn')) {
        event.preventDefault();
        event.stopPropagation();
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
        window.setTimeout(ensureQueueSaveButton, 0);
        window.setTimeout(ensureQueueSaveButton, 100);
    }
}

export function installNavidromePlaylistUI(ui) {
    activeUI = ui;
    playlistService = createNavidromePlaylistService(ui.api);
    if (installed) return;
    installed = true;
    document.addEventListener('click', handleDocumentClick, true);
}
