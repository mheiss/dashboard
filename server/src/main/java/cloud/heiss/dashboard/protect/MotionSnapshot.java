package cloud.heiss.dashboard.protect;

import java.util.UUID;

/**
 * Stores the metadata for one backend-captured motion image and exposes its gallery representation.
 *
 * @param id the identifier shared by the JPEG, metadata file, and media URL
 * @param camera the configured camera key
 * @param timestamp the event time in milliseconds since the Unix epoch
 * @param type the motion or smart trigger category
 * @param url the dashboard-relative URL for retrieving the image
 */
public record MotionSnapshot(UUID id, String camera, long timestamp, String type, String url) {
}