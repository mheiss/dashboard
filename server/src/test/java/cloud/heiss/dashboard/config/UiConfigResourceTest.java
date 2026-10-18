package cloud.heiss.dashboard.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.fasterxml.jackson.databind.ObjectMapper;

import cloud.heiss.dashboard.api.model.UiConfiguration;
import jakarta.ws.rs.ServiceUnavailableException;

/**
 * Verifies runtime UI configuration reloads and safe failures for unavailable
 * or invalid files.
 */
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
        try (var response = resource.getConfiguration()) {
            assertEquals("https://first.example.lan", ((UiConfiguration) response.getEntity()).getEvccUrl());
            assertEquals("no-store", response.getHeaderString("Cache-Control"));
        }
        Files.writeString(file, "{\"evcc\":{\"url\":\"https://second.example.lan\"}}");
        try (var response = resource.getConfiguration()) {
            assertEquals("https://second.example.lan", ((UiConfiguration) response.getEntity()).getEvccUrl());
        }
    }

    @Test
    void exposesOnlyFrontendSettingsWithCameraOrderPreserved() throws Exception {
        Files.writeString(file, """
                {"openhab":{"sitemap":"https://openhab.example.lan/basicui/app","items":{"pin":"Private_Pin"}},
                 "evcc":{"url":"https://evcc.example.lan"},
                 "protect":{"cameras":{"garden":"Garden","entry":"Entrance"}},"secret":"private"}
                """);
        try (var response = resource.getConfiguration()) {
            assertEquals(resource.mapper.readTree("""
                    {"sitemapUrl":"https://openhab.example.lan/basicui/app","evccUrl":"https://evcc.example.lan",
                     "cameras":{"garden":"Garden","entry":"Entrance"}}
                        """), resource.mapper.valueToTree(response.getEntity()));
            var cameras = ((UiConfiguration) response.getEntity()).getCameras().keySet().iterator();
            assertEquals("garden", cameras.next());
            assertEquals("entry", cameras.next());
        }
    }

    @Test
    void missingSettingsHaveFrontendCompatibleDefaults() throws Exception {
        Files.writeString(file, "{}");
        try (var response = resource.getConfiguration()) {
            assertEquals(resource.mapper.readTree("{\"sitemapUrl\":\"\",\"evccUrl\":\"\",\"cameras\":{}}"),
                    resource.mapper.valueToTree(response.getEntity()));
        }
    }

    @Test
    void missingFileReturnsServiceUnavailable() {
        var failure = assertThrows(ServiceUnavailableException.class, resource::getConfiguration);
        assertEquals(503, failure.getResponse().getStatus());
    }

    @Test
    void malformedJsonReturnsServiceUnavailable() throws Exception {
        Files.writeString(file, "{invalid");
        assertThrows(ServiceUnavailableException.class, resource::getConfiguration);
    }

    @Test
    void nonObjectJsonReturnsServiceUnavailable() throws Exception {
        Files.writeString(file, "[]");
        assertThrows(ServiceUnavailableException.class, resource::getConfiguration);
    }
}