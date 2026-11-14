import { expect, test, type Page } from '@playwright/test';

async function mockTwoSnapshotCameras(page: Page) {
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.cameras = { 'sample-garden': 'Garten', 'sample-driveway': 'Einfahrt' };
    config.snapshotCameraIds = Object.keys(config.cameras);
    await route.fulfill({ response, json: config });
  });
  await page.route('**/api/webrtc/snapshot?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64'),
    });
  });
}

for (const viewport of [
  { width: 1600, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`persists camera visibility for this browser at ${viewport.width}px`, async ({ page, browser }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/config', async (route) => {
      const response = await route.fetch();
      const config = await response.json();
      config.snapshotCameraIds = ['sample-garden', 'sample-driveway'];
      await route.fulfill({ response, json: config });
    });

    const requests: string[] = [];
    await page.route('**/api/webrtc/snapshot?*', async (route) => {
      requests.push(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64'),
      });
    });

    await page.goto('/protect?camera=sample-garden');
    await page.getByRole('button', { name: 'Einstellungen' }).click();
    await page.getByRole('checkbox', { name: 'Garten' }).uncheck();
    await expect(page.getByText('1 Kameras')).toBeVisible();
    await expect(page).toHaveURL(/camera=sample-driveway/);

    requests.length = 0;
    await page.goto('/protect?camera=sample-garden');
    await expect(page.getByText('1 Kameras')).toBeVisible();
    await expect(page).toHaveURL(/camera=sample-driveway/);
    await expect.poll(() => requests.some((url) => url.includes('unifi_sample-driveway'))).toBe(true);
    expect(requests.some((url) => url.includes('unifi_sample-garden'))).toBe(false);
    await page.getByRole('button', { name: 'Einstellungen' }).click();
    await expect(page.getByRole('checkbox', { name: 'Garten' })).not.toBeChecked();
    await page.getByRole('checkbox', { name: 'Einfahrt' }).uncheck();
    await expect(page.getByText('Auf diesem Gerät werden keine Kameras angezeigt.')).toBeVisible();
    await expect(page.locator('app-snapshot, app-video')).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Garten' }).check();
    await expect(page.locator('app-snapshot')).not.toHaveCount(0);
    await page.getByRole('button', { name: 'Schließen' }).click();

    const otherContext = await browser.newContext({ viewport });
    try {
      const otherPage = await otherContext.newPage();
      await otherPage.goto('/protect');
      await expect(otherPage.getByText('2 Kameras')).toBeVisible();
    } finally {
      await otherContext.close();
    }
  });
}

test('orders cameras in settings and persists the order per browser', async ({ page, browser }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockTwoSnapshotCameras(page);
  await page.goto('/protect');

  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('button', { name: 'Kamera Garten nach oben verschieben' })).toBeDisabled();
  await page.getByRole('button', { name: 'Kamera Einfahrt nach oben verschieben' }).click();
  await expect(page.getByRole('button', { name: 'Kamera Einfahrt nach oben verschieben' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Kamera Garten nach oben verschieben' })).toBeEnabled();
  await page.getByRole('button', { name: 'Schließen' }).click();

  const cameraOrder = async () =>
    page
      .locator('.camera-screen app-snapshot')
      .evaluateAll((cameras) => cameras.map((camera) => camera.parentElement?.querySelector(':scope > span')?.textContent?.trim()));
  await expect.poll(cameraOrder).toEqual(['Einfahrt', 'Garten']);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('dashboard.cameraOrder')))
    .toBe(JSON.stringify(['sample-driveway', 'sample-garden']));

  await page.reload();
  await expect.poll(cameraOrder).toEqual(['Einfahrt', 'Garten']);

  const otherContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const otherPage = await otherContext.newPage();
    await mockTwoSnapshotCameras(otherPage);
    await otherPage.goto('/protect');
    await otherPage.getByRole('button', { name: 'Einstellungen' }).click();
    await expect(otherPage.getByRole('button', { name: 'Kamera Garten nach oben verschieben' })).toBeDisabled();
    await expect(otherPage.getByRole('button', { name: 'Kamera Einfahrt nach oben verschieben' })).toBeEnabled();
  } finally {
    await otherContext.close();
  }
});

