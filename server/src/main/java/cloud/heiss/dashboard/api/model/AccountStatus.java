package cloud.heiss.dashboard.api.model;

/** Public synchronization status and last successful sync time for a connected Microsoft account. */
public record AccountStatus(String id, String name, String status, String error, String lastSuccessfulSync) {
}