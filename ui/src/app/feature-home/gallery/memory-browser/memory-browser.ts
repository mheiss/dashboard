import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideChevronLeft, LucideChevronRight, LucideX } from '@lucide/angular';
import { BackendMemoryDate } from '../../../backend/backend.model';
import { DialogOptions } from '../../../popup/popup.service';
import { ImageService } from '../image.service';

export interface MemoryBrowserData {
  month: number;
  day: number;
  mode: 'archive' | 'date';
  onSelect: (date: BackendMemoryDate) => void;
}

@Component({
  selector: 'app-memory-browser',
  templateUrl: './memory-browser.html',
  host: { class: 'block h-full w-full' },
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [LucideChevronLeft, LucideChevronRight, LucideX],
})
export class MemoryBrowserComponent {
  readonly data = (inject(DIALOG_DATA) as DialogOptions).data as MemoryBrowserData;
  readonly dialog = inject<DialogRef<unknown>>(DialogRef);
  readonly service = inject(ImageService);
  readonly monthNames = [
    'Januar',
    'Februar',
    'März',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember',
  ];
  readonly weekdays = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  readonly monthFilter = signal<number | null>(this.data.mode === 'date' ? this.data.month : null);
  readonly photoYearFilter = signal<number | null>(null);
  readonly calendarMonth = signal(this.data.month);
  readonly calendarYear = signal(new Date().getFullYear());
  readonly calendarCells = computed<(number | null)[]>(() => {
    const year = this.calendarYear();
    const month = this.calendarMonth();
    const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    return [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  });

  constructor() {
    void this.refreshArchive();
  }

  async refreshArchive(): Promise<void> {
    await this.service.loadArchiveDates(this.monthFilter(), this.photoYearFilter());
  }

  onMonthChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const month = value ? Number(value) : null;
    this.monthFilter.set(month);
    if (month !== null) this.calendarMonth.set(month);
    void this.refreshArchive();
  }

  onPhotoYearChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.photoYearFilter.set(value ? Number(value) : null);
    void this.refreshArchive();
  }

  shiftMonth(offset: number): void {
    const next = new Date(this.calendarYear(), this.calendarMonth() - 1 + offset, 1);
    this.calendarMonth.set(next.getMonth() + 1);
    this.calendarYear.set(next.getFullYear());
    this.monthFilter.set(next.getMonth() + 1);
    void this.refreshArchive();
  }

  hasMemory(day: number): boolean {
    return this.service.archiveDates().some((date) => date.month === this.calendarMonth() && date.day === day);
  }

  isSelected(day: number): boolean {
    return this.data.month === this.calendarMonth() && this.data.day === day;
  }

  photoYearCount(day: number): number {
    return this.service.archiveDates().find((date) => date.month === this.calendarMonth() && date.day === day)?.photoYearCount ?? 0;
  }

  dateLabel(date: BackendMemoryDate): string {
    return `${date.day}. ${this.monthNames[date.month - 1]}`;
  }

  selectCalendarDay(day: number): void {
    const date = this.service.archiveDates().find((item) => item.month === this.calendarMonth() && item.day === day);
    if (date) this.selectDate(date);
  }

  selectDate(date: BackendMemoryDate): void {
    this.data.onSelect(date);
    this.dialog.close();
  }

  close(): void {
    this.dialog.close();
  }
}
