package cloud.heiss.dashboard.api.model;

/** Photo response metadata with versioned, public thumbnail and original URLs. */
public record Image(String id, String name, String takenAt, String modifiedAt, String thumbnailUrl, String originalUrl) {
}