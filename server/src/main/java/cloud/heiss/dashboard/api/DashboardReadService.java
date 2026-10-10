package cloud.heiss.dashboard.api;

import cloud.heiss.dashboard.api.model.CalendarInfo;
import cloud.heiss.dashboard.api.model.AccountStatus;
import cloud.heiss.dashboard.api.model.Agenda;
import cloud.heiss.dashboard.api.model.AgendaDay;
import cloud.heiss.dashboard.api.model.CalendarEntry;
import cloud.heiss.dashboard.api.model.Image;
import cloud.heiss.dashboard.api.model.ImagePage;
import cloud.heiss.dashboard.api.model.Moment;
import cloud.heiss.dashboard.calendar.AgendaDates;
import cloud.heiss.dashboard.persistence.entity.CalendarEvent;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.model.SourceSnapshot;
import cloud.heiss.dashboard.persistence.model.PhotoSnapshot;
import cloud.heiss.dashboard.persistence.entity.Photo;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/** Builds agenda, image, moment, and sync-status responses from persisted data without calling Microsoft. */
@ApplicationScoped
public class DashboardReadService {

    private static final String VISIBLE_PHOTOS = " from Photo p where exists (select 1 from PhotoMembership m "
            + "join DashboardSource s on s.id=m.sourceId where m.photoId=p.id and s.selected=true) ";
    @Inject
    DashboardStore store;
    @Inject
    DashboardConfig config;
    @Inject
    ObjectMapper mapper;

    public Agenda agenda(String startDate, int days) {
        ZoneId zone = ZoneId.of(config.zone());
        LocalDate today = LocalDate.now(zone);
        LocalDate start = date(startDate, today);
        if (days < 1 || days > 30 || start.isBefore(today.minusDays(1)) || start.plusDays(days).isAfter(today.plusDays(30))) {
            throw new BadRequestException("Agenda range must be within the cached thirty-day horizon");
        }
        var sources = store.sources().stream().filter(source -> source.selected() && source.kind().equals("CALENDAR"))
                .collect(java.util.stream.Collectors.toMap(SourceSnapshot::id, source -> source));
        var entries = store
                .list("select e from CalendarEvent e join DashboardSource s on s.id=e.sourceId "
                        + "where s.selected=true and e.endsAt>?1 and e.startsAt<?2 order by e.startsAt,e.id", CalendarEvent.class,
                        start.atStartOfDay(zone).toInstant(), start.plusDays(days).atStartOfDay(zone).toInstant())
                .stream().map(entity -> {
                    var entry = new CalendarEntry(entity.id.toString(), entity.subject, entity.startsAt.toString(),
                            entity.endsAt.toString(), entity.allDay, calendar(sources.get(entity.sourceId)));
                    return new DatedEntry(entry, entity.startDate, entity.endDate);
                }).toList();
        long revision = store.revision();
        var agendaDays = new ArrayList<AgendaDay>();
        for (int offset = 0; offset < days; offset++) {
            LocalDate day = start.plusDays(offset);
            var allDay = new ArrayList<CalendarEntry>();
            var events = new ArrayList<CalendarEntry>();
            for (var dated : entries) {
                if (dated.entry().isAllDay() && AgendaDates.allDayIncludes(day, dated.start(), dated.end())) {
                    allDay.add(dated.entry());
                } else if (!dated.entry().isAllDay()
                        && AgendaDates.timedStartsOn(day, Instant.parse(dated.entry().startsAt()), zone)) {
                    events.add(dated.entry());
                }
            }
            allDay.sort(Comparator.comparing(CalendarEntry::subject));
            agendaDays.add(new AgendaDay(day.toString(), allDay, events));
        }
        return new Agenda(revision, config.zone(), agendaDays);
    }

    public List<CalendarInfo> calendars() {
        return store.sources().stream().filter(source -> source.selected() && source.kind().equals("CALENDAR"))
                .map(DashboardReadService::calendar).toList();
    }

    private static CalendarInfo calendar(SourceSnapshot source) {
        if (source == null) {
            throw new IllegalStateException("Calendar source changed while reading agenda; retry");
        }
        return new CalendarInfo(source.id().toString(), source.name(), source.theme());
    }

