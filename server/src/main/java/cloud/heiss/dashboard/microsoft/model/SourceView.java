package cloud.heiss.dashboard.microsoft.model;

/** Admin-facing calendar or photo source with its display settings and selection state. */
public record SourceView(String id, String kind, String name, String theme, boolean selected) {
}