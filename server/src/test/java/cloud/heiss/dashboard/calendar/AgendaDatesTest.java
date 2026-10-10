package cloud.heiss.dashboard.calendar;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

/** Verifies exclusive all-day end dates and household date grouping across daylight-saving changes. */
class AgendaDatesTest {

    @Test
    void allDayEndIsExclusive() {
        var start = LocalDate.of(2026, 10, 8);
        var end = start.plusDays(2);
        assertFalse(AgendaDates.allDayIncludes(start.minusDays(1), start, end));
        assertTrue(AgendaDates.allDayIncludes(start, start, end));
        assertTrue(AgendaDates.allDayIncludes(start.plusDays(1), start, end));
        assertFalse(AgendaDates.allDayIncludes(end, start, end));
    }

    @Test
    void timedEventsUseHouseholdDateAcrossDst() {
        var zone = ZoneId.of("Europe/Vienna");
        assertTrue(AgendaDates.timedStartsOn(LocalDate.of(2026, 3, 30), Instant.parse("2026-03-29T22:30:00Z"), zone));
        assertFalse(AgendaDates.timedStartsOn(LocalDate.of(2026, 3, 29), Instant.parse("2026-03-29T22:30:00Z"), zone));
    }
}