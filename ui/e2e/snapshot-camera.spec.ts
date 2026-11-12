import { expect, test } from '@playwright/test';

test('refreshes a snapshot camera, reports errors, and stops when leaving the camera view', async ({ page }) => {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.snapshotCameraIds = ['sample-garden'];
    await route.fulfill({ response, json: config });
  });

  let requests = 0;
  let fail = false;
  await page.route('**/api/webrtc/snapshot?src=unifi_sample-garden', async (route) => {
    requests++;
    if (fail) {
      await route.fulfill({ status: 502 });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64'),
      });
    }
  });

  await page.goto('/protect?camera=sample-garden');
  const snapshots = page.locator('app-snapshot');
  await expect(snapshots.first().locator('img')).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => requests).toBeGreaterThan(2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  const hiddenAt = requests;
  await page.waitForTimeout(1500);
  expect(requests).toBe(hiddenAt);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => requests).toBeGreaterThan(hiddenAt);
  fail = true;
  await expect(snapshots.first()).toContainText('No signal');
  await expect(snapshots.first().locator('img')).not.toHaveAttribute('src', /^blob:/);

  await page.goto('/home');
  await page.waitForTimeout(300);
  const stoppedAt = requests;
  await page.waitForTimeout(1500);
  expect(requests).toBe(stoppedAt);
});
