import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { LucidePlus } from '@lucide/angular';
import { AccountView } from '../../backend/generated/models/account-view';
import { SourceView } from '../../backend/generated/models/source-view';
import { AccountsService } from '../../backend/generated/services/accounts.service';
import { Popup } from '../../popup/popup';
import { DialogOptions } from '../../popup/popup.service';

interface CalendarBrowserData {
  account: AccountView;
  onUpdated: (accounts: AccountView[]) => void;
}

@Component({
  selector: 'app-calendar-browser',
  imports: [Popup, LucidePlus],
  templateUrl: './calendar-browser.html',
})
export class CalendarBrowserComponent {
  readonly data = (inject(DIALOG_DATA) as DialogOptions).data as CalendarBrowserData;
  private readonly dialog = inject<DialogRef<unknown>>(DialogRef);
  private readonly accountsApi = inject(AccountsService);

  readonly calendars = signal<SourceView[]>([]);
  readonly loading = signal(false);
  readonly adding = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    void this.loadCalendars();
  }

  async addCalendar(calendar: SourceView): Promise<void> {
    if (this.adding()) return;

    this.adding.set(true);
    this.error.set(null);
    try {
      const accounts = await this.accountsApi.selectAccountSource({
        sourceId: calendar.id,
        body: { selected: true, theme: calendar.theme },
      });
      this.data.onUpdated(accounts);
      this.dialog.close();
    } catch {
      this.error.set('Kalender konnte nicht hinzugefügt werden. Serverkonfiguration und Kontozugriff prüfen.');
    } finally {
      this.adding.set(false);
    }
  }

  private async loadCalendars(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const accounts = await this.accountsApi.discoverAccountSources({ accountId: this.data.account.id });
      this.data.onUpdated(accounts);
      const account = accounts.find(({ id }) => id === this.data.account.id);
      if (!account) {
        this.error.set('Microsoft-Konto wurde nicht gefunden.');
        return;
      }
      this.calendars.set(account.sources.filter((source) => source.kind === 'CALENDAR' && !source.selected));
    } catch {
      this.error.set('Verfügbare Kalender konnten nicht geladen werden. Bitte Zugriff und Verbindung prüfen.');
    } finally {
      this.loading.set(false);
    }
  }
}
