package cloud.heiss.dashboard.microsoft;

import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.entity.GraphSubscription;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/** Creates, renews, and removes Graph webhook subscriptions for an account's selected sources. */
@ApplicationScoped
public class GraphSubscriptions {

    @Inject
    DashboardConfig config;
    @Inject
    DashboardStore store;
    @Inject
    GraphClient graph;
    @Inject
    ObjectMapper mapper;

    public void maintain(UUID account) {
        if (config.microsoft().webhookUrl().isEmpty()) {
            return;
        }
        Set<String> resources = new HashSet<>();
        for (var source : store.sources(account)) {
            if (!source.selected()) {
                continue;
            }
            resources.add(source.kind().equals("CALENDAR") ? "me/events"
                    : "drives/" + GraphClient.segment(source.driveId()) + "/items/" + GraphClient.segment(source.upstreamId()));
        }
        var saved = store.list("from GraphSubscription where accountId=?1", GraphSubscription.class, account).stream()
                .map(entity -> new SavedSubscription(entity.id, entity.resource, entity.clientState, entity.expiresAt)).toList();
        for (var subscription : saved) {
            if (!resources.contains(subscription.resource())) {
                try {
                    graph.json(account, "subscriptions/" + GraphClient.segment(subscription.id()), "DELETE", null);
                } catch (RuntimeException ignored) {
                }
                store.update("delete from GraphSubscription where id=?1", subscription.id());
                continue;
            }
            if (subscription.expiry().isAfter(Instant.now().plusSeconds(86400))) {
                resources.remove(subscription.resource());
                continue;
            }
            var body = mapper.createObjectNode().put("expirationDateTime", expiry(subscription.resource()));
            try {
                var result = graph.json(account, "subscriptions/" + GraphClient.segment(subscription.id()), "PATCH", body);
                store.update("update GraphSubscription set expiresAt=?1 where id=?2",
                        Instant.parse(result.path("expirationDateTime").asText()), subscription.id());
                resources.remove(subscription.resource());
            } catch (GraphFailure failure) {
                if (failure.status != 404 && failure.status != 410) {
                    throw failure;
                }
                store.update("delete from GraphSubscription where id=?1", subscription.id());
            }
        }
        for (String resource : resources) {
            String state = UUID.randomUUID().toString() + UUID.randomUUID();
            var body = mapper.createObjectNode().put("resource", resource)
                    .put("changeType", resource.equals("me/events") ? "created,updated,deleted" : "updated")
                    .put("notificationUrl", config.microsoft().webhookUrl().orElseThrow()).put("clientState", state)
                    .put("expirationDateTime", expiry(resource));
            var result = graph.json(account, "subscriptions", "POST", body);
            var entity = new GraphSubscription();
            entity.id = result.path("id").asText();
            entity.accountId = account;
            entity.resource = resource;
            entity.clientState = state;
            entity.expiresAt = Instant.parse(result.path("expirationDateTime").asText());
            store.persist(entity);
        }
    }

    private String expiry(String resource) {
        return Instant.now().plusSeconds(resource.equals("me/events") ? 5 * 86400 : 20 * 86400).toString();
    }
}