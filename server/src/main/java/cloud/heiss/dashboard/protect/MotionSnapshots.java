package cloud.heiss.dashboard.protect;

import cloud.heiss.dashboard.config.DashboardConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.NotFoundException;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.jboss.logging.Logger;

/**
 * Persists motion JPEGs and JSON metadata under the configured media directory's protect subdirectory.
 * Synchronized operations publish images before metadata, group events into 30-second windows, and retain 20 newest groups.
 */
@ApplicationScoped
public class MotionSnapshots {

    public static final int MAX_IMAGE_BYTES = 20 * 1024 * 1024;
    private static final int MAX_GROUPS = 20;
    private static final long GROUP_WINDOW = 30_000;
    private static final Logger LOG = Logger.getLogger(MotionSnapshots.class);

    @Inject
    DashboardConfig config;
    @Inject
    ObjectMapper mapper;

    /**
     * Publishes an image and its metadata through temporary-file moves, then applies group-based retention.
     * Partial files from a failed publication are removed before propagating the failure.
     *
     * @param camera the configured camera key
     * @param type the motion or smart trigger category
     * @param timestamp the event time in milliseconds since the Unix epoch
     * @param image the JPEG bytes to persist
     * @return metadata containing the generated identifier and backend media URL
     * @throws IllegalArgumentException if the image is empty, exceeds 20 MiB, or has an unsupported trigger category
     * @throws IllegalStateException if storage or retention cleanup fails
     */
    public synchronized MotionSnapshot save(String camera, String type, long timestamp, byte[] image) {
        if (image.length == 0 || image.length > MAX_IMAGE_BYTES || !List.of("motion", "smart").contains(type)) {
            throw new IllegalArgumentException("Invalid motion snapshot");
        }
        UUID id = UUID.randomUUID();
        MotionSnapshot snapshot = new MotionSnapshot(id, camera, timestamp, type, "/api/media/protect/" + id);
        Path directory = directory();
        try {
            Files.createDirectories(directory);
            Path temporary = Files.createTempFile(directory, "snapshot-", ".part");
            try {
                Files.write(temporary, image);
                move(temporary, directory.resolve(id + ".jpg"));
                Files.write(temporary, mapper.writeValueAsBytes(snapshot));
                move(temporary, directory.resolve(id + ".json"));
            } catch (Exception failure) {
                Files.deleteIfExists(directory.resolve(id + ".jpg"));
                Files.deleteIfExists(directory.resolve(id + ".json"));
                throw failure;
            } finally {
                Files.deleteIfExists(temporary);
            }
            prune();
            return snapshot;
        } catch (IOException failure) {
            throw new IllegalStateException("Motion snapshot storage unavailable", failure);
        }
    }

    /**
     * Rebuilds the gallery from persisted metadata, making retained snapshots available after application restarts.
     *
     * @return up to 20 groups ordered newest first
     * @throws IllegalStateException if the snapshot directory cannot be listed
     */
    public synchronized List<MotionGroup> groups() {
        return group(read()).stream().limit(MAX_GROUPS).toList();
    }

