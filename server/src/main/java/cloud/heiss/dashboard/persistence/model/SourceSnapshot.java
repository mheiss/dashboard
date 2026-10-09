package cloud.heiss.dashboard.persistence.model;

import java.util.UUID;

/** Detached source value containing ownership, display settings, selection, and delta position. */
public record SourceSnapshot(UUID id, UUID accountId, String kind, String upstreamId, String driveId, String name, String theme,
        boolean selected, String deltaLink) {
}