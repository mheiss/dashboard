package cloud.heiss.dashboard.microsoft;

import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.entity.GraphSubscription;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;

/** Public webhook endpoint that answers validation challenges and queues sync for verified notifications. */
@Path("/graph/webhook")
@PermitAll
public class GraphWebhookResource {

    @Inject
    DashboardStore store;
    @Inject
    ObjectMapper mapper;

    @POST
    public Response notify(@QueryParam("validationToken") String validation, String payload) {
        if (validation != null) {
            if (validation.length() > 4096) {
                return Response.status(400).build();
            }
            return Response.ok(validation, MediaType.TEXT_PLAIN).build();
        }
        JsonNode body;
        try {
            body = payload == null ? null : mapper.readTree(payload);
        } catch (Exception exception) {
            return Response.status(400).build();
        }
        if (body == null || !body.path("value").isArray() || body.path("value").size() > 1000) {
            return Response.status(400).build();
        }
        store.inTransaction(manager -> {
            for (var notification : body.path("value")) {
                String id = notification.path("subscriptionId").asText();
                String supplied = notification.path("clientState").asText();
                var subscription = manager.find(GraphSubscription.class, id);
                if (subscription == null) {
                    continue;
                }
                if (subscription.expiresAt.isBefore(Instant.now())
                        || !MessageDigest.isEqual(supplied.getBytes(StandardCharsets.UTF_8),
                                subscription.clientState.getBytes(StandardCharsets.UTF_8))) {
                    continue;
                }
                manager.createQuery("update MicrosoftAccount set requested=true where id=?1 and status<>'RECONNECT_REQUIRED'")
                        .setParameter(1, subscription.accountId).executeUpdate();
            }
            return null;
        });
        return Response.accepted().build();
    }

}