package cloud.heiss.dashboard.api.model;

import java.util.List;

/** Cached agenda grouped by household date, with its dataset revision and timezone. */
public record Agenda(long revision, String timezone, List<AgendaDay> days) {

    public Agenda {
        days = List.copyOf(days);
    }
}