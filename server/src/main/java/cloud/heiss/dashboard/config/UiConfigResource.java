package cloud.heiss.dashboard.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.ServiceUnavailableException;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.io.IOException;

/** Serves public UI settings from a backend-owned runtime file before sign-in. */
@ApplicationScoped
@Path("/api/config")
@Produces(MediaType.APPLICATION_JSON)
@PermitAll
public class UiConfigResource {

    @Inject
    DashboardConfig config;
    @Inject
    ObjectMapper mapper;

    @GET
    public Response configuration() {
        try {
            JsonNode settings = mapper.readTree(java.nio.file.Path.of(config.uiConfigFile()).toFile());
            if (settings == null || !settings.isObject()) {
                throw new ServiceUnavailableException("UI configuration must be a JSON object");
            }
            var publicSettings = mapper.createObjectNode();
            publicSettings.put("sitemapUrl", settings.path("openhab").path("sitemap").asText());
            publicSettings.put("evccUrl", settings.path("evcc").path("url").asText());
            JsonNode cameras = settings.path("protect").path("cameras");
            publicSettings.set("cameras", cameras.isObject() ? cameras : mapper.createObjectNode());
            return Response.ok(publicSettings).header("Cache-Control", "no-store").build();
        } catch (IOException failure) {
            throw new ServiceUnavailableException("UI configuration is unavailable");
        }
    }
}