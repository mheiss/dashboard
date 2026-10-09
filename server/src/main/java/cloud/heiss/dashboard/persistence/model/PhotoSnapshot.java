package cloud.heiss.dashboard.persistence.model;

import java.time.Instant;
import java.util.UUID;

/** Detached photo metadata used for cached reads, media downloads, and versioned cache keys. */
public record PhotoSnapshot(UUID id, String driveId, String upstreamId, String name, Instant takenAt, Instant modifiedAt,
        String version) {
}