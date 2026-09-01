import { startPlaywrightServer } from '../../scripts/playwright-server.mjs';

export default async function globalSetup() {
    const server = await startPlaywrightServer();

    return async () => {
        server.closeAllConnections?.();
        await new Promise((resolveClose) => server.close(resolveClose));
    };
}
