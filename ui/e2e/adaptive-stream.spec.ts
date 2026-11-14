import { expect, test } from '@playwright/test';
import { BehaviorSubject } from 'rxjs';
import { AdaptiveStream } from '../src/app/feature-protect/stream/adaptive-stream';
import { isWebRtcHealthy, probeBackoff } from '../src/app/feature-protect/stream/transport-policy';
import {
  createEmptyReport,
  createStreamReport,
  type Status,
  type StreamOffer,
  type StreamReport,
  type StreamTransport,
} from '../src/app/feature-protect/stream/stream.model';

class FakeTransport implements StreamTransport {
  readonly mediaStream = { id: Math.random().toString() } as unknown as MediaStream;
  readonly media = new BehaviorSubject<MediaStream | null>(null);
  readonly status = new BehaviorSubject<Status>('offline');
  readonly report = new BehaviorSubject<StreamReport>(createEmptyReport());
  readonly state = { media: this.media, status: this.status, report: this.report };
  usable = true;
  starts = 0;
  halts = 0;

  start() {
    this.starts++;
    this.status.next('connecting');
  }

  halt() {
    this.halts++;
    this.media.next(null);
    this.status.next('offline');
  }

  snapshot() {
    return { status: this.status.value, report: this.report.value };
  }

  stream(report: Partial<StreamReport> = {}) {
    this.media.next(this.mediaStream);
    this.report.next(
      createStreamReport(100, 1000, { fps: 25, bitrate: 1_000_000, availableBitrate: 5_000_000, packetsReceived: 1000, packetsLost: 0, ...report }),
    );
    this.status.next('streaming');
  }
}

function setup(withMse = true) {
  let now = 0;
  const webrtc = new FakeTransport();
  const mse = withMse ? new FakeTransport() : null;
  const stream = new AdaptiveStream({
    camera: 'camera',
    webrtc,
    mse,
    loadPoster: () => new Promise(() => undefined),
    debug: { log: () => undefined },
    now: () => now,
    autoTick: false,
  });
  const offer: StreamOffer = stream.start();
  const current: { media: MediaStream | null; status: Status; mode: string | null } = { media: null, status: 'offline', mode: null };
  offer.media.subscribe((media) => (current.media = media));
  offer.status.subscribe((status) => (current.status = status));
  offer.report.subscribe((report) => (current.mode = report.mode));
  const advance = (seconds: number) => {
    for (let second = 0; second < seconds; second++) {
      now += 1000;
      stream.tick();
    }
  };
  return { stream, webrtc, mse: mse!, current, advance };
}

function switchToWebRtc(world: ReturnType<typeof setup>) {
  world.mse.stream();
  world.advance(12);
  expect(world.webrtc.starts).toBe(1);
  world.webrtc.stream();
  world.advance(5);
  expect(world.current.media).toBe(world.webrtc.mediaStream);
}

test.describe('adaptive stream', () => {
  test('starts with MSE and switches to WebRTC once MSE is stable and WebRTC is healthy', () => {
    const world = setup();
    world.mse.stream();
    expect(world.current.media).toBe(world.mse.mediaStream);
    expect(world.current.mode).toBe('mse');

    world.advance(9);
    expect(world.webrtc.starts).toBe(0);
    world.advance(3);
    expect(world.webrtc.starts).toBe(1);
    expect(world.current.media).toBe(world.mse.mediaStream);

    world.webrtc.stream();
    world.advance(2);
    expect(world.current.media).toBe(world.mse.mediaStream);
    world.advance(3);
    expect(world.current.media).toBe(world.webrtc.mediaStream);
    expect(world.current.mode).toBe('webrtc');
    expect(world.mse.halts).toBe(1);
  });

  test('does not switch to a WebRTC stream with insufficient bandwidth', () => {
    const world = setup();
    world.mse.stream();
    world.advance(12);
    world.webrtc.stream({ availableBitrate: 1_200_000 });
    world.advance(10);
    expect(world.current.media).toBe(world.mse.mediaStream);
    world.advance(11);
    expect(world.webrtc.halts).toBe(1);
  });

  test('falls back to MSE when WebRTC buffers and waits before trying again', () => {
    const world = setup();
    switchToWebRtc(world);

    world.webrtc.status.next('buffering');
    expect(world.mse.starts).toBe(2);
    expect(world.webrtc.halts).toBe(1);
    expect(world.current.mode).toBe('mse');

    world.mse.stream();
    world.advance(29);
    expect(world.webrtc.starts).toBe(1);
    world.advance(2);
    expect(world.webrtc.starts).toBe(2);
  });

  test('tries WebRTC without waiting when MSE delivers nothing', () => {
    const world = setup();
    world.advance(7);
    expect(world.webrtc.starts).toBe(0);
    world.advance(2);
    expect(world.webrtc.starts).toBe(1);

    world.webrtc.stream();
    world.advance(1);
    expect(world.current.media).toBe(world.webrtc.mediaStream);
  });

  test('uses WebRTC only when MSE is not available and does not fall back', () => {
    const world = setup(false);
    expect(world.webrtc.starts).toBe(1);
    world.webrtc.stream();
    world.webrtc.status.next('buffering');
    world.advance(30);
    expect(world.webrtc.halts).toBe(0);
    expect(world.current.mode).toBe('webrtc');
  });

  test('gives up a WebRTC probe that never streams', () => {
    const world = setup();
    world.mse.stream();
    world.advance(12);
    expect(world.webrtc.starts).toBe(1);
    world.advance(21);
    expect(world.webrtc.halts).toBe(1);
    expect(world.current.media).toBe(world.mse.mediaStream);
    expect(world.mse.halts).toBe(0);
  });

  test('keeps running when a viewer returns within the idle timeout', () => {
    const world = setup();
    world.mse.stream();
    world.stream.stop();
    world.stream.start();
    expect(world.mse.starts).toBe(1);
    expect(world.mse.halts).toBe(0);
  });
});

