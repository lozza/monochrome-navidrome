import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import blobAssetPlugin from './vite-plugin-blob.js';
import svgUse from './vite-plugin-svg-use.js';
import { playwright } from '@vitest/browser-playwright';
import { execSync } from 'child_process';
import packageJson from './package.json' with { type: 'json' };

function getGitCommitHash() {
    const injected = process.env.BUILD_COMMIT?.trim();
    if (injected) {
        if (!/^[0-9a-f]{7,40}$/i.test(injected)) {
            throw new Error('BUILD_COMMIT must be a 7-40 character hexadecimal Git SHA.');
        }
        return injected.slice(0, 12);
    }

    try {
        return execSync('git rev-parse --short=12 HEAD').toString().trim();
    } catch (error) {
        throw new Error('A real build commit is required. Set BUILD_COMMIT for source archives and Docker builds.', {
            cause: error,
        });
    }
}

export default defineConfig(({ mode }) => {
    const commitHash = getGitCommitHash();
    const isDev = mode === 'development';

    return {
        test: {
            // https://vitest.dev/guide/browser/
            browser: {
                enabled: true,
                provider: playwright(),
                headless: !!process.env.HEADLESS,
                instances: [{ browser: 'chromium' }],
            },
        },
        base: './',
        define: {
            __COMMIT_HASH__: JSON.stringify(commitHash),
            __APP_VERSION__: JSON.stringify(packageJson.version),
            __VITEST__: !!process.env.VITEST,
        },
        worker: {
            format: 'es',
        },
        resolve: {
            alias: {
                '!lucide': '/node_modules/lucide-static/icons',
                '!': '/node_modules',

                stream: path.resolve(__dirname, 'stream-stub.js'), // Stub for stream module
            },
        },
        optimizeDeps: {
            exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
        },
        server: {
            fs: {
                allow: ['.', 'node_modules'],
                // host: true,
                // allowedHosts: ['<your_tailscale_hostname>'], // e.g. pi5.tailf5f622.ts.net
            },
        },
        // preview: {
        //     host: true,
        //     allowedHosts: ['<your_tailscale_hostname>'], // e.g. pi5.tailf5f622.ts.net
        // },
        build: {
            outDir: 'dist',
            emptyOutDir: true,
            sourcemap: false,
            minify: 'esbuild',
            reportCompressedSize: false,
            rollupOptions: {
                treeshake: true,
            },
        },
        plugins: [
            blobAssetPlugin(),
            svgUse(),
            VitePWA({
                registerType: 'autoUpdate',
                devOptions: {
                    enabled: isDev,
                    type: 'classic',
                    disableRuntimeConfig: true,
                    suppressWarnings: true,
                },
                workbox: {
                    skipWaiting: true,
                    clientsClaim: true,
                    // Do not precache index.html. A cached document can bypass the
                    // network request that Cloudflare Access needs to authenticate.
                    globPatterns: ['manifest.json'],
                    navigateFallback: null,
                    cleanupOutdatedCaches: true,
                    maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB limit
                    runtimeCaching: [
                        // Every top-level app launch must reach the network first so
                        // Cloudflare Access can redirect to its login flow when needed.
                        {
                            urlPattern: ({ request }) => request.mode === 'navigate',
                            handler: 'NetworkOnly',
                        },
                        {
                            urlPattern: ({ request }) =>
                                request.destination === 'script' || request.destination === 'worker',
                            handler: 'NetworkFirst',
                            options: {
                                cacheName: isDev ? 'scripts-dev' : `scripts-${packageJson.version}`,
                                networkTimeoutSeconds: 4,
                                expiration: {
                                    maxEntries: 200,
                                    maxAgeSeconds: 7 * 24 * 60 * 60,
                                },
                            },
                        },
                        {
                            urlPattern: ({ request }) =>
                                request.destination === 'style' || request.destination === 'font',
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'static-resources',
                                expiration: {
                                    maxEntries: 60,
                                    maxAgeSeconds: 60 * 24 * 60 * 60,
                                },
                            },
                        },
                        {
                            urlPattern: ({ request }) => request.destination === 'image',
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'images',
                                expiration: {
                                    maxEntries: 100,
                                    maxAgeSeconds: 60 * 24 * 60 * 60, // 60 Days
                                },
                            },
                        },
                        {
                            urlPattern: ({ request }) =>
                                request.destination === 'audio' || request.destination === 'video',
                            handler: 'NetworkOnly',
                        },
                    ],
                },
                manifest: false, // Use existing public/manifest.json
            }),
        ],
    };
});