test('allows panning and zooming the desktop main camera view', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.snapshotCameraIds = ['sample-garden'];
    await route.fulfill({ response, json: config });
  });
  await page.route('**/api/webrtc/snapshot?*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64'),
    });
  });
  await page.goto('/protect');

  const camera = page.locator('.camera-screen app-snapshot img').last();
  await expect(camera).toHaveAttribute('src', /^blob:/);
  const box = await camera.boundingBox();
  if (!box) throw new Error('Main camera view is not visible');

  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.wheel(0, -120);
  await expect.poll(() => camera.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThan(1);

  const before = await camera.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 30, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => camera.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41)).not.toBe(before);
});

test('reports when camera visibility cannot be saved', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'dashboard.hiddenCameras') throw new Error('Storage unavailable');
      return setItem.call(this, key, value);
    };
  });
  await page.goto('/protect');
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await page.getByRole('checkbox', { name: 'Garten' }).uncheck();
  await expect(page.getByRole('alert')).toContainText('konnte nicht gespeichert werden');
  await expect(page.getByText('1 Kameras')).toBeVisible();
});

test('exposes device settings without sign-in and protects account management', async ({ page }) => {
  await page.goto('/home');
  await expect(page.getByRole('button', { name: 'Zum hellen Design wechseln' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  const settings = page.getByRole('dialog');
  await expect(settings.getByRole('checkbox', { name: 'Garten' })).toBeChecked();
  await settings.getByRole('button', { name: 'Zum hellen Design wechseln' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await settings.getByRole('button', { name: 'Schließen' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('button', { name: 'Mit Keycloak anmelden' })).toBeVisible();
});

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

test.describe('mobile fullscreen camera viewer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('shows the poster, status, and live video in the viewer', async ({ page }) => {
    await page.route('**/api/webrtc/snapshot?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64'),
      });
    });
    await page.goto('/protect');
    const camera = page.locator('app-video').first();
    const preview = camera.locator('video');
    await expect(preview).toHaveAttribute('poster', /^blob:/);
    await expect(camera.getByText('MSE', { exact: true })).toBeVisible();
    await camera.getByRole('button', { name: 'Stream diagnostics' }).tap();
    await expect(camera.getByText(/FPS:/)).toBeVisible();
    await camera.getByRole('button', { name: 'Stream diagnostics' }).tap();
    await expect(camera.getByText(/FPS:/)).toHaveCount(0);
    await preview.tap();

    const viewer = page.locator('app-video-viewer');
    const video = viewer.locator('video');
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute('poster', /^blob:/);
    expect(await video.getAttribute('poster')).toBe(await preview.getAttribute('poster'));
    expect(
      await video.evaluate(async (element: HTMLVideoElement) => {
        const image = new Image();
        image.src = element.poster;
        await image.decode();
        return image.naturalWidth;
      }),
    ).toBeGreaterThan(0);
    const streamStatus = viewer.getByText(/^(Offline|Connecting|Connected|Starting|Buffering|No signal)$/);
    await expect(streamStatus).toBeVisible();
    const box = await video.boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.height).toBe(844);
    const close = viewer.getByRole('button', { name: 'Close full-screen stream' });
    await expect(close).toBeVisible();
    await expect(close.locator('svg')).toHaveCSS('width', '24px');

    await camera.evaluate((element) => {
      const ng = (window as unknown as {
        ng: { getComponent(element: Element): { video: { set(value: MediaStream): void }; statusText: { set(value: null): void } } };
      }).ng;
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 24;
      canvas.getContext('2d')!.fillRect(0, 0, canvas.width, canvas.height);
      const component = ng.getComponent(element);
      component.video.set(canvas.captureStream());
      component.statusText.set(null);
    });
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(32);
    await expect(streamStatus).toHaveCount(0);
    expect(
      await video.evaluate((element: HTMLVideoElement) => element.srcObject === document.querySelector<HTMLVideoElement>('app-video video')?.srcObject),
    ).toBe(true);
    await close.tap();
    await expect(viewer).toHaveCount(0);
    await preview.tap();
    await expect.poll(() => viewer.locator('video').evaluate((element: HTMLVideoElement) => element.videoWidth)).toBe(32);
    await page.mouse.move(195, 422);
    await page.mouse.wheel(0, -120);
    await expect.poll(() => video.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThan(1);
    await camera.evaluate((element) => {
      const ng = (window as unknown as {
        ng: { getComponent(element: Element): { video: { set(value: null): void }; statusText: { set(value: string): void } } };
      }).ng;
      const component = ng.getComponent(element);
      (element.querySelector('video')!.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      component.video.set(null);
      component.statusText.set('No signal');
    });
    await expect(viewer.getByText('No signal')).toBeVisible();
    await expect(video).toHaveAttribute('poster', /^blob:/);
    await viewer.getByRole('button', { name: 'Close full-screen stream' }).tap();
  });

  test('shows a snapshot and can close the viewer', async ({ page }) => {
    await mockTwoSnapshotCameras(page);
    let fail = false;
    await page.route('**/api/webrtc/snapshot?*', async (route) => {
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
    await page.goto('/protect');
    const preview = page.locator('app-snapshot img').first();
    await expect(preview).toHaveAttribute('src', /^blob:/);
    await preview.tap();
    const viewer = page.locator('app-video-viewer');
    await expect(viewer.locator('img')).toBeVisible();
    await expect(viewer.locator('img')).toHaveAttribute('src', /^blob:/);
    fail = true;
    await expect(viewer.getByText('No signal')).toBeVisible();
    await viewer.getByRole('button', { name: 'Close full-screen stream' }).tap();
    await expect(viewer).toHaveCount(0);
  });
});

test.describe('mobile camera gestures', () => {
  test.use({ viewport: { width: 390, height: 500 }, hasTouch: true, isMobile: true });

  for (const selector of ['app-snapshot img', 'app-video video']) {
    test(`scrolls and zooms from ${selector}`, async ({ page, context }) => {
      await page.route('**/api/config', async (route) => {
        const response = await route.fetch();
        const config = await response.json();
        config.cameras = { ...config.cameras, extra1: 'Extra 1', extra2: 'Extra 2' };
        config.snapshotCameraIds = ['sample-garden', 'extra1', 'extra2'];
        await route.fulfill({ response, json: config });
      });

      await page.goto('/protect');
      const camera = page.locator(selector).first();
      const scroll = page.locator('.camera-screen');
      await expect(camera).toBeVisible();
      await camera.scrollIntoViewIfNeeded();
      const box = await camera.boundingBox();
      if (!box) throw new Error('Camera is not visible');

      const client = await context.newCDPSession(page);
      const x = box.x + box.width / 2;
      const y = Math.min(box.y + box.height / 2, 400);
      const before = await scroll.evaluate((element) => element.scrollTop);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let distance = 20; distance <= 100; distance += 20) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - distance }] });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(before + 20);

      await camera.scrollIntoViewIfNeeded();
      const visibleBox = await camera.boundingBox();
      if (!visibleBox) throw new Error('Camera is not visible');
      const centerX = visibleBox.x + visibleBox.width / 2;
      const centerY = Math.max(100, Math.min(visibleBox.y + visibleBox.height / 2, 400));
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { x: centerX - 25, y: centerY },
          { x: centerX + 25, y: centerY },
        ],
      });
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: centerX - 80, y: centerY },
          { x: centerX + 80, y: centerY },
        ],
      });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => camera.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThan(1);

      const pinchScale = await camera.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
      await page.mouse.move(centerX, centerY);
      await page.mouse.wheel(0, -120);
      await expect
        .poll(() => camera.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a))
        .toBeGreaterThan(pinchScale);

      await scroll.evaluate((element) => (element.scrollTop = 0));
      await camera.scrollIntoViewIfNeeded();
      const zoomedBox = await camera.boundingBox();
      if (!zoomedBox) throw new Error('Camera is not visible');
      const zoomedY = Math.max(100, Math.min(zoomedBox.y + zoomedBox.height / 2, 400));
      const zoomedBefore = await scroll.evaluate((element) => element.scrollTop);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centerX, y: zoomedY }] });
      for (let distance = 20; distance <= 100; distance += 20) {
        await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centerX, y: zoomedY - distance }] });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(zoomedBefore + 20);
    });
  }
});
