package cloud.heiss.dashboard.config;

import java.util.List;

/** Ordered camera settings shared by public views and backend motion handling. */
public interface ProtectConfig {

    List<CameraConfig> cameras();
}