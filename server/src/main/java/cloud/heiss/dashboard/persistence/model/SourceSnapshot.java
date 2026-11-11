package cloud.heiss.dashboard.persistence.model;

import java.util.UUID;
import java.time.Instant;

/** Detached source value containing ownership, display settings, selection, and delta position. */
public record SourceSnapshot(UUID id, UUID accountId, String kind, String upstreamId, String driveId, String name, String theme,
        boolean selected, String deltaLink, String syncStatus, String syncError, Instant syncLastSync, Integer fileCount) {
}