test('requests MSE first and tries WebRTC when MSE delivers nothing', async ({ page }) => {
  const sockets: { url: string; frames: string[] }[] = [];
  page.on('websocket', (socket) => {
    if (!socket.url().includes('/api/ws/webrtc')) return;
    const entry = { url: socket.url(), frames: [] as string[] };
    sockets.push(entry);
    socket.on('framesent', (frame) => entry.frames.push(String(frame.payload)));
  });
  await page.route('**/api/config', async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    config.snapshotCameraIds = [];
    await route.fulfill({ response, json: config });
  });
  await page.route('**/api/webrtc/snapshot?*', (route) => route.fulfill({ status: 502 }));

  await page.goto('/protect?camera=sample-garden');
  await expect.poll(() => sockets.flatMap((socket) => socket.frames).some((frame) => frame.includes('"type":"mse"'))).toBe(true);
  expect(sockets.flatMap((socket) => socket.frames).some((frame) => frame.includes('webrtc/offer'))).toBe(false);

  await expect
    .poll(() => sockets.flatMap((socket) => socket.frames).some((frame) => frame.includes('webrtc/offer')), { timeout: 20_000 })
    .toBe(true);
});

test('shows the status badge before the camera name and the transport at the bottom right of a preview', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.route('**/api/webrtc/snapshot?*', (route) => route.fulfill({ status: 502 }));
  await page.goto('/protect?camera=sample-driveway');

  const preview = page.locator('app-video').filter({ hasText: 'Garten' });
  const mode = preview.getByText('MSE', { exact: true });
  await expect(mode).toBeVisible();
  const [box, badge, name, modeBox] = await Promise.all([
    preview.boundingBox(),
    preview.locator('div.rounded-full').boundingBox(),
    preview.getByText('Garten', { exact: true }).boundingBox(),
    mode.boundingBox(),
  ]);
  if (!box || !badge || !name || !modeBox) throw new Error('Preview parts are not visible');
  expect(badge.x + badge.width).toBeLessThanOrEqual(name.x);
  expect(name.x + name.width).toBeLessThanOrEqual(modeBox.x);
  expect(box.x + box.width - (modeBox.x + modeBox.width)).toBeLessThan(12);
  expect(box.y + box.height - (modeBox.y + modeBox.height)).toBeLessThan(12);
});

test.describe('transport policy', () => {
  test('backs off exponentially up to five minutes', () => {
    expect([1, 2, 3, 10].map(probeBackoff)).toEqual([30_000, 60_000, 120_000, 300_000]);
  });

  test('judges WebRTC health by loss, jitter and bandwidth', () => {
    const healthy = createStreamReport(100, 1000, { fps: 25, bitrate: 1_000_000, packetsReceived: 980, packetsLost: 20 });
    expect(isWebRtcHealthy(healthy)).toBe(true);
    expect(isWebRtcHealthy({ ...healthy, packetsLost: 100 })).toBe(false);
    expect(isWebRtcHealthy({ ...healthy, jitterMs: 80 })).toBe(false);
    expect(isWebRtcHealthy({ ...healthy, availableBitrate: 1_000_000 })).toBe(false);
  });
});
