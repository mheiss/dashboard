import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucidePlus, LucideRefreshCw, LucideTrash2, LucideLogOut } from '@lucide/angular';
import { debounceTime, firstValueFrom } from 'rxjs';
import { AccountView, SourceView } from '../backend/backend.model';
import { BackendService } from '../backend/backend.service';
import { SessionService } from '../backend/session.service';

@Component({
  selector: 'app-setup',
  imports: [FormsModule, DatePipe, LucidePlus, LucideRefreshCw, LucideTrash2, LucideLogOut],
  templateUrl: './setup.html',
  host: { class: 'block h-full' },
})
export class Setup {
  private readonly http = inject(HttpClient);
  private readonly backend = inject(BackendService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly accounts = signal<AccountView[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly pendingDisconnect = signal<string | null>(null);
  readonly folderPaths: Record<string, string> = {};
  private readonly headers = { 'X-Dashboard-Request': 'true' };

  constructor() {
    this.backend.changed.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => void this.reload());
    void this.reload();
  }

  async reload() {
    try {
      this.accounts.set(await firstValueFrom(this.http.get<AccountView[]>('/accounts')));
    } catch {
      this.error.set('Konten konnten nicht geladen werden.');
    }
  }

  async connect() {
    await this.run(async () => {
      const response = await firstValueFrom(this.http.post<{ url: string }>('/accounts/connect', {}, { headers: this.headers }));
      window.location.assign(response.url);
    });
  }

  async discover(account: AccountView) {
    await this.run(async () => {
      this.accounts.set(await firstValueFrom(this.http.post<AccountView[]>(`/accounts/${account.id}/discover`, {}, { headers: this.headers })));
    });
  }

  async select(source: SourceView, selected: boolean, theme = source.theme) {
    await this.run(async () => {
      this.accounts.set(await firstValueFrom(this.http.put<AccountView[]>(`/accounts/sources/${source.id}`, { selected, theme }, { headers: this.headers })));
    });
  }

  async addFolder(account: AccountView) {
    const path = this.folderPaths[account.id]?.trim();
    if (!path) return;
    await this.run(async () => {
      this.accounts.set(await firstValueFrom(this.http.post<AccountView[]>(`/accounts/${account.id}/folders`, { path }, { headers: this.headers })));
      this.folderPaths[account.id] = '';
    });
  }

  async disconnect(account: AccountView) {
    await this.run(async () => {
      await firstValueFrom(this.http.delete(`/accounts/${account.id}`, { headers: this.headers }));
      this.pendingDisconnect.set(null);
      await this.reload();
    });
  }

  async sync() {
    await this.run(async () => {
      await firstValueFrom(this.http.post('/accounts/sync', {}, { headers: this.headers }));
      await this.reload();
    });
  }

  async logout() {
    await this.session.logout();
    await this.router.navigate(['/home']);
  }

  private async run(operation: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try { await operation(); } catch { this.error.set('Aktion fehlgeschlagen. Serverkonfiguration und Kontozugriff prüfen.'); }
    finally { this.busy.set(false); }
  }
}
