package cloud.heiss.dashboard.config;

/** Configures the interval between scheduled account reconciliations. */
public interface SyncConfig {

    String every();
}