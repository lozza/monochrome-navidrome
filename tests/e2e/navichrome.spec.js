import { expect, test } from 'playwright/test';
import { installNavidromeMock } from './navidrome-mock.js';

async function waitForReady(page) {
    await expect(page.locator('html')).toHaveAttribute('data-navichrome-ready', 'true', { timeout: 30_000 });
}

test('login succeeds, bad credentials fail, and sign-out removes stored credentials', async ({ page }) => {
    const state = await installNavidromeMock(page);
    await page.goto('/account');
    await waitForReady(page);

    state.rejectLogin = true;
    await page.locator('#account-navidrome-username').fill('bad-user');
    await page.locator('#account-navidrome-password').fill('wrong');
    await page.locator('#account-navidrome-login').click();
    await expect(page.locator('#account-navidrome-status')).toContainText('Sign in failed');

    state.rejectLogin = false;
    await page.locator('#account-navidrome-username').fill('beta-listener');
    await page.locator('#account-navidrome-password').fill('x');
    await page.locator('#account-navidrome-login').click();
    await expect(page.locator('#account-navidrome-status')).toContainText('Signed in');
    await page.waitForURL('/');
    await waitForReady(page);

    await page.locator('#header-account-btn').click();
    await Promise.all([page.waitForNavigation(), page.locator('#header-navidrome-sign-out').click()]);
    await waitForReady(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('navidrome-password'))).toBeNull();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('navidrome-username'))).toBeNull();
});

test('home, library, albums, artists, starred tracks, playlists and search render server data', async ({ page }) => {
    await installNavidromeMock(page);
    await page.goto('/');
    await waitForReady(page);

    await expect(page.locator('#page-home')).toHaveClass(/active/);
    await expect(page.locator('#page-home [data-album-id="album-1"]')).toBeVisible();

    await page.goto('/library');
    await waitForReady(page);

    await expect(page.getByRole('heading', { name: 'My Playlists' })).toBeVisible();
    await expect(page.locator('#library-tracks-container [data-track-id="track-1"]')).toBeVisible();
    await expect(page.locator('#my-playlists-container [data-playlist-id="playlist-1"]')).toBeVisible();

    await page.locator('#page-library .search-tab[data-tab="albums"]').click();
    const firstAlbum = page.locator('#library-albums-container [data-album-id="album-1"]');
    await expect(firstAlbum).toBeVisible();
    await firstAlbum.click();
    await expect(page).toHaveURL(/\/album\/album-1/);
    await expect(page.locator('#album-detail-title')).toContainText('First Album');
    await expect(page.locator('#album-detail-tracklist [data-track-id="track-1"]')).toBeVisible();

    await page.goto('/library');
    await waitForReady(page);
    await page.locator('#page-library .search-tab[data-tab="artists"]').click();
    const firstArtist = page.locator('#library-artists-container [data-artist-id="artist-1"]');
    await expect(firstArtist).toBeVisible();
    await firstArtist.click();
    await expect(page).toHaveURL(/\/artist\/artist-1/);
    await expect(page.locator('#artist-detail-name')).toContainText('Alice');

    await page.goto('/library');
    await waitForReady(page);
    await page.locator('#search-input').fill('song');
    await page.locator('#search-form').press('Enter');
    await expect(page).toHaveURL(/\/search\/song/);
    await expect(page.locator('#search-tracks-container [data-track-id="track-1"]')).toBeVisible();
});

test('playback starts and next/previous move through the server-backed queue', async ({ page }) => {
    await installNavidromeMock(page);
    await page.goto('/playlist/playlist-1');
    await waitForReady(page);
    const firstTrack = page.locator('#playlist-detail-tracklist [data-track-id="track-1"]');
    await expect(firstTrack).toBeVisible();
    await firstTrack.locator('.track-item-details .title').click();
    await expect(page.locator('.now-playing-bar .track-info .title')).toContainText('Alpha Song');

    await page.locator('#next-btn').click();
    await expect(page.locator('.now-playing-bar .track-info .title')).toContainText('Beta Song');
    await page.locator('#prev-btn').click();
    await expect(page.locator('.now-playing-bar .track-info .title')).toContainText('Alpha Song');
});

test('missing artwork falls back safely and a failed optional service cannot break navigation', async ({ page }) => {
    const state = await installNavidromeMock(page, { missingArtwork: true });
    await page.goto('/library');
    await waitForReady(page);

    await page.locator('#page-library .search-tab[data-tab="albums"]').click();
    const cover = page.locator('#library-albums-container [data-album-id="album-1"] img.card-image');
    await cover.evaluate((image) => image.dispatchEvent(new Event('error')));
    await expect(cover).toHaveAttribute('src', /navichrome_logo\.svg/);

    expect(state.optionalRequests).toHaveLength(0);
    await page.goto('/settings');
    await waitForReady(page);
    await page.locator('.settings-tab[data-tab="audio"]').click();
    const equalizerToggle = page
        .locator('label.toggle-switch')
        .filter({ has: page.locator('#equalizer-enabled-toggle') });
    await equalizerToggle.click();
    await expect(page.locator('#equalizer-enabled-toggle')).toBeChecked();
    await expect(page.locator('#equalizer-container')).toBeVisible();
    await page.locator('#autoeq-database-toggle').click();
    await expect.poll(() => state.optionalRequests.length).toBeGreaterThan(0);
    await page.goto('/about');
    await expect(page.locator('#page-about')).toHaveClass(/active/);
    await expect(page.locator('#about-commit-info')).toContainText('Navichrome 0.1.0-beta.1');
    await expect(page.locator('#about-commit-info')).not.toContainText('unknown');
    await page.goto('/library');
    await expect(page.locator('#page-library')).toHaveClass(/active/);
});

