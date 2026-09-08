export function normalizeRadioSeeds(seeds) {
    const requestedSeeds = Array.isArray(seeds) ? seeds.filter(Boolean) : seeds ? [seeds] : [];
    const uniqueSeeds = new Map();
    requestedSeeds
        .filter((track) => track?.id != null)
        .forEach((track) => {
            const id = String(track.id);
            if (!uniqueSeeds.has(id)) uniqueSeeds.set(id, track);
        });
    return [...uniqueSeeds.values()];
}
