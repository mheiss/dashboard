package cloud.heiss.dashboard.photos;

import cloud.heiss.dashboard.persistence.model.PhotoSnapshot;
import cloud.heiss.dashboard.microsoft.GraphFailure;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.microsoft.GraphClient;
import cloud.heiss.dashboard.persistence.entity.Photo;

import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import io.quarkus.scheduler.Scheduled;
import java.io.InputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileTime;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

/** Maintains versioned disk media caches with thumbnail prefetching, eviction, and active-reader protection. */
@ApplicationScoped
public class MediaService {

    @Inject
    DashboardConfig config;
    @Inject
    DashboardStore store;
    @Inject
    GraphClient graph;
    private final Object[] stripes = java.util.stream.IntStream.range(0, 64).mapToObj(index -> new Object()).toArray();
    private final ExecutorService thumbnails = Executors.newSingleThreadExecutor();
    private final java.util.Set<UUID> prefetching = ConcurrentHashMap.newKeySet();
    private final Object cacheLock = new Object();
    private final java.util.Map<Path, Integer> readers = new java.util.HashMap<>();

    public Path file(PhotoSnapshot photo, boolean original) {
        return file(photo, original, false);
    }

    public InputStream open(PhotoSnapshot photo, boolean original) {
        Path path = file(photo, original, true);
        try {
            return new PinnedInputStream(Files.newInputStream(path), () -> release(path));
        } catch (IOException exception) {
            release(path);
            throw new IllegalStateException("Image cache unavailable", exception);
        }
    }

