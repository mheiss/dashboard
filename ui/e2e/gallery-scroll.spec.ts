import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1600, height: 1000 },
  { width: 600, height: 700 },
]) {
  test(`keeps moments and photos separate while scrolling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/gallery');

    const scroll = page.locator('.photo-viewport');
    const moments = scroll.locator('.moment-strip');
    const firstPhoto = scroll.locator('.photo-tile').first();
    await expect(moments).toBeVisible();
    await expect(firstPhoto).toBeVisible();
    await expect
      .poll(async () => {
        const bounds = await moments.boundingBox();
        const photo = await firstPhoto.boundingBox();
        return bounds && photo ? photo.y - (bounds.y + bounds.height) : -1;
      })
      .toBeGreaterThanOrEqual(20);

    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => scroll.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeGreaterThan(200);
    await scroll.evaluate((element) => {
      element.scrollTop = 500;
    });
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect
      .poll(async () => {
        const strip = await moments.boundingBox();
        const area = await scroll.boundingBox();
        return strip && area ? strip.y + strip.height - area.y : 1;
      })
      .toBeLessThanOrEqual(0);
    await scroll.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => scroll.locator('.photo-tile[title]').count()).toBeGreaterThan(0);
    await expect(scroll.locator('.photo-tile[title="Waldspaziergang (50)"]')).toBeVisible();

    await scroll.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBe(0);
    await expect(moments).toBeVisible();
    await expect(firstPhoto).toBeVisible();
  });
}
