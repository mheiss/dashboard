package cloud.heiss.dashboard.protect;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.databind.ObjectMapper;

import cloud.heiss.dashboard.config.DashboardConfig;
import jakarta.ws.rs.NotFoundException;

/**
 * Verifies snapshot persistence, grouping, retention, and crash-artifact cleanup in an isolated media directory.
 */
class MotionSnapshotsTest {

    @TempDir
    Path media;

    /**
     * Creates a fresh store backed by the test's temporary media directory.
     *
     * @return a store configured with a JSON mapper and mocked media settings
     */
    private MotionSnapshots store() {
        var store = new MotionSnapshots();
        store.config = mock(DashboardConfig.class);
        when(store.config.mediaDirectory()).thenReturn(media.toString());
        store.mapper = new ObjectMapper();
        return store;
    }

    /**
     * Confirms that a new store instance restores groups, smart-motion previews, media URLs, and image bytes from disk.
     */
    @Test
    void persistsImagesAndGroupsAcrossServiceRestarts() {
        var store = store();
        var first = store.save("front", "motion", 100_000, new byte[] { 1, 2 });
        var smart = store.save("back", "smart", 110_000, new byte[] { 3, 4 });
        store.save("front", "motion", 120_000, new byte[] { 5, 6 });
        var next = store.save("back", "motion", 130_000, new byte[] { 7, 8 });
        var restored = store();
        assertEquals(2, restored.groups().size());
        assertEquals(next.id(), restored.groups().getFirst().id());
        var group = restored.groups().getLast();
        assertEquals(first.id(), group.id());
        assertEquals(3, group.snapshots().size());
        assertEquals(smart.id(), group.preview().id());
        assertEquals("/api/media/protect/" + smart.id(), group.preview().url());
        assertArrayEquals(new byte[] { 3, 4 }, restored.image(smart.id()));
        assertTrue(Files.isRegularFile(media.resolve("protect").resolve(smart.id() + ".jpg")));
    }

    /**
     * Ensures the oldest group is deleted after the retention limit without removing the adjacent photo cache.
     *
     * @throws Exception if the photo-cache fixture cannot be written
     */
    @Test
    void retainsTwentyGroupsWithoutTouchingPhotoCache() throws Exception {
        var store = store();
        Path photo = media.resolve("cached-original");
        Files.write(photo, new byte[] { 1 });
        var first = store.save("front", "motion", 100_000, new byte[] { 1 });
        for (int index = 1; index <= 20; index++) {
            store.save("front", "motion", 100_000 + index * 30_000L, new byte[] { 2 });
        }
        assertEquals(20, store.groups().size());
        assertFalse(Files.exists(media.resolve("protect").resolve(first.id() + ".jpg")));
        assertFalse(Files.exists(media.resolve("protect").resolve(first.id() + ".json")));
        assertTrue(Files.isRegularFile(photo));
        assertThrows(NotFoundException.class, () -> store.image(first.id()));
    }

    /**
     * Checks removal of interrupted-write temporary files and UUID-named orphan JPEGs while preserving other media.
     *
     * @throws Exception if crash-artifact fixtures cannot be created
     */
    @Test
    void cleansUnpublishedFilesAfterRestartWithoutDeletingOtherMedia() throws Exception {
        var store = store();
        Path directory = media.resolve("protect");
        Files.createDirectories(directory);
        Path orphan = directory.resolve(UUID.randomUUID() + ".jpg");
        Path partial = directory.resolve("snapshot-interrupted.part");
        Path other = directory.resolve("other.jpg");
        Files.write(orphan, new byte[] { 1 });
        Files.write(partial, new byte[] { 2 });
        Files.write(other, new byte[] { 3 });
        store.prune();
        assertFalse(Files.exists(orphan));
        assertFalse(Files.exists(partial));
        assertTrue(Files.exists(other));
    }

    /**
     * Verifies corrupt metadata is skipped and empty images, unsupported categories, and missing images are rejected.
     *
     * @throws Exception if the corrupt metadata fixture cannot be created
     */
    @Test
    void ignoresCorruptMetadataAndRejectsInvalidImages() throws Exception {
        var store = store();
        Files.createDirectories(media.resolve("protect"));
        Files.writeString(media.resolve("protect/broken.json"), "not JSON");
        assertTrue(store.groups().isEmpty());
        assertThrows(IllegalArgumentException.class, () -> store.save("front", "motion", 100_000, new byte[0]));
        assertThrows(IllegalArgumentException.class, () -> store.save("front", "unknown", 100_000, new byte[] { 1 }));
        assertThrows(NotFoundException.class, () -> store.image(UUID.randomUUID()));
    }
}