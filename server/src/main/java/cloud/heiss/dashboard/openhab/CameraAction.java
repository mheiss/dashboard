package cloud.heiss.dashboard.openhab;

/**
 * Describes a camera selected by an interpreted openHAB event.
 *
 * @param camera the configured camera key
 * @param reason the trigger category: doorbell, motion, or smart
 */
public record CameraAction(String camera, String reason) {
}