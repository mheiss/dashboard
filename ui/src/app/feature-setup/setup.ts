import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { LucideCalendarDays, LucideImages, LucideLogOut, LucidePlus, LucideRefreshCw, LucideTrash2 } from '@lucide/angular';
import { debounceTime, interval } from 'rxjs';
import { AccountView } from '../backend/generated/models/account-view';
import { SourceView } from '../backend/generated/models/source-view';
import { AccountsService } from '../backend/generated/services/accounts.service';
import { BackendService } from '../backend/backend.service';
import { SessionService } from '../backend/session.service';
import { PopupService } from '../popup/popup.service';
import { CalendarBrowserComponent } from './calendar-browser/calendar-browser';
import { FolderBrowserComponent } from './folder-browser/folder-browser';

@Component({
  selector: 'app-setup',
  imports: [FormsModule, DatePipe, LucideCalendarDays, LucideImages, LucidePlus, LucideRefreshCw, LucideTrash2, LucideLogOut],
  templateUrl: './setup.html',
  host: { class: 'block h-full' },
})
export class Setup {
  private readonly accountsApi = inject(AccountsService);
  private readonly backend = inject(BackendService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly popup = inject(PopupService);
  readonly accounts = signal<AccountView[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly pendingDisconnect = signal<string | null>(null);

  constructor() {
    this.backend.changed.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => void this.reload());
    interval(5000)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.accounts().some((account) => account.status === 'SYNCING')) void this.reload();
      });
    void this.completeConnection();
  }

  private async completeConnection() {
    const pending = sessionStorage.getItem('dashboard.microsoft-connection');
    if (pending) {
      sessionStorage.removeItem('dashboard.microsoft-connection');
      await this.run(async () => {
        const connection: { code: string; state: string } = JSON.parse(pending);
        await this.accountsApi.completeAccountConnection(connection);
      });
    }
    await this.reload();
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

  async select(source: SourceView, selected: boolean, theme = source.theme) {
    await this.run(async () => {
      this.accounts.set(await this.accountsApi.selectAccountSource({ sourceId: source.id, body: { selected, theme } }));
    });
  }

  async removeSource(source: SourceView) {
    await this.select(source, false);
  }

  openCalendarPicker(account: AccountView) {
    this.popup.open(CalendarBrowserComponent, {
      data: {
        account,
        onUpdated: (accounts: AccountView[]) => this.accounts.set(accounts),
      },
      disableClose: false,
      width: 'min(640px, calc(100vw - 32px))',
      height: 'min(620px, calc(100dvh - 32px))',
    });
  }

  openFolderPicker(account: AccountView) {
    this.popup.open(FolderBrowserComponent, {
      data: {
        account,
        onAdded: (accounts: AccountView[]) => this.accounts.set(accounts),
      },
      disableClose: false,
      width: 'min(640px, calc(100vw - 32px))',
      height: 'min(620px, calc(100dvh - 32px))',
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

  sourcesOf(account: AccountView, kind: 'CALENDAR' | 'PHOTOS') {
    return account.sources.filter((source) => source.kind === kind);
  }

  selectedSourcesOf(account: AccountView, kind: 'CALENDAR' | 'PHOTOS') {
    return this.sourcesOf(account, kind).filter((source) => source.selected);
  }

  sourceStatus(source: SourceView) {
    switch (source.syncStatus) {
      case 'SYNCING':
        return 'Wird synchronisiert';
      case 'SYNCED':
        return 'Synchronisiert';
      case 'ERROR':
        return 'Fehler';
      default:
        return 'Noch nicht synchronisiert';
    }
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
