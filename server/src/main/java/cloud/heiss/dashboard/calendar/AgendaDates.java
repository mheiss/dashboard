package cloud.heiss.dashboard.calendar;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Applies exclusive all-day end dates and household-timezone rules when grouping agenda events. */
public final class AgendaDates {

    private AgendaDates() {
    }

    public static boolean allDayIncludes(LocalDate day, LocalDate start, LocalDate exclusiveEnd) {
        return !day.isBefore(start) && day.isBefore(exclusiveEnd);
    }

    public static boolean timedStartsOn(LocalDate day, Instant start, ZoneId zone) {
        return start.atZone(zone).toLocalDate().equals(day);
    }
}