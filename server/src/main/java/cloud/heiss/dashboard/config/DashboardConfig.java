package cloud.heiss.dashboard.config;

import io.smallrye.config.ConfigMapping;
import java.util.Optional;
import java.util.List;

/** Maps dashboard settings for timezone, the local administrator, media storage, Microsoft access, and synchronization. */
@ConfigMapping(prefix = "dashboard")
public interface DashboardConfig {

    String zone();

    String uiBasePath();

    String uiConfigFile();

    Optional<String> tokenKey();

    Optional<String> adminPassword();

    String mediaDirectory();

    long originalCacheBytes();

    long thumbnailCacheBytes();

    MicrosoftConfig microsoft();

    SyncConfig sync();

    List<String> allowedOrigins();
}