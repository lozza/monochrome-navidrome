import { db } from './db.js';
import { showNotification } from './downloads.js';
import { openCreateNavidromePlaylist } from './navidrome-playlist-controller.js';
import { createNavidromePlaylistService } from './navidrome-playlist-service.js';
import { sidePanelManager } from './side-panel.js';
import { escapeHtml, positionMenu } from './utils.js';

import { PLAYABLE_CONTEXT_TYPES, shouldConfirmQueueClear, contextActionSupportsType } from './queue-rules.js';

let installed = false;
let activeUI = null;
let playlistService = null;

function normalizeContextMenu() {
    const menu = document.getElementById('context-menu');
    const list = menu?.querySelector('ul');
    if (!menu || !list) return;

    let play = list.querySelector('[data-action="play-card"]');
    if (!play) {
        play = document.createElement('li');
        play.dataset.action = 'play-card';
        play.textContent = 'Play';
        list.prepend(play);
    }
    play.dataset.typeFilter = [...PLAYABLE_CONTEXT_TYPES].join(',');

    const playNext = list.querySelector('[data-action="play-next"]');
    if (playNext) playNext.dataset.typeFilter = [...PLAYABLE_CONTEXT_TYPES].join(',');

    const addToQueue = list.querySelector('[data-action="add-to-queue"]');
    if (addToQueue) {
        addToQueue.dataset.typeFilter = [...PLAYABLE_CONTEXT_TYPES].join(',');
        addToQueue.textContent = 'Add to end of queue';
    }

    const star = list.querySelector('[data-action="toggle-like"]');
    if (star) {
        star.dataset.typeFilter = 'track,album,artist,playlist,user-playlist';
        star.dataset.labelTrack = 'Star track';
        star.dataset.labelUnlikeTrack = 'Unstar track';
        star.dataset.labelArtist = 'Star artist';
        star.dataset.labelUnlikeArtist = 'Unstar artist';
    }
}

function filterContextMenuForType(menu, type, isStarred = false) {
    menu.querySelectorAll('li[data-action]').forEach((item) => {
        const filter = item.dataset.typeFilter;
        if (filter) {
            item.style.display = filter.split(',').includes(type) ? 'block' : 'none';
        } else if (!contextActionSupportsType(item.dataset.action, type)) {
            item.style.display = 'none';
        } else {
            item.style.display = 'block';
        }

        if (item.dataset.action === 'toggle-like') {
            const prefix = isStarred ? 'labelUnlike' : 'label';
            const normalizedType = type === 'user-playlist' ? 'Playlist' : type.charAt(0).toUpperCase() + type.slice(1);
            const label = item.dataset[`${prefix}${normalizedType}`] || (isStarred ? 'Unstar' : 'Star');
            item.textContent = label;
        }
    });
}

async function showQueueTrackContextMenu(event) {
    const item = event.target.closest('.queue-track-item');
    if (!item) return false;

    const index = Number(item.dataset.queueIndex);
    const track = activeUI.player.getCurrentQueue()[index];
    const menu = document.getElementById('context-menu');
    if (!track || !menu) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const type = track.type || 'track';
    const favoriteType = type === 'video' ? 'track' : type;
    const isStarred = await db.isFavorite(favoriteType, track.id).catch(() => false);

    menu._contextTrack = track;
    menu._contextType = type;
    menu._selectedTracks = [];
    filterContextMenuForType(menu, type, isStarred);
    positionMenu(menu, event.clientX, event.clientY);
    return true;
}

