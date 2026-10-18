package cloud.heiss.dashboard.config;

import java.util.Optional;

/** Item names used for security state, PIN commands, and doorbell events. */
public interface OpenhabItemConfig {

    Optional<String> security();

    Optional<String> pin();

    Optional<String> doorbell();
}