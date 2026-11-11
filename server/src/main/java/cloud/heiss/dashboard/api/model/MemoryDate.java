package cloud.heiss.dashboard.api.model;

/** A calendar day with anniversary photos, grouped by month and day. */
public record MemoryDate(int month, int day, int photoYearCount, int photoCount) {
}