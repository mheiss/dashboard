package cloud.heiss.dashboard.microsoft.model;

import java.util.List;

/** Admin-facing account status and discovered sources, excluding token-cache credentials. */
public record AccountView(String id, String name, String status, String error, String lastSync, List<SourceView> sources) {
}