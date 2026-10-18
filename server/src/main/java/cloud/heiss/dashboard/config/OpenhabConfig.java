package cloud.heiss.dashboard.config;

import java.util.Optional;

/** Public openHAB view and backend item mappings. */
public interface OpenhabConfig {

    Optional<String> sitemap();

    OpenhabItemConfig items();

    Optional<String> doorbellCamera();
}