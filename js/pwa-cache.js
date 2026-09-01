export async function removeStalePwaRuntimeCaches(cacheStorage, version, isDevelopment = false) {
    if (!cacheStorage) return [];

    const currentScriptsCache = isDevelopment ? 'scripts-dev' : `scripts-${version}`;
    const names = await cacheStorage.keys();
    const staleNames = names.filter(
        (name) =>
            (name === 'scripts' || name.startsWith('scripts-') || name === 'media') && name !== currentScriptsCache
    );

    await Promise.all(staleNames.map((name) => cacheStorage.delete(name)));
    return staleNames;
}
