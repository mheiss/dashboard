package cloud.heiss.dashboard.api.model;

import org.eclipse.microprofile.graphql.Name;

/** Calendar occurrence response containing its subject, time boundaries, and source calendar. */
public record CalendarEntry(String id, String subject, String startsAt, String endsAt, @Name("isAllDay") boolean isAllDay,
        CalendarInfo calendar) {
}