    /**
     * Reads a bounded image only when both its JPEG and metadata exist as regular, non-symbolic-link files.
     *
     * @param id the snapshot identifier
     * @return the stored image bytes
     * @throws NotFoundException if either file is unavailable or the image is unreadable or exceeds the size limit
     */
    public synchronized byte[] image(UUID id) {
        Path path = directory().resolve(id + ".jpg");
        try {
            if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
                    || !Files.isRegularFile(directory().resolve(id + ".json"), LinkOption.NOFOLLOW_LINKS)
                    || Files.size(path) > MAX_IMAGE_BYTES) {
                throw new NotFoundException();
            }
            return Files.readAllBytes(path);
        } catch (IOException failure) {
            throw new NotFoundException();
        }
    }

    /**
     * Removes snapshots outside the newest 20 groups and clears interrupted-write temporary files and orphan images.
     * Cleanup is restricted to the protect subdirectory and leaves unrelated media files untouched.
     *
     * @throws IllegalStateException if the snapshot index or cleanup cannot access storage
     */
    public synchronized void prune() {
        List<MotionSnapshot> snapshots = read();
        var retained = new HashSet<UUID>();
        group(snapshots).stream().limit(MAX_GROUPS)
                .forEach(group -> group.snapshots().forEach(snapshot -> retained.add(snapshot.id())));
        try {
            for (MotionSnapshot snapshot : snapshots) {
                if (!retained.contains(snapshot.id())) {
                    Files.deleteIfExists(directory().resolve(snapshot.id() + ".json"));
                    Files.deleteIfExists(directory().resolve(snapshot.id() + ".jpg"));
                }
            }
        } catch (IOException failure) {
            throw new IllegalStateException("Motion snapshot cleanup unavailable", failure);
        }
        if (Files.isDirectory(directory())) {
            try (var files = Files.list(directory())) {
                for (Path file : files.toList()) {
                    String name = file.getFileName().toString();
                    if (name.startsWith("snapshot-") && name.endsWith(".part")) {
                        Files.deleteIfExists(file);
                    } else if (name.endsWith(".jpg")) {
                        try {
                            UUID id = UUID.fromString(name.substring(0, name.length() - 4));
                            if (name.equals(id + ".jpg") && !Files.exists(directory().resolve(id + ".json"))) {
                                Files.deleteIfExists(file);
                            }
                        } catch (IllegalArgumentException ignored) {
                        }
                    }
                }
            } catch (IOException failure) {
                throw new IllegalStateException("Unpublished snapshot cleanup unavailable", failure);
            }
        }
    }

    /**
     * Resolves the dedicated snapshot directory beneath the configured media root.
     *
     * @return the absolute, normalized protect directory
     */
    private Path directory() {
        return Path.of(config.mediaDirectory()).toAbsolutePath().normalize().resolve("protect");
    }

    /**
     * Loads valid metadata entries with matching regular image files and rebuilds their canonical media URLs.
     * Invalid metadata is logged and skipped rather than preventing the remaining gallery from loading.
     *
     * @return snapshots sorted by ascending timestamp and then identifier
     * @throws IllegalStateException if the snapshot directory cannot be listed
     */
    private List<MotionSnapshot> read() {
        Path directory = directory();
        if (!Files.isDirectory(directory)) {
            return List.of();
        }
        var snapshots = new ArrayList<MotionSnapshot>();
        try (var files = Files.list(directory)) {
            for (Path file : files.filter(path -> path.getFileName().toString().endsWith(".json"))
                    .filter(path -> Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)).toList()) {
                try {
                    MotionSnapshot snapshot = mapper.readValue(file.toFile(), MotionSnapshot.class);
                    if (snapshot.id() != null && file.getFileName().toString().equals(snapshot.id() + ".json")
                            && snapshot.camera() != null && List.of("motion", "smart").contains(snapshot.type())
                            && Files.isRegularFile(directory.resolve(snapshot.id() + ".jpg"), LinkOption.NOFOLLOW_LINKS)) {
                        snapshots.add(new MotionSnapshot(snapshot.id(), snapshot.camera(), snapshot.timestamp(), snapshot.type(),
                                "/api/media/protect/" + snapshot.id()));
                    }
                } catch (IOException | RuntimeException failure) {
                    LOG.warnf("Ignoring invalid motion snapshot metadata: %s", file.getFileName());
                }
            }
        } catch (IOException failure) {
            throw new IllegalStateException("Motion snapshot index unavailable", failure);
        }
        snapshots.sort(Comparator.comparingLong(MotionSnapshot::timestamp).thenComparing(snapshot -> snapshot.id().toString()));
        return snapshots;
    }

    /**
     * Groups chronologically sorted snapshots into windows measured from each group's first event.
     * The newest smart-motion image is preferred as preview; otherwise the newest image is used.
     *
     * @param snapshots snapshots sorted in ascending chronological order
     * @return groups in reverse chronological order without applying a retention limit
     */
    private static List<MotionGroup> group(List<MotionSnapshot> snapshots) {
        var groups = new ArrayList<MotionGroup>();
        for (MotionSnapshot snapshot : snapshots) {
            MotionGroup previous = groups.isEmpty() ? null : groups.getLast();
            if (previous == null || snapshot.timestamp() - previous.snapshots().getFirst().timestamp() >= GROUP_WINDOW) {
                groups.add(new MotionGroup(snapshot.id(), List.of(snapshot), snapshot));
            } else {
                var members = new ArrayList<>(previous.snapshots());
                members.add(snapshot);
                MotionSnapshot preview = snapshot.type().equals("smart") || !previous.preview().type().equals("smart") ? snapshot
                        : previous.preview();
                groups.set(groups.size() - 1, new MotionGroup(previous.id(), List.copyOf(members), preview));
            }
        }
        return groups.reversed();
    }

    /**
     * Publishes a file atomically when supported, falling back to a normal move on other filesystems.
     *
     * @param source the temporary file
     * @param destination the published file path
     * @throws IOException if the file cannot be moved
     */
    private static void move(Path source, Path destination) throws IOException {
        try {
            Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE);
        } catch (java.nio.file.AtomicMoveNotSupportedException failure) {
            Files.move(source, destination);
        }
    }
}