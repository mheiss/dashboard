package cloud.heiss.dashboard.api;

/** Revision-bound image paging position containing the last photo's sort timestamp and ID. */
public record PhotoCursor(String timestamp, String id, long revision) {
}