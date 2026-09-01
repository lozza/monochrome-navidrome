/**
 * Keep media URLs unchanged. Navichrome uses its same-origin /navidrome proxy
 * rather than forwarding requests through an external service.
 *
 * @param {string} url
 * @returns {string}
 */
export const getProxyUrl = (url) => {
    if (!url) return url;
    return url;
};
