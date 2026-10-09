package cloud.heiss.dashboard.photos;

import cloud.heiss.dashboard.persistence.model.AccountSnapshot;
import cloud.heiss.dashboard.persistence.model.PhotoSnapshot;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.microsoft.GraphClient;
import cloud.heiss.dashboard.persistence.entity.Photo;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Verifies versioned media reuse, active-reader eviction protection, and orphan cache cleanup. */
class MediaServiceTest {

    @TempDir
    Path directory;
    MediaService media;
    GraphClient graph;
    DashboardStore store;

    @BeforeEach
    void createCache() {
        media = new MediaService();
        media.config = mock(DashboardConfig.class);
        graph = media.graph = mock(GraphClient.class);
        store = media.store = mock(DashboardStore.class);
        when(media.config.mediaDirectory()).thenReturn(directory.toString());
        when(media.config.originalCacheBytes()).thenReturn(8L);
        when(media.config.thumbnailCacheBytes()).thenReturn(8L);
        var account = new AccountSnapshot(UUID.randomUUID(), "fixture", "Fixture", "cache", "CONNECTED", null, null);
        when(store.photoAccount(any())).thenReturn(account);
        when(graph.media(any(), anyString())).thenAnswer(invocation -> new ByteArrayInputStream(new byte[] { 1, 2, 3, 4, 5, 6 }));
    }

    @AfterEach
    void stopCache() {
        media.stop();
    }

    PhotoSnapshot photo(String version) {
        return new PhotoSnapshot(UUID.randomUUID(), "drive", "photo", "Photo.jpg", Instant.EPOCH, Instant.EPOCH, version);
    }

    @Test
    void cachesBytesAndDoesNotDownloadAnUnchangedVersionTwice() throws Exception {
        var photo = photo("v1");
        try (var first = media.open(photo, true)) {
            assertArrayEquals(new byte[] { 1, 2, 3, 4, 5, 6 }, first.readAllBytes());
        }
        try (var second = media.open(photo, true)) {
            assertArrayEquals(new byte[] { 1, 2, 3, 4, 5, 6 }, second.readAllBytes());
        }
        verify(graph, times(1)).media(any(), anyString());
    }

    @Test
    void evictionProtectsActiveReadersAndPruningRemovesUnreferencedCache() throws Exception {
        var first = photo("v1");
        Path firstPath = media.file(first, true);
        try (var input = media.open(first, true)) {
            media.file(photo("v1"), true);
            assertTrue(Files.exists(firstPath));
            assertArrayEquals(new byte[] { 1, 2, 3, 4, 5, 6 }, input.readAllBytes());
        }
        when(store.<Photo> list(anyString(), any())).thenReturn(List.of());
        media.prune();
        assertFalse(Files.exists(firstPath));
        try (var files = Files.list(directory)) {
            assertTrue(files.findAny().isEmpty());
        }
    }
}