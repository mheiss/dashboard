package cloud.heiss.dashboard.microsoft;

import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.entity.GraphSubscription;
import cloud.heiss.dashboard.persistence.entity.MicrosoftAccount;

import static io.restassured.RestAssured.given;
import static org.junit.jupiter.api.Assertions.assertEquals;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Verifies webhook challenges, authenticated notification queuing, and private API access checks. */
@QuarkusTest
class WebhookTest {

    @Inject
    DashboardStore store;

    @Test
    void webhookEchoesValidationAndOnlyQueuesAuthenticatedNotifications() {
        given().queryParam("validationToken", "validation-example").when().post("/graph/webhook").then().statusCode(200)
                .contentType("text/plain").body(org.hamcrest.Matchers.equalTo("validation-example"));
        UUID account = UUID.randomUUID();
        String subscription = UUID.randomUUID().toString();
        var owner = new MicrosoftAccount();
        owner.id = account;
        owner.microsoftId = account.toString();
        owner.name = "Fixture";
        owner.tokenCache = "Fixture";
        owner.requested = false;
        store.persist(owner);
        var entity = new GraphSubscription();
        entity.id = subscription;
        entity.accountId = account;
        entity.resource = "me/events";
        entity.clientState = "secret-fixture";
        entity.expiresAt = Instant.now().plusSeconds(600);
        store.persist(entity);
        try {
            notification(subscription, "wrong");
            assertEquals(false, requested(account));
            notification(subscription, "secret-fixture");
            notification(subscription, "secret-fixture");
            assertEquals(true, requested(account));
        } finally {
            store.update("delete from MicrosoftAccount where id=?1", account);
        }
    }

    @Test
    void privateApiRequiresAuthentication() {
        given().redirects().follow(false).when().get("/accounts").then().statusCode(401);
        given().header("X-Dashboard-Request", "true").contentType("application/json")
                .body(Map.of("query", "{ images { totalCount } }")).redirects().follow(false).when().post("/graphql").then()
                .statusCode(200);
    }

    private boolean requested(UUID account) {
        return store.list("select requested from MicrosoftAccount where id=?1", Boolean.class, account).getFirst();
    }

    private void notification(String id, String state) {
        given().contentType("application/json")
                .body(Map.of("value", java.util.List.of(Map.of("subscriptionId", id, "clientState", state)))).when()
                .post("/graph/webhook").then().statusCode(202);
    }
}