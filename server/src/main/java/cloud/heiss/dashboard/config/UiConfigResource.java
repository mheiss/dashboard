package cloud.heiss.dashboard.config;

import java.util.LinkedHashMap;

import org.eclipse.microprofile.config.inject.ConfigProperty;

import cloud.heiss.dashboard.api.ConfigurationApi;
import cloud.heiss.dashboard.api.model.KeycloakConfiguration;
import cloud.heiss.dashboard.api.model.UiConfiguration;
import jakarta.annotation.security.PermitAll;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.ServiceUnavailableException;
import jakarta.ws.rs.core.Response;

/**
 * Projects public UI settings from backend runtime properties before sign-in.
 */
@ApplicationScoped
@Path("/")
@PermitAll
public class UiConfigResource implements ConfigurationApi {

    @Inject
    DashboardConfig config;

    @ConfigProperty(name = "quarkus.oidc.auth-server-url")
    String issuerUrl;

    @ConfigProperty(name = "quarkus.oidc.client-id")
    String clientId;

    @Override
    public Response getConfiguration() {
        var cameras = new LinkedHashMap<String, String>();
        for (var camera : config.protect().cameras()) {
            if (cameras.putIfAbsent(camera.id(), camera.label()) != null) {
                throw new ServiceUnavailableException("Camera IDs must be unique");
            }
        }
        var publicSettings = new UiConfiguration(config.openhab().sitemap().orElse(""), config.evcc().url().orElse(""), cameras,
                keycloakConfiguration());
        return Response.ok(publicSettings).header("Cache-Control", "no-store").build();
    }

    private KeycloakConfiguration keycloakConfiguration() {
        String issuer = issuerUrl.replaceFirst("/+$", "");
        int realmPath = issuer.lastIndexOf("/realms/");
        if (realmPath < 0 || realmPath + 8 == issuer.length()) {
            throw new ServiceUnavailableException("Keycloak issuer must contain a realm");
        }
        return new KeycloakConfiguration(issuer.substring(0, realmPath), issuer.substring(realmPath + 8), clientId);
    }
}