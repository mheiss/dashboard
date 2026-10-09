import { HttpClient } from '@angular/common/http';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { createClient } from 'graphql-ws';
import { firstValueFrom, Subject } from 'rxjs';
import { DashboardChange } from './backend.model';

@Injectable({ providedIn: 'root' })
export class BackendService {
  private readonly http = inject(HttpClient);
  readonly changed = new Subject<DashboardChange>();
  readonly connected = signal(false);

  constructor() {
    const endpoint = new URL('/graphql', window.location.href);
    endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
    const client = createClient({
      url: endpoint.toString(),
      retryAttempts: Infinity,
      shouldRetry: () => true,
      on: {
        connected: () => {
          this.connected.set(true);
          this.changed.next({ dataset: 'ALL', revision: -1, timestamp: new Date().toISOString() });
        },
        closed: () => this.connected.set(false),
      },
    });
    const unsubscribe = client.subscribe<{ dashboardChanged: DashboardChange }>(
      { query: 'subscription { dashboardChanged { dataset revision timestamp } }' },
      {
        next: (message) => {
          if (message.data?.dashboardChanged) this.changed.next(message.data.dashboardChanged);
        },
        error: () => this.connected.set(false),
        complete: () => this.connected.set(false),
      },
    );
    const visible = () => {
      if (document.visibilityState === 'visible') {
        this.changed.next({ dataset: 'ALL', revision: -1, timestamp: new Date().toISOString() });
      }
    };
    document.addEventListener('visibilitychange', visible);
    let currentDay = new Date().toDateString();
    const midnight = window.setInterval(() => {
      const day = new Date().toDateString();
      if (day !== currentDay) { currentDay = day; visible(); }
    }, 60_000);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(midnight);
      unsubscribe();
      this.connected.set(false);
      void client.dispose();
    });
  }

  async query<Result>(query: string, variables: Record<string, unknown> = {}): Promise<Result> {
    const response = await firstValueFrom(
      this.http.post<{ data?: Result; errors?: { message: string; extensions?: { code?: string } }[] }>(
        '/graphql',
        { query, variables },
        { headers: { 'X-Dashboard-Request': 'true' } },
      ),
    );
    if (response.errors?.length || !response.data) {
      throw new Error(response.errors?.map((error) => `${error.extensions?.code ?? ''} ${error.message}`).join('; ') || 'Backend returned no data');
    }
    return response.data;
  }
}
