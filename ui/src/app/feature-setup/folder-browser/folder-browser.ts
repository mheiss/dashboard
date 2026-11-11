import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { LucidePlus } from '@lucide/angular';
import { AccountView } from '../../backend/generated/models/account-view';
import { FolderItem } from '../../backend/generated/models/folder-item';
import { AccountsService } from '../../backend/generated/services/accounts.service';
import { Popup } from '../../popup/popup';
import { DialogOptions } from '../../popup/popup.service';

interface FolderBrowserData {
  account: AccountView;
  onAdded: (accounts: AccountView[]) => void;
}

@Component({
  selector: 'app-folder-browser',
  imports: [Popup, LucidePlus],
  templateUrl: './folder-browser.html',
})
export class FolderBrowserComponent {
  readonly data = (inject(DIALOG_DATA) as DialogOptions).data as FolderBrowserData;
  private readonly dialog = inject<DialogRef<unknown>>(DialogRef);
  private readonly accountsApi = inject(AccountsService);

  readonly folders = signal<FolderItem[]>([]);
  readonly breadcrumbs = signal<FolderItem[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);

  constructor() {
    void this.loadFolders();
  }

  enterFolder(folder: FolderItem): void {
    void this.loadFolders([...this.breadcrumbs(), folder]);
  }

  goToFolderLevel(breadcrumbCount: number): void {
    void this.loadFolders(this.breadcrumbs().slice(0, breadcrumbCount));
  }

  async addFolder(folder: FolderItem): Promise<void> {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set(null);
    try {
      const accounts = await this.accountsApi.addAccountFolder({
        accountId: this.data.account.id,
        body: { id: folder.id, driveId: folder.driveId },
      });
      this.data.onAdded(accounts);
      this.dialog.close();
    } catch {
      this.error.set('Ordner konnte nicht hinzugefügt werden. Serverkonfiguration und Kontozugriff prüfen.');
    } finally {
      this.saving.set(false);
    }
  }

  private async loadFolders(breadcrumbs: FolderItem[] = []): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    this.breadcrumbs.set(breadcrumbs);
    try {
      const parent = breadcrumbs.at(-1);
      const response = await this.accountsApi.browseAccountFolders({
        accountId: this.data.account.id,
        parentId: parent?.id,
        driveId: parent?.driveId,
      });
      this.folders.set(response.folders);
    } catch {
      this.loadError.set('OneDrive-Ordner konnten nicht geladen werden. Bitte Zugriff und Verbindung prüfen.');
    } finally {
      this.loading.set(false);
    }
  }
}
