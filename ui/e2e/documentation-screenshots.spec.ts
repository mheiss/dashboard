import { expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

const screenshotPath = (name: string) => resolve(process.cwd(), '..', 'docs', 'images', name);

async function openHome(page: Page) {
  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Galerie' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '12 Fotos' })).toBeVisible();
  await expect
    .poll(
      () =>
        page
          .locator('main img')
          .evaluateAll(
            (images) =>
              images.length > 0 && images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
          ),
      { timeout: 20_000 },
    )
    .toBe(true);
}

test('captures the home dashboard', async ({ page }) => {
  await openHome(page);
  await page.screenshot({ path: screenshotPath('dashboard-home.png') });
});

test('captures the memory archive', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Alle Tage' }).click();

  const archive = page.getByRole('dialog');
  await expect(archive.getByRole('heading', { name: 'Vergangene Tage' })).toBeVisible();
  await expect(archive.getByRole('heading', { name: 'Alle Erinnerungstage' })).toBeVisible();
  await page.screenshot({ path: screenshotPath('dashboard-memory-browser.png') });
});

test('captures the photo viewer', async ({ page }) => {
  await openHome(page);
  await page.locator('.photo-viewport .photo-tile').first().click();

  const viewer = page.getByRole('dialog');
  await expect(viewer).toContainText('Bild 1 / 12');
  await expect(viewer.locator('header h2')).not.toHaveClass(/italic/);
  await expect(viewer.locator('img[alt="Bergsee im Morgenlicht"]').first()).toBeVisible();
  await expect
    .poll(() =>
      viewer
        .locator('img[alt="Bergsee im Morgenlicht"]')
        .first()
        .evaluate((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await page.screenshot({ path: screenshotPath('dashboard-photo-viewer.png') });
});
