package cloud.heiss.dashboard.api;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import cloud.heiss.dashboard.api.model.AccountStatus;
import cloud.heiss.dashboard.api.model.Agenda;
import cloud.heiss.dashboard.api.model.AgendaDay;
import cloud.heiss.dashboard.api.model.CalendarEntry;
import cloud.heiss.dashboard.api.model.CalendarInfo;
import cloud.heiss.dashboard.api.model.Image;
import cloud.heiss.dashboard.api.model.ImagePage;
import cloud.heiss.dashboard.api.model.MemoryDate;
import cloud.heiss.dashboard.api.model.MemoryDay;
import cloud.heiss.dashboard.api.model.Moment;
import cloud.heiss.dashboard.calendar.AgendaDates;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.entity.CalendarEvent;
import cloud.heiss.dashboard.persistence.entity.Photo;
import cloud.heiss.dashboard.persistence.model.PhotoSnapshot;
import cloud.heiss.dashboard.persistence.model.SourceSnapshot;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;

/**
 * Builds agenda, image, moment, and sync-status responses from persisted data
 * without calling Microsoft.
 */
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
        return imagePage(first, after, null, null);
    }

    public ImagePage memoryImages(int month, int day, int first, String after) {
        validateMemoryDay(month, day);
        return imagePage(first, after, month, day);
    }

    private ImagePage imagePage(int first, String after, Integer month, Integer day) {
        if (first < 1 || first > 100) {
            throw new BadRequestException("Image page size must be between 1 and 100");
        }
        long revision = store.revision();
        PhotoCursor cursor = after == null ? null : decodeCursor(after);
        if (cursor != null && cursor.revision() != revision) {
            throw new CursorExpired();
        }
        var filters = new StringBuilder(VISIBLE_PHOTOS);
        var parameters = new ArrayList<Object>();
        if (month != null) {
            filters.append("and p.takenMonth=?1 and p.takenDay=?2 and p.takenYear>=1900 and p.takenYear<?3 ");
            parameters.add(month);
            parameters.add(day);
            parameters.add(LocalDate.now(ZoneId.of(config.zone())).getYear());
        }
        int totalCount = Math.toIntExact(store.list("select count(p)" + filters, Long.class, parameters.toArray()).getFirst());
        if (cursor != null) {
            int timestampParameter = parameters.size() + 1;
            int idParameter = timestampParameter + 1;
            filters.append("and (coalesce(p.takenAt,p.modifiedAt)<?").append(timestampParameter)
                    .append(" or (coalesce(p.takenAt,p.modifiedAt)=?").append(timestampParameter).append(" and p.id<?")
                    .append(idParameter).append("))");
            parameters.add(Instant.parse(cursor.timestamp()));
            parameters.add(UUID.fromString(cursor.id()));
        }
        var photos = store.page("select p" + filters + " order by coalesce(p.takenAt,p.modifiedAt) desc,p.id desc", Photo.class,
                first + 1, parameters.toArray()).stream().map(DashboardStore::photo).toList();
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
                photo.modifiedAt().toString(), "/api/media/images/" + photo.id() + "/thumbnail?v=" + version,
                "/api/media/images/" + photo.id() + "/original?v=" + version, photo.width(), photo.height());
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

    public List<MemoryDate> memoryDates(Integer month, Integer photoYear) {
        int currentYear = LocalDate.now(ZoneId.of(config.zone())).getYear();
        validateMemoryFilters(month, photoYear, currentYear);
        var query = new StringBuilder("select p.takenMonth,p.takenDay,count(distinct p.takenYear),count(p)")
                .append(VISIBLE_PHOTOS).append("and p.takenYear>=1900 and p.takenYear<?1");
        var parameters = new ArrayList<Object>();
        parameters.add(currentYear);
        if (month != null) {
            query.append(" and p.takenMonth=?").append(parameters.size() + 1);
            parameters.add(month);
        }
        if (photoYear != null) {
            query.append(" and p.takenYear=?").append(parameters.size() + 1);
            parameters.add(photoYear);
        }
        query.append(" group by p.takenMonth,p.takenDay order by p.takenMonth desc,p.takenDay desc");
        return store.list(query.toString(), Object[].class, parameters.toArray()).stream()
                .map(row -> new MemoryDate(((Number) row[0]).intValue(), ((Number) row[1]).intValue(),
                        ((Number) row[2]).intValue(), Math.toIntExact(((Number) row[3]).longValue())))
                .toList();
    }

    public List<Integer> memoryYears() {
        int currentYear = LocalDate.now(ZoneId.of(config.zone())).getYear();
        return store.list("select distinct p.takenYear" + VISIBLE_PHOTOS
                + "and p.takenYear>=1900 and p.takenYear<?1 order by p.takenYear desc", Integer.class, currentYear);
    }

    public MemoryDay memoryDay(int month, int day) {
        validateMemoryDay(month, day);
        int currentYear = LocalDate.now(ZoneId.of(config.zone())).getYear();
        var photoYears = store.list("select distinct p.takenYear" + VISIBLE_PHOTOS
                + "and p.takenMonth=?1 and p.takenDay=?2 and p.takenYear>=1900 and p.takenYear<?3 " + "order by p.takenYear desc",
                Integer.class, month, day, currentYear);
        var images = new ArrayList<Image>();
        for (Integer photoYear : photoYears.stream().limit(4).toList()) {
            var photos = store.page("select p" + VISIBLE_PHOTOS + "and p.takenMonth=?1 and p.takenDay=?2 and p.takenYear=?3 "
                    + "order by coalesce(p.takenAt,p.modifiedAt) desc,p.id desc", Photo.class, 1, month, day, photoYear);
            if (!photos.isEmpty()) {
                images.add(image(DashboardStore.photo(photos.getFirst())));
            }
        }
        return images.isEmpty() ? null : new MemoryDay(month, day, images);
    }

    private static void validateMemoryFilters(Integer month, Integer photoYear, int currentYear) {
        if (month != null && (month < 1 || month > 12)) {
            throw new BadRequestException("Memory month must be between 1 and 12");
        }
        if (photoYear != null && (photoYear < 1900 || photoYear >= currentYear)) {
            throw new BadRequestException("Photo year must be a past year from 1900 onward");
        }
    }

    private static void validateMemoryDay(int month, int day) {
        if (month < 1 || month > 12 || day < 1 || day > YearMonth.of(2000, month).lengthOfMonth()) {
            throw new BadRequestException("Invalid memory month or day");
        }
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