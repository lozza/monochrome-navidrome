import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import packageJson from '../package.json' with { type: 'json' };

const DIST_DIR = path.resolve('dist');
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.map', '.svg', '.webmanifest']);

async function listTextFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...(await listTextFiles(absolute)));
        else if (TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
    }
    return files;
}

const expectedCommit = (
    process.env.BUILD_COMMIT || execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' })
)
    .trim()
    .slice(0, 12);

if (!/^[0-9a-f]{7,12}$/i.test(expectedCommit)) {
    throw new Error('Bundle audit requires a real hexadecimal build commit.');
}

const files = await listTextFiles(DIST_DIR);
const contents = await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')]));
const bundle = contents.map(([, content]) => content).join('\n');

const requiredIdentity = [
    ['application version', packageJson.version],
    ['build commit', expectedCommit],
];

const forbiddenMarkers = [
    ['Appwrite', /appwrite(?:\.io)?/i],
    ['PocketBase', /pocketbase/i],
    ['Samidy service', /samidy/i],
    ['TIDAL service', /(?:api|listen)\.tidal\.com/i],
    ['inherited provider decrypter', /(?:\/api\/decrypt-stream|amazonMusicQuality|deezerHiRes)/i],
    ['Sentry telemetry', /(?:sentry\.io|sentry_dsn)/i],
    ['ListenBrainz', /listenbrainz\.org/i],
    ['PodcastIndex', /podcastindex\.org/i],
    ['Discord integration', /discord(?:app)?\.com\/api/i],
    ['old account UI', /monochrome (?:account|profile)/i],
    ['obsolete promotional UI', /(?:theme store|editor['’]s picks|unreleased|donate now)/i],
    ['unknown build identity', /(?:commit|build)(?:\s|&nbsp;|<[^>]+>){0,3}unknown/i],
];

const credentialShapes = [
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
    ['AWS access key', /AKIA[0-9A-Z]{16}/],
    ['Slack token', /xox[baprs]-[A-Za-z0-9-]{20,}/],
];

const failures = [];
for (const [label, value] of requiredIdentity) {
    if (!bundle.includes(value)) failures.push(`Missing ${label} in production output.`);
}

for (const [label, pattern] of [...forbiddenMarkers, ...credentialShapes]) {
    const matchingFiles = contents
        .filter(([, content]) => pattern.test(content))
        .map(([file]) => path.relative('.', file));
    if (matchingFiles.length) failures.push(`${label} marker found in: ${matchingFiles.join(', ')}`);
}

if (failures.length) {
    console.error('Production bundle audit failed:');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
} else {
    console.log(
        `Production bundle audit passed for Navichrome ${packageJson.version} at ${expectedCommit} (${files.length} text assets checked).`
    );
}
