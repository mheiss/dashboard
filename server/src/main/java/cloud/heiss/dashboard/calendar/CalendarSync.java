package cloud.heiss.dashboard.calendar;

import cloud.heiss.dashboard.persistence.entity.CalendarEvent;
import cloud.heiss.dashboard.sync.DashboardChanges;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.model.SourceSnapshot;
import cloud.heiss.dashboard.microsoft.GraphClient;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.LockModeType;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.UUID;

/** Reconciles selected Microsoft calendars into transactional cached snapshots and publishes changes. */
@ApplicationScoped
public class CalendarSync {

    @Inject
    GraphClient graph;
    @Inject
    DashboardStore store;
    @Inject
    DashboardConfig config;
    @Inject
    DashboardChanges changes;

    public void sync(SourceSnapshot source) {
        ZoneId zone = ZoneId.of(config.zone());
        LocalDate today = LocalDate.now(zone);
        String range = "?startDateTime=" + GraphClient.segment(today.minusDays(1).atStartOfDay(zone).toInstant().toString())
                + "&endDateTime=" + GraphClient.segment(today.plusDays(30).atStartOfDay(zone).toInstant().toString())
                + "&$top=100";
        var desired = graph
                .list(source.accountId(), "me/calendars/" + GraphClient.segment(source.upstreamId()) + "/calendarView" + range)
                .stream().filter(event -> !event.path("isCancelled").asBoolean(false))
                .map(event -> occurrence(source.id(), event, zone)).sorted(Comparator.comparing(event -> event.id().toString()))
                .toList();
        long revision = store.inTransaction(manager -> {
            var active = manager.find(DashboardSource.class, source.id(), LockModeType.PESSIMISTIC_WRITE);
            if (active == null || !active.selected) {
                return -1L;
            }
            var stored = manager.createQuery("from CalendarEvent where sourceId=?1", CalendarEvent.class)
                    .setParameter(1, source.id()).getResultList();
            var existing = stored.stream()
                    .map(event -> new Occurrence(event.id, event.upstreamId, event.subject, event.startsAt, event.endsAt,
                            event.allDay, event.startDate, event.endDate))
                    .sorted(Comparator.comparing(event -> event.id().toString())).toList();
            if (desired.equals(existing)) {
                return -1L;
            }
            var remaining = stored.stream().collect(java.util.stream.Collectors.toMap(event -> event.id, event -> event));
            for (var event : desired) {
                var entity = remaining.remove(event.id());
                boolean fresh = entity == null;
                if (fresh) {
                    entity = new CalendarEvent();
                    entity.id = event.id();
                    entity.sourceId = source.id();
                }
                entity.upstreamId = event.upstreamId();
                entity.subject = event.subject();
                entity.startsAt = event.start();
                entity.endsAt = event.end();
                entity.allDay = event.allDay();
                entity.startDate = event.startDate();
                entity.endDate = event.endDate();
                if (fresh) {
                    manager.persist(entity);
                }
            }
            remaining.values().forEach(manager::remove);
            return DashboardStore.advanceRevision(manager);
        });
        if (revision >= 0) {
            changes.publish("CALENDAR", revision);
        }
    }

    public static Occurrence occurrence(UUID sourceId, JsonNode event, ZoneId zone) {
        String upstream = event.path("id").asText();
        if (upstream.isBlank()) {
            throw new IllegalArgumentException("Calendar event id missing");
        }
        Instant start = graphInstant(event.path("start").path("dateTime").asText());
        Instant end = graphInstant(event.path("end").path("dateTime").asText());
        return new Occurrence(UUID.nameUUIDFromBytes((sourceId + ":" + upstream).getBytes(StandardCharsets.UTF_8)), upstream,
                event.path("subject").asText(""), start, end, event.path("isAllDay").asBoolean(),
                start.atZone(zone).toLocalDate(), end.atZone(zone).toLocalDate());
    }

    public static Instant graphInstant(String date) {
        try {
            return Instant.parse(date);
        } catch (java.time.format.DateTimeParseException exception) {
            return LocalDateTime.parse(date).toInstant(ZoneOffset.UTC);
        }
    }
}