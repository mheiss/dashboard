package cloud.heiss.dashboard.api.model;

import java.util.List;

/** One household date's calendar entries, separated into all-day and timed events. */
public record AgendaDay(String date, List<CalendarEntry> allDay, List<CalendarEntry> events) {

    public AgendaDay {
        allDay = List.copyOf(allDay);
        events = List.copyOf(events);
    }
}