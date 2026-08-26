// Compatibility wrapper for the legacy profile module.
//
// The profile UI no longer contains #view-my-profile-btn, but the legacy
// profile module still attaches listeners to it during module evaluation.
// Importing that module from router.js therefore crashed the entire SPA before
// routing could start. Keep the legacy implementation intact, but only load it
// after providing a hidden compatibility element.

let profileModulePromise;

function ensureLegacyProfileButton() {
    if (document.getElementById('view-my-profile-btn')) return;

    const shim = document.createElement('button');
    shim.id = 'view-my-profile-btn';
    shim.type = 'button';
    shim.tabIndex = -1;
    shim.setAttribute('aria-hidden', 'true');
    shim.style.cssText =
        'position:absolute;width:0;height:0;padding:0;margin:0;border:0;overflow:hidden;opacity:0;pointer-events:none;';
    document.body.appendChild(shim);
}

async function getProfileModule() {
    ensureLegacyProfileButton();
    profileModulePromise ||= import('./profile-original.js');
    return profileModulePromise;
}

export async function loadProfile(username) {
    const profileModule = await getProfileModule();
    return profileModule.loadProfile(username);
}

export async function openEditProfile() {
    const profileModule = await getProfileModule();
    return profileModule.openEditProfile();
}
