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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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
    void prefetchDownloadsThumbnailsConcurrently() throws Exception {
        var photos = java.util.stream.IntStream.rangeClosed(1, 4).mapToObj(index -> {
            var photo = new Photo();
            photo.id = new UUID(0, index);
            photo.driveId = "drive";
            photo.upstreamId = "photo-" + index;
            photo.name = "Photo.jpg";
            photo.modifiedAt = Instant.EPOCH;
            photo.version = "v1";
            return photo;
        }).toList();
        var finished = new CountDownLatch(1);
        var firstPage = new java.util.concurrent.atomic.AtomicBoolean(true);
        when(store.page(anyString(), eq(Photo.class), eq(100), any(Object[].class))).thenAnswer(invocation -> {
            if (firstPage.getAndSet(false)) {
                return photos;
            }
            finished.countDown();
            return List.of();
        });
        var started = new CountDownLatch(4);
        var release = new CountDownLatch(1);
        when(graph.media(any(), anyString())).thenAnswer(invocation -> {
            started.countDown();
            assertTrue(release.await(5, TimeUnit.SECONDS));
            return new ByteArrayInputStream(new byte[] { 1 });
        });
        try {
            media.prefetch(UUID.randomUUID());
            assertTrue(started.await(5, TimeUnit.SECONDS));
        } finally {
            release.countDown();
            assertTrue(finished.await(5, TimeUnit.SECONDS));
        }
        verify(store, never()).list(anyString(), eq(Photo.class));
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
    void cachedReadsDoNotRunEvictionWhenWithinBudget() throws Exception {
        var photo = photo("v1");
        media.file(photo, true);
        clearInvocations(media.config);
        try (var input = media.open(photo, true)) {
            assertArrayEquals(new byte[] { 1, 2, 3, 4, 5, 6 }, input.readAllBytes());
        }
        verify(media.config, never()).originalCacheBytes();
        verify(media.config, never()).thumbnailCacheBytes();
    }

    @Test
    void overBudgetCacheWaitsForScheduledCleanup() throws Exception {
        var first = photo("v1");
        var second = photo("v1");
        var visible = List.of(first, second).stream().map(snapshot -> {
            var photo = new Photo();
            photo.id = snapshot.id();
            photo.driveId = snapshot.driveId();
            photo.upstreamId = snapshot.upstreamId();
            photo.name = snapshot.name();
            photo.modifiedAt = snapshot.modifiedAt();
            photo.version = snapshot.version();
            return photo;
        }).toList();
        when(store.<Photo> list(anyString(), any())).thenReturn(visible);
        try (var firstInput = media.open(first, true); var secondInput = media.open(second, true)) {
            try (var files = Files.list(directory)) {
                assertTrue(files.count() == 2);
            }
        }
        try (var files = Files.list(directory)) {
            assertTrue(files.count() == 2);
        }
        media.prune();
        try (var files = Files.list(directory)) {
            assertTrue(files.count() == 1);
        }
    }

    @Test
    void evictionProtectsActiveReadersAndPruningRemovesUnreferencedCache() throws Exception {
        var first = photo("v1");
        Path firstPath = media.file(first, true);
        when(store.<Photo> list(anyString(), any())).thenReturn(List.of());
        try (var input = media.open(first, true)) {
            media.file(photo("v1"), true);
            media.prune();
            assertTrue(Files.exists(firstPath));
            assertArrayEquals(new byte[] { 1, 2, 3, 4, 5, 6 }, input.readAllBytes());
        }
        assertTrue(Files.exists(firstPath));
        media.prune();
        assertFalse(Files.exists(firstPath));
        try (var files = Files.list(directory)) {
            assertTrue(files.findAny().isEmpty());
        }
    }
}