package cloud.heiss.dashboard.config;

import java.io.IOException;
import java.util.Map;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import cloud.heiss.dashboard.api.ConfigurationApi;
import cloud.heiss.dashboard.api.model.UiConfiguration;
import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.ServiceUnavailableException;
import jakarta.ws.rs.core.Response;

/**
 * Serves public UI settings from a backend-owned runtime file before sign-in.
 */
@ApplicationScoped
@Path("/")
@PermitAll
public class UiConfigResource implements ConfigurationApi {

    @Inject
    DashboardConfig config;
    @Inject
    ObjectMapper mapper;

    @Override
    public Response getConfiguration() {
        try {
            JsonNode settings = mapper.readTree(java.nio.file.Path.of(config.uiConfigFile()).toFile());
            if (settings == null || !settings.isObject()) {
                throw new ServiceUnavailableException("UI configuration must be a JSON object");
            }
            JsonNode cameras = settings.path("protect").path("cameras");
            Map<String, String> cameraNames = cameras.isObject()
                    ? mapper.convertValue(cameras, new com.fasterxml.jackson.core.type.TypeReference<Map<String, String>>() {
                    })
                    : Map.of();
            var publicSettings = new UiConfiguration(settings.path("openhab").path("sitemap").asText(),
                    settings.path("evcc").path("url").asText(), cameraNames);
            return Response.ok(publicSettings).header("Cache-Control", "no-store").build();
        } catch (IOException failure) {
            throw new ServiceUnavailableException("UI configuration is unavailable");
        }
    }
}