async function showNativeQueuePlaylistPicker(tracks) {
    const selectedTracks = (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean);
    if (!selectedTracks.length) return;

    const modal = document.getElementById('playlist-select-modal');
    const list = document.getElementById('playlist-select-list');
    const cancel = document.getElementById('playlist-select-cancel');
    const overlay = modal?.querySelector('.modal-overlay');
    if (!modal || !list || !cancel || !overlay) return;

    let playlists;
    try {
        playlists = await playlistService.list();
    } catch (error) {
        showNotification(`Could not load playlists: ${error.message}`);
        return;
    }

    const heading = modal.querySelector('h3');
    if (heading) heading.textContent = 'Add Queue to Playlist';

    const options = playlists
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
        ${options}
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
            const result = await playlistService.addTracks(playlistId, selectedTracks);
            const name = result.playlist?.name || option.querySelector('span')?.textContent || 'playlist';
            showNotification(`Added ${selectedTracks.length} tracks to ${name}`);
            close();
        } catch (error) {
            option.removeAttribute('aria-busy');
            showNotification(`Could not add queue to playlist: ${error.message}`);
        }
    };

    cancel.addEventListener('click', close);
    overlay.addEventListener('click', close);
    list.addEventListener('click', choose);
    modal.classList.add('active');
}

function scrollToPlayingQueueItem() {
    const container = document.getElementById('side-panel-content');
    const playing = container?.querySelector('.queue-track-item.playing');
    if (playing) {
        playing.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
    }

    if (!sidePanelManager.isActive('queue')) return;

    // Very large queues virtualize their DOM. Reopening the queue asks the
    // existing renderer to rebuild its window around currentQueueIndex.
    sidePanelManager.close();
    document.getElementById('queue-btn')?.click();
    window.setTimeout(() => {
        document
            .querySelector('#side-panel-content .queue-track-item.playing')
            ?.scrollIntoView({ block: 'center', behavior: 'auto' });
    }, 100);
}

function enhanceQueueControls() {
    if (!sidePanelManager.isActive('queue')) return;
    const controls = document.getElementById('side-panel-controls');
    if (!controls) return;

    const addToPlaylist = controls.querySelector('#add-queue-to-playlist-btn');
    if (addToPlaylist) addToPlaylist.title = 'Add queue to Navidrome playlist';

    if (!controls.querySelector('#save-queue-as-playlist-btn')) {
        const save = document.createElement('button');
        save.id = 'save-queue-as-playlist-btn';
        save.className = 'btn-icon';
        save.type = 'button';
        save.title = 'Save queue as a new playlist';
        save.textContent = 'Save';
        controls.insertBefore(save, controls.querySelector('#clear-queue-btn'));
    }

    if (!controls.querySelector('#jump-to-playing-queue-btn')) {
        const jump = document.createElement('button');
        jump.id = 'jump-to-playing-queue-btn';
        jump.className = 'btn-icon';
        jump.type = 'button';
        jump.title = 'Jump to currently playing track';
        jump.textContent = 'Current';
        controls.insertBefore(jump, controls.querySelector('#clear-queue-btn'));
    }
}

async function handleQueueClick(event) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('#add-queue-to-playlist-btn')) {
        const queue = activeUI.player.getCurrentQueue();
        if (!queue.length) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        await showNativeQueuePlaylistPicker(queue);
        return;
    }

    if (target.closest('#clear-queue-btn')) {
        const queue = activeUI.player.getCurrentQueue();
        if (!shouldConfirmQueueClear(queue)) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (!confirm('Clear the queue? The currently playing track will keep playing.')) return;
        await activeUI.player.clearQueue();
        await window.renderQueueFunction?.();
        showNotification('Queue cleared');
        return;
    }

    if (target.closest('#jump-to-playing-queue-btn')) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        scrollToPlayingQueueItem();
    }
}

export function installQueueEnhancements(ui) {
    activeUI = ui;
    playlistService = createNavidromePlaylistService(ui.api);
    normalizeContextMenu();
    if (installed) return;
    installed = true;

    document.addEventListener('click', handleQueueClick, true);
    document.addEventListener('contextmenu', showQueueTrackContextMenu, true);
    window.addEventListener('side-panel-changed', (event) => {
        if (event.detail?.view === 'queue' && event.detail?.active) {
            window.setTimeout(enhanceQueueControls, 0);
        }
    });
}
