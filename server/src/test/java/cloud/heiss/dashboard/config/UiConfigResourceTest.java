package cloud.heiss.dashboard.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.ObjectMapper;

import cloud.heiss.dashboard.api.model.UiConfiguration;
import io.smallrye.config.SmallRyeConfigBuilder;
import jakarta.ws.rs.ServiceUnavailableException;

/**
 * Verifies typed runtime properties, public configuration projection, and Keycloak settings.
 */
class UiConfigResourceTest {

    @Test
    void cameraPropertiesPreserveIndexOrderAndAllowEmptyConfiguration() {
        var config = new SmallRyeConfigBuilder().withMapping(ProtectConfig.class, "dashboard.protect")
                .withDefaultValue("dashboard.protect.cameras[1].id", "entry")
                .withDefaultValue("dashboard.protect.cameras[1].label", "Entrance")
                .withDefaultValue("dashboard.protect.cameras[0].id", "garden")
                .withDefaultValue("dashboard.protect.cameras[0].label", "Garden").build()
                .getConfigMapping(ProtectConfig.class, "dashboard.protect");
        assertEquals("garden", config.cameras().getFirst().id());
        assertEquals("Entrance", config.cameras().getLast().label());
        assertEquals(0, new SmallRyeConfigBuilder().withMapping(ProtectConfig.class, "dashboard.protect").build()
                .getConfigMapping(ProtectConfig.class, "dashboard.protect").cameras().size());
    }

    UiConfigResource resource;
    ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setup() {
        resource = new UiConfigResource();
        resource.config = mock(DashboardConfig.class);
        resource.issuerUrl = "https://login.home.arpa/realms/dashboard";
        resource.clientId = "dashboard";
        settings(Map.of());
    }

    private void settings(Map<String, String> properties) {
        var config = new SmallRyeConfigBuilder().withMapping(OpenhabConfig.class, "dashboard.openhab")
                .withMapping(EvccConfig.class, "dashboard.evcc").withMapping(ProtectConfig.class, "dashboard.protect")
                .withDefaultValues(properties).build();
        when(resource.config.openhab()).thenReturn(config.getConfigMapping(OpenhabConfig.class, "dashboard.openhab"));
        when(resource.config.evcc()).thenReturn(config.getConfigMapping(EvccConfig.class, "dashboard.evcc"));
        when(resource.config.protect()).thenReturn(config.getConfigMapping(ProtectConfig.class, "dashboard.protect"));
    }

    @Test
    void exposesOnlyFrontendSettingsWithCameraOrderPreserved() throws Exception {
        settings(Map.of("dashboard.openhab.sitemap", "https://openhab.home.arpa/basicui/app", "dashboard.openhab.items.pin",
                "Private_Pin", "dashboard.evcc.url", "https://evcc.home.arpa", "dashboard.protect.cameras[0].id", "garden",
                "dashboard.protect.cameras[0].label", "Garden", "dashboard.protect.cameras[1].id", "entry",
                "dashboard.protect.cameras[1].label", "Entrance"));
        try (var response = resource.getConfiguration()) {
            assertEquals(mapper.readTree("""
                    {"sitemapUrl":"https://openhab.home.arpa/basicui/app","evccUrl":"https://evcc.home.arpa",
                     "cameras":{"garden":"Garden","entry":"Entrance"},
                     "keycloak":{"url":"https://login.home.arpa","realm":"dashboard","clientId":"dashboard"}}
                        """), mapper.valueToTree(response.getEntity()));
            assertEquals("no-store", response.getHeaderString("Cache-Control"));
            var cameras = ((UiConfiguration) response.getEntity()).getCameras().keySet().iterator();
            assertEquals("garden", cameras.next());
            assertEquals("entry", cameras.next());
        }
    }

    @Test
    void missingSettingsHaveFrontendCompatibleDefaults() throws Exception {
        try (var response = resource.getConfiguration()) {
            assertEquals(mapper.readTree("""
                    {"sitemapUrl":"","evccUrl":"","cameras":{},
                     "keycloak":{"url":"https://login.home.arpa","realm":"dashboard","clientId":"dashboard"}}
                    """), mapper.valueToTree(response.getEntity()));
        }
    }

    @Test
    void derivesKeycloakSettingsFromTheBackendIssuer() throws Exception {
        resource.issuerUrl = "https://login.home.arpa/auth/realms/household/";
        resource.clientId = "household-dashboard";
        try (var response = resource.getConfiguration()) {
            var keycloak = ((UiConfiguration) response.getEntity()).getKeycloak();
            assertEquals("https://login.home.arpa/auth", keycloak.getUrl());
            assertEquals("household", keycloak.getRealm());
            assertEquals("household-dashboard", keycloak.getClientId());
        }
    }

    @Test
    void missingRealmReturnsServiceUnavailable() throws Exception {
        resource.issuerUrl = "https://login.home.arpa";
        assertThrows(ServiceUnavailableException.class, resource::getConfiguration);
        resource.issuerUrl = "https://login.home.arpa/realms/";
        assertThrows(ServiceUnavailableException.class, resource::getConfiguration);
    }

    @Test
    void duplicateCameraIdsReturnServiceUnavailable() {
        settings(Map.of("dashboard.protect.cameras[0].id", "entry", "dashboard.protect.cameras[0].label", "Entrance",
                "dashboard.protect.cameras[1].id", "entry", "dashboard.protect.cameras[1].label", "Duplicate"));
        assertThrows(ServiceUnavailableException.class, resource::getConfiguration);
    }

    @Test
    void cameraPropertiesRequireBothIdAndLabel() {
        assertThrows(io.smallrye.config.ConfigValidationException.class,
                () -> settings(Map.of("dashboard.protect.cameras[0].id", "entry")));
    }
}