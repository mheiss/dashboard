import { expect, test } from '@playwright/test';

test('opens and pages through every photo belonging to each memory tile', async ({ page }) => {
  const pages = new Map<string, Record<string, unknown>[]>();
  let failNextPage = true;
  await page.route('**/api/graphql', async (route) => {
    const request = route.request().postDataJSON();
    if (request.query.includes('MemoryImages')) {
      if (failNextPage) {
        failNextPage = false;
        await route.fulfill({ status: 503 });
        return;
      }
      const { month, day, after } = request.variables;
      const photos = pages.get(`${month}-${day}`)!;
      const start = Number(after);
      await route.fulfill({
        json: { data: { memoryImages: { totalCount: photos.length, endCursor: null, hasNextPage: false, items: photos.slice(start) } } },
      });
      return;
    }
    if (!request.query.includes('MemoryIndex') && !request.query.includes('MemoryDays')) {
      await route.continue();
      return;
    }

    const response = await route.fetch();
    const body = await response.json();
    if (request.query.includes('MemoryIndex')) {
      for (const date of body.data.memoryDates) date.photoCount = 30;
    } else {
      for (const [key, day] of Object.entries(body.data) as [
        string,
        { items: Record<string, unknown>[]; totalCount: number; endCursor: string; hasNextPage: boolean },
      ][]) {
        const image = day.items[0];
        const photos = Array.from({ length: 30 }, (_, index) => ({
          ...image,
          id: `${key}-${index}`,
          name: `${key} photo ${index}`,
        }));
        const index = key.slice('memory'.length);
        pages.set(`${request.variables[`month${index}`]}-${request.variables[`day${index}`]}`, photos);
        day.items = photos.slice(0, 25);
        day.totalCount = photos.length;
        day.endCursor = '25';
        day.hasNextPage = true;
      }
    }
    await route.fulfill({ response, json: body });
  });

  await page.goto('/home');
  const cards = page.locator('.moment-card');
  await expect(cards).toHaveCount(4);
  await expect(cards.first().locator('.moment-count')).toHaveAttribute('aria-label', '30 Fotos an diesem Tag');

  await cards.first().locator('button').click();
  let viewer = page.getByRole('dialog');
  await expect(viewer).toContainText('Bild 1 / 30');
  await expect(viewer.locator('header h2')).toContainText('memory0 photo 0');
  await viewer.getByRole('button', { name: 'Nächstes Bild' }).click();
  await expect(viewer).toContainText('Bild 2 / 30');
  await expect(viewer.locator('header h2')).toContainText('memory0 photo 1');
  for (let index = 1; index < 15; index++) {
    await viewer.getByRole('button', { name: 'Nächstes Bild' }).click();
  }
  await expect(viewer.getByRole('alert')).toContainText('Weitere Fotos konnten nicht geladen werden.');
  await viewer.getByRole('button', { name: 'Erneut versuchen' }).click();
  await expect(viewer.getByRole('alert')).toHaveCount(0);
  for (let index = 15; index < 25; index++) {
    await viewer.getByRole('button', { name: 'Nächstes Bild' }).click();
  }
  await expect(viewer).toContainText('Bild 26 / 30');
  await expect(viewer.locator('header h2')).toContainText('memory0 photo 25');
  await viewer.getByRole('button', { name: 'Schließen' }).click();

  await cards.nth(1).locator('button').click();
  viewer = page.getByRole('dialog');
  await expect(viewer).toContainText('Bild 1 / 30');
  await expect(viewer.locator('header h2')).toContainText('memory1 photo 0');
});
