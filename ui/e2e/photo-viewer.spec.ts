import { expect, test } from '@playwright/test';

test('keeps the filmstrip thumbnails clear of the scrollbar and scrollable', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 700 });
  await page.goto('/gallery');
  await page.locator('.photo-viewport .photo-tile').first().click();

  const viewer = page.getByRole('dialog');
  const filmstrip = viewer.locator('cdk-virtual-scroll-viewport');
  await expect(viewer).toContainText('Bild 1 / 50');
  const spacing = await filmstrip.evaluate((viewport) => {
    const thumbnail = viewport.querySelector('button')!.getBoundingClientRect();
    const bounds = viewport.getBoundingClientRect();
    return {
      bottomGap: bounds.bottom - thumbnail.bottom,
      visibleGap: bounds.top + viewport.clientTop + viewport.clientHeight - thumbnail.bottom,
      scrollable: viewport.scrollWidth > viewport.clientWidth,
    };
  });
  expect(spacing.bottomGap).toBeGreaterThanOrEqual(16);
  expect(spacing.visibleGap).toBeGreaterThanOrEqual(0);
  expect(spacing.scrollable).toBe(true);

  await filmstrip.evaluate((viewport) => (viewport.scrollLeft = viewport.scrollWidth));
  await expect.poll(() => filmstrip.evaluate((viewport) => viewport.scrollLeft)).toBeGreaterThan(0);
  const lastThumbnail = filmstrip.getByRole('button').last();
  await expect(lastThumbnail).toBeVisible();
  const imageName = await lastThumbnail.getAttribute('title');
  expect(imageName).toBeTruthy();
  await lastThumbnail.click();
  await expect(viewer.locator('header h2')).toHaveText(imageName!);
});
