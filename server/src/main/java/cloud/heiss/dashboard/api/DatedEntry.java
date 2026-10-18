package cloud.heiss.dashboard.api;

import java.time.LocalDate;

import cloud.heiss.dashboard.api.model.CalendarEntry;

/** Associates a calendar response entry with the date boundaries used for all-day grouping. */
record DatedEntry(CalendarEntry entry, LocalDate start, LocalDate end) {
}