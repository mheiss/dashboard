package cloud.heiss.dashboard.api;

import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.entity.MicrosoftAccount;
import cloud.heiss.dashboard.persistence.entity.Photo;
import cloud.heiss.dashboard.persistence.entity.PhotoMembership;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Verifies cached photo paging, anniversary grouping, query bounds, and invalid cursor handling. */
@QuarkusTest
class DashboardReadTest {

    @Inject
    DashboardStore store;
    @Inject
    DashboardReadService reads;

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
}