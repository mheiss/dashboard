import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendImage, DashboardChange, ImagePage } from '../backend/backend.model';
import { BackendService } from '../backend/backend.service';
import { ImageService } from './image.service';

const image = (id: string): BackendImage => ({
  id, name: `${id}.jpg`, takenAt: '2020-10-08T10:00:00Z', modifiedAt: '2020-10-08T10:00:00Z',
  thumbnailUrl: `/media/images/${id}/thumbnail?v=1`, originalUrl: `/media/images/${id}/original?v=1`,
});
const page = (items: BackendImage[], hasNextPage = false): ImagePage => ({
  revision: 1, totalCount: hasNextPage ? 26 : items.length, endCursor: 'opaque-cursor', hasNextPage, items,
});

describe('Backend image presentation', () => {
  const changed = new Subject<DashboardChange>();
  const query = vi.fn();

  beforeEach(() => {
    query.mockReset();
    query.mockImplementation(async (operation: string) => operation.includes('query Images')
      ? { images: page([image('first')]) } : { moments: [] });
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: BackendService, useValue: { changed, query } }] });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  it('shares image downloads across concurrent and later subscribers', async () => {
    query.mockImplementation(async (operation: string) => operation.includes('query Images')
      ? { images: page([image('first')]) } : { moments: [{ date: '2020-10-08', images: [image('first')] }] });
    const service = TestBed.inject(ImageService);
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    const http = TestBed.inject(HttpTestingController);
    const thumbnail = service.images()[0].thumbnail$;
    const received: (Blob | null)[] = [];
    thumbnail.subscribe((blob) => received.push(blob));
    service.moments()[0].images[0].thumbnail$.subscribe((blob) => received.push(blob));
    const blob = new Blob(['image'], { type: 'image/jpeg' });
    http.expectOne(image('first').thumbnailUrl).flush(blob);
    thumbnail.subscribe((blob) => received.push(blob));
    http.expectNone(image('first').thumbnailUrl);
    expect(received).toEqual([blob, blob, blob]);
    await service.refreshImages();
    expect(service.moments()[0].images[0]).toBe(service.images()[0]);
    expect(service.moments()[0].images[0].thumbnail$).toBe(thumbnail);
  });

  it('retries failed downloads on a later subscription', async () => {
    const service = TestBed.inject(ImageService);
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    const http = TestBed.inject(HttpTestingController);
    const thumbnail = service.images()[0].thumbnail$;
    const received: (Blob | null)[] = [];
    thumbnail.subscribe((blob) => received.push(blob));
    http.expectOne(image('first').thumbnailUrl).flush(null, { status: 503, statusText: 'Unavailable' });
    thumbnail.subscribe((blob) => received.push(blob));
    const blob = new Blob(['image'], { type: 'image/jpeg' });
    http.expectOne(image('first').thumbnailUrl).flush(blob);
    expect(received).toEqual([null, blob]);
  });

  it('reuses unchanged images and retains the last good page on failure', async () => {
    const service = TestBed.inject(ImageService);
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    const original = service.images()[0];
    await service.refreshImages();
    expect(service.images()[0]).toBe(original);
    query.mockRejectedValue(new Error('Offline'));
    await service.refreshImages();
    expect(service.images()[0]).toBe(original);
    expect(service.error()).not.toBeNull();
  });

  it('passes opaque cursors to the backend instead of paginating locally', async () => {
    query.mockImplementation(async (operation: string, variables?: { after: string | null }) => {
      if (!operation.includes('query Images')) return { moments: [] };
      return { images: variables?.after ? page([image('last')]) : page(Array.from({ length: 25 }, (_, index) => image(`photo-${index}`)), true) };
    });
    const service = TestBed.inject(ImageService);
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    await service.loadMore();
    expect(service.images()).toHaveLength(26);
    expect(query.mock.calls.at(-1)?.[1]).toEqual({ first: 25, after: 'opaque-cursor' });
    const count = query.mock.calls.length;
    await service.loadMore();
    expect(query.mock.calls).toHaveLength(count);
  });

  it('discards an old page that completes after a newer refresh', async () => {
    let finishOld!: (response: { images: ImagePage }) => void;
    query.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
    const service = TestBed.inject(ImageService);
    await service.refreshImages();
    finishOld({ images: page([image('stale')]) });
    await Promise.resolve();
    expect(service.images().map((entry) => entry.image.id)).toEqual(['first']);
  });
});
