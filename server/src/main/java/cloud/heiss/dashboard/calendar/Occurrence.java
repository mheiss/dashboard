package cloud.heiss.dashboard.calendar;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** Calendar occurrence value used to compare remote events with the cached snapshot. */
public record Occurrence(UUID id, String upstreamId, String subject, Instant start, Instant end, boolean allDay,
        LocalDate startDate, LocalDate endDate) {
}