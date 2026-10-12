package cloud.heiss.dashboard.config;

import io.smallrye.config.ConfigMapping;
import io.smallrye.config.WithDefault;
import java.net.URI;
import java.util.Optional;

@ConfigMapping(prefix = "dashboard.proxy")
public interface IntegrationProxyConfig {

    Optional<URI> openhabUrl();

    Optional<String> openhabToken();

    Optional<URI> go2rtcUrl();

    @WithDefault("5000")
    int connectTimeoutMs();

    @WithDefault("30000")
    long requestTimeoutMs();
}