    private Path file(PhotoSnapshot photo, boolean original, boolean pin) {
        synchronized (stripes[Math.floorMod(photo.id().hashCode(), stripes.length)]) {
            try {
                Path directory = Path.of(config.mediaDirectory()).toAbsolutePath().normalize();
                Files.createDirectories(directory);
                String hash = versionHash(photo.version());
                Path path = directory.resolve(photo.id() + "-" + hash + (original ? "-original" : "-thumbnail"));
                synchronized (cacheLock) {
                    if (Files.exists(path)) {
                        Files.setLastModifiedTime(path, FileTime.from(Instant.now()));
                        if (pin) {
                            readers.merge(path, 1, Integer::sum);
                        }
                        return path;
                    }
                }
                var account = store.photoAccount(photo.id());
                String endpoint = "drives/" + GraphClient.segment(photo.driveId()) + "/items/"
                        + GraphClient.segment(photo.upstreamId()) + (original ? "/content" : "/thumbnails/0/large/content");
                Path temporary = Files.createTempFile(directory, "download-", ".part");
                try {
                    try (var input = graph.media(account.id(), endpoint); var output = Files.newOutputStream(temporary)) {
                        byte[] buffer = new byte[65536];
                        long written = 0;
                        int count;
                        long limit = original ? Math.min(config.originalCacheBytes(), 512L * 1024 * 1024) : 20L * 1024 * 1024;
                        while ((count = input.read(buffer)) >= 0) {
                            written += count;
                            if (written > limit) {
                                throw new IOException("Image exceeds media limit");
                            }
                            output.write(buffer, 0, count);
                        }
                    }
                    synchronized (cacheLock) {
                        try {
                            Files.move(temporary, path, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
                        } catch (java.nio.file.AtomicMoveNotSupportedException exception) {
                            Files.move(temporary, path, StandardCopyOption.REPLACE_EXISTING);
                        }
                        evict(path);
                        if (pin) {
                            readers.merge(path, 1, Integer::sum);
                        }
                    }
                } finally {
                    Files.deleteIfExists(temporary);
                }
                return path;
            } catch (RuntimeException exception) {
                throw exception;
            } catch (Exception exception) {
                throw new IllegalStateException("Image cache unavailable", exception);
            }
        }
    }

    public void prefetch(UUID account) {
        if (!prefetching.add(account)) {
            return;
        }
        thumbnails.submit(() -> {
            try {
                prune();
                UUID after = null;
                while (!Thread.currentThread().isInterrupted()) {
                    var photos = store
                            .page("select distinct p from Photo p join PhotoMembership m on m.photoId=p.id "
                                    + "join DashboardSource s on s.id=m.sourceId where s.selected=true and s.accountId=?1 "
                                    + (after == null ? "" : "and p.id>?2 ") + "order by p.id", Photo.class, 100,
                                    after == null ? new Object[] { account } : new Object[] { account, after })
                            .stream().map(DashboardStore::photo).toList();
                    if (photos.isEmpty()) {
                        break;
                    }
                    for (var photo : photos) {
                        try {
                            file(photo, false);
                        } catch (RuntimeException exception) {
                            if (exception instanceof GraphFailure failure && failure.status == 429) {
                                return;
                            }
                        }
                    }
                    after = photos.getLast().id();
                }
            } finally {
                prefetching.remove(account);
            }
        });
    }

    private void release(Path path) {
        synchronized (cacheLock) {
            readers.computeIfPresent(path, (key, count) -> count == 1 ? null : count - 1);
            try {
                evict(null);
            } catch (IOException ignored) {
            }
        }
    }

    @Scheduled(every = "1h", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    public void prune() {
        var visible = store
                .list("from Photo p where exists (select 1 from PhotoMembership m "
                        + "join DashboardSource s on s.id=m.sourceId where m.photoId=p.id and s.selected=true)", Photo.class)
                .stream().map(DashboardStore::photo).toList();
        var keep = new java.util.HashSet<String>();
        for (var photo : visible) {
            String prefix = photo.id() + "-" + versionHash(photo.version());
            keep.add(prefix + "-original");
            keep.add(prefix + "-thumbnail");
        }
        Path directory = Path.of(config.mediaDirectory()).toAbsolutePath().normalize();
        if (!Files.isDirectory(directory)) {
            return;
        }
        synchronized (cacheLock) {
            try (var stream = Files.list(directory)) {
                for (var path : stream.toList()) {
                    String name = path.getFileName().toString();
                    boolean stale = (name.endsWith("-original") || name.endsWith("-thumbnail")) && !keep.contains(name);
                    boolean abandoned = name.endsWith(".part") && lastUsed(path) < System.currentTimeMillis() - 86400000L;
                    if ((stale || abandoned) && !readers.containsKey(path)) {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException ignored) {
                        }
                    }
                }
                evict(null);
            } catch (IOException exception) {
                throw new IllegalStateException("Image cache cleanup unavailable", exception);
            }
        }
    }

    private void evict(Path keep) throws IOException {
        Path directory = Path.of(config.mediaDirectory()).toAbsolutePath().normalize();
        for (String suffix : java.util.List.of("-original", "-thumbnail")) {
            try (var stream = Files.list(directory)) {
                var files = stream.filter(path -> path.getFileName().toString().endsWith(suffix))
                        .sorted(Comparator.comparingLong(MediaService::lastUsed)).toList();
                long bytes = 0;
                for (var path : files) {
                    bytes += Files.size(path);
                }
                for (var path : files) {
                    long limit = suffix.equals("-original") ? config.originalCacheBytes() : config.thumbnailCacheBytes();
                    if (bytes <= limit) {
                        break;
                    }
                    if (!path.equals(keep) && !readers.containsKey(path)) {
                        try {
                            long size = Files.size(path);
                            if (Files.deleteIfExists(path)) {
                                bytes -= size;
                            }
                        } catch (IOException ignored) {
                        }
                    }
                }
            }
        }
    }

    private static String versionHash(String version) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-256").digest(version.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static long lastUsed(Path path) {
        try {
            return Files.getLastModifiedTime(path).toMillis();
        } catch (IOException exception) {
            return 0;
        }
    }

    @PreDestroy
    void stop() {
        thumbnails.shutdownNow();
    }
}