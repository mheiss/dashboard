import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createClient } from 'graphql-ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendService } from './backend.service';

vi.mock('graphql-ws', () => ({ createClient: vi.fn() }));

describe('Public dashboard backend', () => {
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(() => unsubscribe);
  const dispose = vi.fn();
  let service: BackendService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockReturnValue({ subscribe, dispose } as unknown as ReturnType<typeof createClient>);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BackendService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  it('subscribes to changes without loading a session', () => {
    expect(createClient).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledWith(
      { query: 'subscription { dashboardChanged { dataset revision timestamp } }' },
      expect.any(Object),
    );
    http.expectNone('/session');
  });

  it('queries data without authentication', async () => {
    const result = service.query<{ calendars: unknown[] }>('{ calendars { id } }');
    const request = http.expectOne('/graphql');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-Dashboard-Request')).toBe('true');
    request.flush({ data: { calendars: [] } });
    await expect(result).resolves.toEqual({ calendars: [] });
  });

  it('disposes the public subscription when destroyed', () => {
    TestBed.resetTestingModule();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
