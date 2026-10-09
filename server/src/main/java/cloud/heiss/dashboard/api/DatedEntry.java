package cloud.heiss.dashboard.api;

import cloud.heiss.dashboard.api.model.CalendarEntry;
import java.time.LocalDate;

/** Associates a calendar response entry with the date boundaries used for all-day grouping. */
record DatedEntry(CalendarEntry entry, LocalDate start, LocalDate end) {
}