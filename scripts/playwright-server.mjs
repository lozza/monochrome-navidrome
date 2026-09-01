import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist');
const types = new Map([
    ['.css', 'text/css; charset=utf-8'],
    ['.html', 'text/html; charset=utf-8'],
    ['.ico', 'image/x-icon'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.json', 'application/json; charset=utf-8'],
    ['.png', 'image/png'],
    ['.svg', 'image/svg+xml'],
    ['.wasm', 'application/wasm'],
    ['.webmanifest', 'application/manifest+json'],
    ['.woff2', 'font/woff2'],
]);

async function existingFile(pathname) {
    const candidate = resolve(root, `.${pathname}`);
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
    try {
        return (await stat(candidate)).isFile() ? candidate : null;
    } catch {
        return null;
    }
}

export async function startPlaywrightServer() {
    const server = createServer(async (request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
            const file = (await existingFile(pathname)) || resolve(root, 'index.html');
            const body = await readFile(file);
            response.writeHead(200, {
                'Cache-Control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=60',
                'Content-Type': types.get(extname(file)) || 'application/octet-stream',
            });
            response.end(body);
        } catch (error) {
            response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            const message = error instanceof Error ? error.message : String(error);
            response.end(`Test server error: ${message}`);
        }
    });

    await new Promise((resolveListen, rejectListen) => {
        server.once('error', rejectListen);
        server.listen(4174, '127.0.0.1', resolveListen);
    });
    return server;
}