    public ImagePage images(int first, String after) {
        if (first < 1 || first > 100) {
            throw new BadRequestException("Image page size must be between 1 and 100");
        }
        long revision = store.revision();
        PhotoCursor cursor = after == null ? null : decodeCursor(after);
        if (cursor != null && cursor.revision() != revision) {
            throw new CursorExpired();
        }
        String order = " order by coalesce(p.takenAt,p.modifiedAt) desc,p.id desc";
        List<PhotoSnapshot> photos;
        if (cursor == null) {
            photos = store.page("select p" + VISIBLE_PHOTOS + order, Photo.class, first + 1).stream().map(DashboardStore::photo)
                    .toList();
        } else {
            Instant timestamp = Instant.parse(cursor.timestamp());
            photos = store
                    .page("select p" + VISIBLE_PHOTOS
                            + "and (coalesce(p.takenAt,p.modifiedAt)<?1 or (coalesce(p.takenAt,p.modifiedAt)=?1 and p.id<?2))"
                            + order, Photo.class, first + 1, timestamp, UUID.fromString(cursor.id()))
                    .stream().map(DashboardStore::photo).toList();
        }
        int totalCount = Math.toIntExact(store.list("select count(p)" + VISIBLE_PHOTOS, Long.class).getFirst());
        var page = photos.subList(0, Math.min(first, photos.size()));
        String endCursor = null;
        if (!page.isEmpty()) {
            var last = page.getLast();
            endCursor = encodeCursor(new PhotoCursor((last.takenAt() == null ? last.modifiedAt() : last.takenAt()).toString(),
                    last.id().toString(), revision));
        }
        return new ImagePage(revision, totalCount, endCursor, photos.size() > first,
                page.stream().map(DashboardReadService::image).toList());
    }

    public Image image(String id) {
        try {
            return image(store.photo(UUID.fromString(id)));
        } catch (IllegalArgumentException exception) {
            throw new BadRequestException("Invalid image id");
        }
    }

    public static Image image(PhotoSnapshot photo) {
        String version = Integer.toUnsignedString(photo.version().hashCode());
        return new Image(photo.id().toString(), photo.name(), photo.takenAt() == null ? null : photo.takenAt().toString(),
                photo.modifiedAt().toString(), "/media/images/" + photo.id() + "/thumbnail?v=" + version,
                "/media/images/" + photo.id() + "/original?v=" + version);
    }

    public List<Moment> moments(String referenceDate) {
        LocalDate today = LocalDate.now(ZoneId.of(config.zone()));
        LocalDate reference = date(referenceDate, today);
        if (Math.abs(java.time.temporal.ChronoUnit.DAYS.between(today, reference)) > 366) {
            throw new BadRequestException("Moment date outside supported range");
        }
        var result = new ArrayList<Moment>();
        for (int daysBack = 0; daysBack < 10 && result.size() < 4; daysBack++) {
            LocalDate day = reference.minusDays(daysBack);
            var photos = store
                    .page("select p" + VISIBLE_PHOTOS
                            + "and p.takenMonth=?1 and p.takenDay=?2 and p.takenYear<>?3 order by p.takenAt desc,p.id desc",
                            Photo.class, 100, day.getMonthValue(), day.getDayOfMonth(), reference.getYear())
                    .stream().map(DashboardStore::photo).toList();
            if (!photos.isEmpty()) {
                result.add(new Moment(day.toString(), photos.stream().map(DashboardReadService::image).toList()));
            }
        }
        return result;
    }

    public List<AccountStatus> status() {
        return store.accounts().stream().map(account -> new AccountStatus(account.id().toString(), account.name(),
                account.status(), account.error(), account.lastSync() == null ? null : account.lastSync().toString())).toList();
    }

    private LocalDate date(String value, LocalDate fallback) {
        try {
            return value == null ? fallback : LocalDate.parse(value);
        } catch (RuntimeException exception) {
            throw new BadRequestException("Invalid date; expected YYYY-MM-DD");
        }
    }

    public String encodeCursor(PhotoCursor cursor) {
        try {
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mapper.writeValueAsBytes(cursor));
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot encode image cursor", exception);
        }
    }

    public PhotoCursor decodeCursor(String cursor) {
        try {
            if (cursor.length() > 512) {
                throw new IllegalArgumentException();
            }
            var result = mapper.readValue(Base64.getUrlDecoder().decode(cursor), PhotoCursor.class);
            Instant.parse(result.timestamp());
            UUID.fromString(result.id());
            return result;
        } catch (Exception exception) {
            throw new BadRequestException("Invalid image cursor");
        }
    }
}