test('large Singles remains progressive, bounded and stable when reopened', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    test.skip(testInfo.project.name !== 'desktop-chromium', 'The 10,000-track stress journey runs once on desktop.');
    const state = await installNavidromeMock(page, { largeSinglesCount: 10_000 });
    await page.goto('/library');
    await waitForReady(page);

    const singlesArtworkSizes = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname.endsWith('/getCoverArt.view')) singlesArtworkSizes.push(url.searchParams.get('size'));
    });

    await page.evaluate(() => {
        window.__singlesResponsiveness = false;
        setTimeout(() => {
            window.__singlesResponsiveness = true;
        }, 50);
    });
    await page.locator('#page-library .search-tab[data-tab="singles"]').click();
    await expect.poll(() => page.evaluate(() => window.__singlesResponsiveness), { timeout: 2_000 }).toBe(true);

    const rows = page.locator('#library-singles-container .track-item');
    await expect.poll(() => rows.count(), { timeout: 45_000 }).toBe(10_000);
    await expect(rows.first()).toHaveAttribute('data-track-id', 'catalogue-0');
    await expect(rows.last()).toHaveAttribute('data-track-id', 'catalogue-9999');

    const firstImage = rows.first().locator('img.track-item-cover');
    await expect(firstImage).toHaveAttribute('width', '40');
    await expect(firstImage).toHaveAttribute('height', '40');
    await expect(firstImage).not.toHaveAttribute('src', '');
    await expect.poll(() => singlesArtworkSizes.includes('80')).toBe(true);

    const cache = await expect
        .poll(
            () =>
                page.evaluate(() => {
                    const key = Object.keys(localStorage).find((name) => name.startsWith('navichrome-singles-v'));
                    const serialized = key ? localStorage.getItem(key) : null;
                    return serialized ? { length: serialized.length, value: JSON.parse(serialized) } : null;
                }),
            { timeout: 12_000 }
        )
        .not.toBeNull();
    void cache;
    const persisted = await page.evaluate(() => {
        const key = Object.keys(localStorage).find((name) => name.startsWith('navichrome-singles-v'));
        const serialized = localStorage.getItem(key);
        return { length: serialized.length, value: JSON.parse(serialized) };
    });
    expect(persisted.length).toBeLessThanOrEqual(1_500_000);
    expect(persisted.value.tracks.length).toBeLessThanOrEqual(1500);
    expect(persisted.value.totalTracks).toBe(10_000);

    const requestsBeforeReopen = state.singlesPageRequests;
    await page.locator('#page-library .search-tab[data-tab="albums"]').click();
    await page.locator('#page-library .search-tab[data-tab="singles"]').click();
    await expect(rows).toHaveCount(10_000);
    expect(state.singlesPageRequests).toBe(requestsBeforeReopen);
});

test('Singles alphabet index jumps to exact letters and returns to the top', async ({ page }) => {
    await installNavidromeMock(page, { alphabetSinglesCountPerLetter: 24 });
    await page.goto('/library');
    await waitForReady(page);
    await page.locator('#page-library .search-tab[data-tab="singles"]').click();

    const rows = page.locator('#library-singles-container .track-item');
    await expect(rows).toHaveCount(26 * 24 + 2);

    const prefixedRow = page.locator('#library-singles-container [data-track-id="alphabet-other-0"]');
    await expect(rows.nth(0)).toHaveAttribute('data-track-id', 'alphabet-other-0');
    await expect(rows.nth(2)).toHaveAttribute('data-track-id', 'alphabet-A-0');
    await page.getByRole('button', { name: 'Jump to 0' }).click();
    await expect.poll(() => prefixedRow.evaluate((row) => row.getBoundingClientRect().top)).toBeLessThan(180);

    const pRow = page.locator('#library-singles-container [data-track-id="alphabet-P-0"]');
    const qRow = page.locator('#library-singles-container [data-track-id="alphabet-Q-0"]');
    await page.getByRole('button', { name: 'Jump to P' }).click();
    await expect.poll(() => pRow.evaluate((row) => row.getBoundingClientRect().top)).toBeLessThan(180);
    await expect
        .poll(() =>
            page.evaluate(() => Math.max(window.scrollY || 0, document.querySelector('.main-content')?.scrollTop || 0))
        )
        .toBeGreaterThan(500);

    await page.getByRole('button', { name: 'Jump to Q' }).click();
    await expect.poll(() => qRow.evaluate((row) => row.getBoundingClientRect().top)).toBeLessThan(180);

    const backToTop = page.getByRole('button', { name: 'Back to top' });
    await expect(backToTop).toBeVisible();
    await backToTop.click();
    await expect
        .poll(() =>
            page.evaluate(() => Math.max(window.scrollY || 0, document.querySelector('.main-content')?.scrollTop || 0))
        )
        .toBeLessThan(10);
});
