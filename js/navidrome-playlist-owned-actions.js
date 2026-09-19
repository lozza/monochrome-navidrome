import { SVG_BIN, SVG_SQUARE_PEN } from './icons.js';
import { createNavidromePlaylistService } from './navidrome-playlist-service.js';

function createActionButton(id, label, icon) {
    const button = document.createElement('button');
    button.id = id;
    button.className = 'btn-secondary';
    button.innerHTML = `${icon}<span>${label}</span>`;
    return button;
}

export async function ensureNavidromePlaylistOwnedActions(ui, playlistId) {
    const service = createNavidromePlaylistService(ui.api);
    const data = await service.get(playlistId).catch(() => null);
    if (!data || !service.canEdit(data.playlist)) return;

    const actions = document.querySelector('#page-playlist .detail-header-actions');
    if (!actions) return;

    let edit = document.getElementById('edit-playlist-btn');
    if (!edit) {
        edit = createActionButton('edit-playlist-btn', 'Edit', SVG_SQUARE_PEN(24));
        actions.appendChild(edit);
    }
    edit.dataset.navidromePlaylistId = playlistId;

    let remove = document.getElementById('delete-playlist-btn');
    if (!remove) {
        remove = createActionButton('delete-playlist-btn', 'Delete', SVG_BIN(24));
        remove.classList.add('danger');
        actions.appendChild(remove);
    }
    remove.dataset.navidromePlaylistId = playlistId;
}
