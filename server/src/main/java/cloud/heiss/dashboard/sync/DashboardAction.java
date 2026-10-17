package cloud.heiss.dashboard.sync;

/**
 * Carries an interpreted backend action to clients without exposing raw openHAB items or upstream credentials.
 *
 * @param type SHOW_CAMERA, SECURITY_STATE, SNAPSHOTS_CHANGED, or the initial subscription SYNC action
 * @param camera the camera key for SHOW_CAMERA; null for other actions
 * @param armed the current security state for SECURITY_STATE; null when unknown or unrelated to the action
 */
public record DashboardAction(String type, String camera, Boolean armed) {
}