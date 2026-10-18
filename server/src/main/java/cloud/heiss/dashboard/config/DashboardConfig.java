package cloud.heiss.dashboard.config;

import java.util.Optional;

import io.smallrye.config.ConfigMapping;

/** Maps dashboard settings for timezone, media storage, Microsoft access, and synchronization. */
@ConfigMapping(prefix = "dashboard")
public interface DashboardConfig {

    String zone();

    String uiBasePath();

    String uiConfigFile();

    Optional<String> tokenKey();

    String mediaDirectory();

    long originalCacheBytes();

    long thumbnailCacheBytes();

    MicrosoftConfig microsoft();

    SyncConfig sync();
}