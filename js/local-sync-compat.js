// Local library operations are committed to IndexedDB before these hooks run.
// Navichrome has no secondary account service, so cross-service sync hooks are
// intentionally inert while the inherited UI is incrementally simplified.
const noop = async () => null;

export const syncManager = {
    syncLibraryItem: noop,
    syncUserFolder: noop,
    syncUserPlaylist: noop,
    publishPlaylist: noop,
    unpublishPlaylist: noop,
    getPublicPlaylist: noop,
};
