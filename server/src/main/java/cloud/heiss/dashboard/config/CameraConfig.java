package cloud.heiss.dashboard.config;

import io.smallrye.config.WithDefault;

/** One camera's stable ID and display label. */
public interface CameraConfig {

    String id();

    String label();

    @WithDefault("false")
    boolean snapshot();
}