package cloud.heiss.dashboard.config;

import io.quarkus.test.junit.QuarkusTestProfile;
import java.util.Map;

/** Enables embedded UI serving for HTTP routing checks while retaining test database and credential fixtures. */
public class UiHostingProfile implements QuarkusTestProfile {

    @Override
    public Map<String, String> getConfigOverrides() {
        return Map.of("quarkus.quinoa", "true");
    }
}