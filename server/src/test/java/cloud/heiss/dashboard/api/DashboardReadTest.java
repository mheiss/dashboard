package cloud.heiss.dashboard.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.entity.MicrosoftAccount;
import cloud.heiss.dashboard.persistence.entity.Photo;
import cloud.heiss.dashboard.persistence.entity.PhotoMembership;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;

/** Verifies cached photo paging, anniversary grouping, query bounds, and invalid cursor handling. */
@QuarkusTest
class DashboardReadTest {

    @Inject
    DashboardStore store;
    @Inject
    DashboardReadService reads;
    @Inject
    DashboardConfig config;

    @Test
    void equalTimestampsDoNotSkipPhotos() {
        UUID account = UUID.randomUUID();
        UUID source = UUID.randomUUID();
        Instant timestamp = Instant.parse("2020-10-08T10:00:00Z");
        var owner = new MicrosoftAccount();
        owner.id = account;
        owner.microsoftId = account.toString();
        owner.name = "Fixture";
        owner.tokenCache = "Fixture cache";
        store.persist(owner);
        var folder = new DashboardSource();
        folder.id = source;
        folder.accountId = account;
        folder.kind = "PHOTOS";
        folder.upstreamId = source.toString();
        folder.name = "Photos";
        folder.selected = true;
        store.persist(folder);
        try {
            for (int index = 0; index < 3; index++) {
                UUID photo = UUID.randomUUID();
                var entity = new Photo();
                entity.id = photo;
                entity.driveId = source.toString();
                entity.upstreamId = photo.toString();
                entity.name = "Photo";
                entity.takenAt = timestamp;
                entity.takenDay = 8;
                entity.takenMonth = 10;
                entity.takenYear = 2020;
                entity.modifiedAt = timestamp;
                entity.version = "v1";
                entity.width = 1200;
                entity.height = 1800;
                store.persist(entity);
                var membership = new PhotoMembership();
                membership.photoId = photo;
                membership.sourceId = source;
                store.persist(membership);
                assertEquals("Photo", store.photo(photo).name());
                assertEquals(account, store.photoAccount(photo).id());
            }
            var reference = java.time.LocalDate.now().withMonth(10).withDayOfMonth(8);
            assertEquals(3, reads.moments(reference.toString()).getFirst().images().size());
            var first = reads.images(2, null);
            var second = reads.images(2, first.endCursor());
            assertEquals(2, first.items().size());
            assertEquals(1, second.items().size());
            var image = first.items().getFirst();
            assertEquals(1200, image.width());
            assertEquals(1800, image.height());
            assertTrue(image.thumbnailUrl().startsWith("/api/media/images/" + image.id() + "/thumbnail?"));
            assertTrue(image.originalUrl().startsWith("/api/media/images/" + image.id() + "/original?"));
            assertTrue(first.hasNextPage());
            assertFalse(second.hasNextPage());
            assertFalse(first.items().stream().anyMatch(photo -> photo.id().equals(second.items().getFirst().id())));
            store.inTransaction(DashboardStore::advanceRevision);
            assertThrows(BadRequestException.class, () -> reads.images(2, first.endCursor()));
        } finally {
            store.update("delete from MicrosoftAccount where id=?1", account);
            store.update("delete from Photo p where not exists (select 1 from PhotoMembership m where m.photoId=p.id)");
        }
    }

    @Test
    void readBoundsAndInvalidCursorsAreRejected() {
        assertThrows(BadRequestException.class, () -> reads.images(101, null));
        assertThrows(BadRequestException.class, () -> reads.images(0, null));
        assertThrows(BadRequestException.class, () -> reads.decodeCursor("not-a-cursor"));
        assertThrows(BadRequestException.class, () -> reads.agenda(null, 31));
    }

    @Test
    void memoryQueriesGroupOnePhotoPerPastYearAndHonorFilters() {
        UUID accountId = UUID.randomUUID();
        UUID sourceId = UUID.randomUUID();
        int currentYear = LocalDate.now(ZoneId.of(config.zone())).getYear();
        var years = new ArrayList<Integer>();
        for (int index = 0; index < 101; index++) {
            years.add(currentYear - 1);
        }
        years.addAll(List.of(currentYear - 2, currentYear - 3, currentYear - 4));
        var account = new MicrosoftAccount();
        account.id = accountId;
        account.microsoftId = accountId.toString();
        account.name = "Memory fixture";
        account.tokenCache = "Fixture cache";
        store.persist(account);
        var source = new DashboardSource();
        source.id = sourceId;
        source.accountId = accountId;
        source.kind = "PHOTOS";
        source.upstreamId = sourceId.toString();
        source.name = "Memory photos";
        source.selected = true;
        store.persist(source);
        try {
            store.inTransaction(manager -> {
                for (int index = 0; index < years.size(); index++) {
                    UUID photoId = UUID.randomUUID();
                    Instant taken = LocalDate.of(years.get(index), 10, 8).atStartOfDay().toInstant(ZoneOffset.UTC)
                            .plusSeconds(index);
                    var photo = new Photo();
                    photo.id = photoId;
                    photo.driveId = sourceId.toString();
                    photo.upstreamId = photoId.toString();
                    photo.name = "Memory " + index;
                    photo.takenAt = taken;
                    photo.takenDay = 8;
                    photo.takenMonth = 10;
                    photo.takenYear = years.get(index);
                    photo.modifiedAt = taken;
                    photo.version = "v1";
                    photo.width = 1200;
                    photo.height = 800;
                    manager.persist(photo);
                    var membership = new PhotoMembership();
                    membership.photoId = photoId;
                    membership.sourceId = sourceId;
                    manager.persist(membership);
                }
                return null;
            });

            var day = reads.memoryDay(10, 8);
            assertEquals(4, day.images().size());
            assertEquals(List.of(currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4),
                    day.images().stream().map(image -> Integer.parseInt(image.takenAt().substring(0, 4))).toList());
            var date = reads.memoryDates(10, null).stream().filter(item -> item.day() == 8).findFirst().orElseThrow();
            assertEquals(4, date.photoYearCount());
            var filteredDate = reads.memoryDates(10, currentYear - 2).getFirst();
            assertEquals(8, filteredDate.day());
            assertEquals(1, filteredDate.photoYearCount());
            assertTrue(reads.memoryYears().contains(currentYear - 4));
            assertThrows(BadRequestException.class, () -> reads.memoryDates(13, null));
            assertThrows(BadRequestException.class, () -> reads.memoryDates(10, currentYear));
            assertThrows(BadRequestException.class, () -> reads.memoryDay(2, 30));
        } finally {
            store.update("delete from MicrosoftAccount where id=?1", accountId);
            store.update("delete from Photo p where not exists (select 1 from PhotoMembership m where m.photoId=p.id)");
        }
    }
}