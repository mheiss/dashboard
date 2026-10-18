import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucidePlus, LucideRefreshCw, LucideTrash2, LucideLogOut } from '@lucide/angular';
import { debounceTime } from 'rxjs';
import { AccountView } from '../backend/generated/models/account-view';
import { SourceView } from '../backend/generated/models/source-view';
import { AccountsService } from '../backend/generated/services/accounts.service';
import { BackendService } from '../backend/backend.service';
import { SessionService } from '../backend/session.service';

@Component({
  selector: 'app-setup',
  imports: [FormsModule, DatePipe, LucidePlus, LucideRefreshCw, LucideTrash2, LucideLogOut],
  templateUrl: './setup.html',
  host: { class: 'block h-full' },
})
export class Setup {
  private readonly accountsApi = inject(AccountsService);
  private readonly backend = inject(BackendService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly accounts = signal<AccountView[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly pendingDisconnect = signal<string | null>(null);
  readonly folderPaths: Record<string, string> = {};

  constructor() {
    this.backend.changed.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => void this.reload());
    void this.reload();
  }

  async reload() {
    try {
      this.accounts.set(await this.accountsApi.getAccounts());
    } catch {
      this.error.set('Konten konnten nicht geladen werden.');
    }
  }

  async connect() {
    await this.run(async () => {
      const response = await this.accountsApi.connectAccount();
      window.location.assign(response.url);
    });
  }

  async discover(account: AccountView) {
    await this.run(async () => {
      this.accounts.set(await this.accountsApi.discoverAccountSources({ accountId: account.id }));
    });
  }

  async select(source: SourceView, selected: boolean, theme = source.theme) {
    await this.run(async () => {
      this.accounts.set(await this.accountsApi.selectAccountSource({ sourceId: source.id, body: { selected, theme } }));
    });
  }

  async addFolder(account: AccountView) {
    const path = this.folderPaths[account.id]?.trim();
    if (!path) return;
    await this.run(async () => {
      this.accounts.set(await this.accountsApi.addAccountFolder({ accountId: account.id, body: { path } }));
      this.folderPaths[account.id] = '';
    });
  }

  async disconnect(account: AccountView) {
    await this.run(async () => {
      await this.accountsApi.disconnectAccount({ accountId: account.id });
      this.pendingDisconnect.set(null);
      await this.reload();
    });
  }

  async sync() {
    await this.run(async () => {
      await this.accountsApi.requestSync();
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
    try {
      await operation();
    } catch {
      this.error.set('Aktion fehlgeschlagen. Serverkonfiguration und Kontozugriff prüfen.');
    } finally {
      this.busy.set(false);
    }
  }
}
