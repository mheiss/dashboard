package cloud.heiss.dashboard.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.ws.rs.ServiceUnavailableException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Verifies runtime UI configuration reloads and safe failures for unavailable or invalid files. */
class UiConfigResourceTest {

    @TempDir
    Path directory;

    UiConfigResource resource;
    Path file;

    @BeforeEach
    void setup() {
        file = directory.resolve("config.json");
        resource = new UiConfigResource();
        resource.config = mock(DashboardConfig.class);
        resource.mapper = new ObjectMapper();
        when(resource.config.uiConfigFile()).thenReturn(file.toString());
    }

    @Test
    void reloadsTheFileOnEachRequest() throws Exception {
        Files.writeString(file, "{\"evcc\":{\"url\":\"https://first.example.lan\"}}");
        try (var response = resource.configuration()) {
            assertEquals("https://first.example.lan", ((JsonNode) response.getEntity()).path("evccUrl").asText());
            assertEquals("no-store", response.getHeaderString("Cache-Control"));
        }
        Files.writeString(file, "{\"evcc\":{\"url\":\"https://second.example.lan\"}}");
        try (var response = resource.configuration()) {
            assertEquals("https://second.example.lan", ((JsonNode) response.getEntity()).path("evccUrl").asText());
        }
    }

    @Test
    void exposesOnlyFrontendSettingsWithCameraOrderPreserved() throws Exception {
        Files.writeString(file, """
                {"openhab":{"sitemap":"https://openhab.example.lan/basicui/app","items":{"pin":"Private_Pin"}},
                 "evcc":{"url":"https://evcc.example.lan"},
                 "protect":{"cameras":{"garden":"Garden","entry":"Entrance"}},"secret":"private"}
                """);
        try (var response = resource.configuration()) {
            assertEquals(resource.mapper.readTree("""
                    {"sitemapUrl":"https://openhab.example.lan/basicui/app","evccUrl":"https://evcc.example.lan",
                     "cameras":{"garden":"Garden","entry":"Entrance"}}
                    """), response.getEntity());
            var cameras = ((JsonNode) response.getEntity()).path("cameras").fieldNames();
            assertEquals("garden", cameras.next());
            assertEquals("entry", cameras.next());
        }
    }

    @Test
    void missingSettingsHaveFrontendCompatibleDefaults() throws Exception {
        Files.writeString(file, "{}");
        try (var response = resource.configuration()) {
            assertEquals(resource.mapper.readTree("{\"sitemapUrl\":\"\",\"evccUrl\":\"\",\"cameras\":{}}"), response.getEntity());
        }
    }

    @Test
    void missingFileReturnsServiceUnavailable() {
        var failure = assertThrows(ServiceUnavailableException.class, resource::configuration);
        assertEquals(503, failure.getResponse().getStatus());
    }

    @Test
    void malformedJsonReturnsServiceUnavailable() throws Exception {
        Files.writeString(file, "{invalid");
        assertThrows(ServiceUnavailableException.class, resource::configuration);
    }

    @Test
    void nonObjectJsonReturnsServiceUnavailable() throws Exception {
        Files.writeString(file, "[]");
        assertThrows(ServiceUnavailableException.class, resource::configuration);
    }
}