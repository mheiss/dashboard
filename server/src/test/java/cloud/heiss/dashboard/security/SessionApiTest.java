package cloud.heiss.dashboard.security;

import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.entity.MicrosoftAccount;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.common.http.TestHTTPResource;
import jakarta.inject.Inject;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

/** Verifies local sessions, role restrictions, browser request safeguards, and GraphQL HTTP/WebSocket access. */
@QuarkusTest
class SessionApiTest {

    @TestHTTPResource
    URI base;

    @Inject
    TokenCipher cipher;
    @Inject
    DashboardStore store;
    @Inject
    ObjectMapper mapper;

    private String login(String username, String password) {
        return given().formParam("j_username", username).formParam("j_password", password).when().post("/api/j_security_check")
                .then().statusCode(200).extract().cookie("quarkus-credential");
    }

    @Test
    void uiConfigurationIsAvailableBeforeLogin() {
        given().when().get("/api/config").then().statusCode(200).contentType("application/json")
                .header("Cache-Control", "no-store").body("openhab.items.security", equalTo("Security"))
                .body("evcc.url", equalTo("https://evcc.example.lan")).body("protect.cameras.entry", equalTo("Eingang"));
        given().header("Origin", "https://attacker.example").when().get("/api/config").then().statusCode(403);
    }

    @Test
    void publicReadsGraphqlButCannotManageAccounts() {
        given().when().get("/api/session").then().statusCode(401);
        given().when().get("/api/accounts").then().statusCode(401);
        String query = "{ agenda(days:7) { revision timezone days { date allDay { id isAllDay startsAt endsAt "
                + "calendar { id name theme } } events { id subject } } } images(first:25) { revision totalCount "
                + "endCursor hasNextPage items { id name takenAt modifiedAt thumbnailUrl originalUrl } } moments { date images { id } } "
                + "syncStatus { id name status error lastSuccessfulSync } }";
        given().contentType("application/json").body(Map.of("query", query)).when().post("/api/graphql").then().statusCode(200)
                .body("errors", equalTo(null)).body("data.agenda.days.size()", equalTo(7)).body("data.images", notNullValue());
        given().header("Origin", "https://attacker.example").when().get("/api/graphql").then().statusCode(403);
        given().contentType("application/json").body(Map.of("query", "{calendars{id}}")).when().post("/api/graphql").then()
                .statusCode(200);
    }

    @Test
    void publicMediaDoesNotRequireLoginButAccountManagementDoes() {
        String id = java.util.UUID.randomUUID().toString();
        given().when().get("/api/media/images/" + id + "/thumbnail").then().statusCode(404);
        given().when().get("/api/media/images/" + id + "/original").then().statusCode(404);
        given().when().post("/api/accounts/connect").then().statusCode(401);
        given().when().delete("/api/accounts/" + id).then().statusCode(401);
    }

    @Test
    void microsoftCallbackRequiresAdminAndValidState() {
        given().queryParam("state", "invalid-state").queryParam("code", "fixture-code").when().get("/api/accounts/callback")
                .then().statusCode(401);
        String admin = login("admin", "fixture-admin-password");
        given().cookie("quarkus-credential", admin).header("Sec-Fetch-Site", "cross-site")
                .header("Referer", "https://login.live.com/").queryParam("state", "invalid-state")
                .queryParam("code", "fixture-code").when().get("/api/accounts/callback").then().statusCode(400);
    }

    @Test
    void adminSelectsSourcesAndDisconnectsAccountsThroughHibernate() {
        var account = new MicrosoftAccount();
        account.id = java.util.UUID.randomUUID();
        account.microsoftId = account.id.toString();
        account.name = "Setup fixture";
        account.tokenCache = "Encrypted fixture";
        store.persist(account);
        var source = new DashboardSource();
        source.id = java.util.UUID.randomUUID();
        source.accountId = account.id;
        source.kind = "CALENDAR";
        source.upstreamId = "fixture-calendar";
        source.name = "Fixture calendar";
        store.persist(source);
        String cookie = login("admin", "fixture-admin-password");
        try {
            long revision = store.revision();
            given().cookie("quarkus-credential", cookie).contentType("application/json")
                    .body(Map.of("selected", true, "theme", "rose")).when().put("/api/accounts/sources/" + source.id).then()
                    .statusCode(200);
            assertEquals(true, store.sources(account.id).getFirst().selected());
            assertEquals("rose", store.sources(account.id).getFirst().theme());
            assertEquals(revision + 1, store.revision());
            given().cookie("quarkus-credential", cookie).contentType("application/json")
                    .body(Map.of("selected", true, "theme", "rose")).when()
                    .put("/api/accounts/sources/" + java.util.UUID.randomUUID()).then().statusCode(404);
            given().cookie("quarkus-credential", cookie).when().delete("/api/accounts/" + account.id).then().statusCode(204);
            assertEquals(0, store.sources(account.id).size());
            assertEquals(revision + 2, store.revision());
        } finally {
            store.update("delete from MicrosoftAccount where id=?1", account.id);
        }
    }

    @Test
    void signInNeedsNoCustomHeaderButRejectsCrossSiteRequests() {
        given().header("Origin", base.toString().replaceFirst("/$", "")).formParam("j_username", "admin")
                .formParam("j_password", "fixture-admin-password").when().post("/api/j_security_check").then().statusCode(200);
        given().header("Origin", "https://attacker.example").formParam("j_username", "admin")
                .formParam("j_password", "fixture-admin-password").when().post("/api/j_security_check").then().statusCode(403);
        given().header("Sec-Fetch-Site", "cross-site").formParam("j_username", "admin")
                .formParam("j_password", "fixture-admin-password").when().post("/api/j_security_check").then().statusCode(403);
        given().header("Sec-Fetch-Site", "same-site").formParam("j_username", "admin")
                .formParam("j_password", "fixture-admin-password").when().post("/api/j_security_check").then().statusCode(403);
        given().header("Referer", "https://attacker.example/form").formParam("j_username", "admin")
                .formParam("j_password", "fixture-admin-password").when().post("/api/j_security_check").then().statusCode(403);
    }

    @Test
    void browserOriginMustMatchTheServedSchemeHostAndPort() {
        String origin = base.toString().replaceFirst("/$", "");
        given().header("Origin", origin).when().get("/api/config").then().statusCode(200);
        String otherPort = base.getScheme() + "://" + base.getHost() + ":" + (base.getPort() + 1);
        given().header("Origin", otherPort).when().get("/api/config").then().statusCode(403);
        given().header("Origin", origin.replaceFirst("^http:", "https:")).when().get("/api/config").then().statusCode(403);
        given().header("Origin", "null").when().get("/api/config").then().statusCode(403);
    }

    @Test
    void publicWebsocketReceivesTheCurrentRevision() throws Exception {
        var received = new CompletableFuture<JsonNode>();
        var listener = new DashboardSubscriptionListener(mapper, received);
        WebSocket socket = HttpClient.newHttpClient().newWebSocketBuilder().subprotocols("graphql-transport-ws")
                .header("Origin", base.toString().replaceFirst("/$", ""))
                .buildAsync(URI.create(base.toString().replaceFirst("^http", "ws")).resolve("/api/graphql"), listener)
                .get(10, TimeUnit.SECONDS);
        try {
            JsonNode payload = received.get(10, TimeUnit.SECONDS);
            assertEquals("ALL", payload.path("data").path("dashboardChanged").path("dataset").asText());
            assertEquals(false, payload.has("errors"));
        } finally {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "Fixture complete").join();
        }
    }

    @Test
    void adminCanReadSetupAndEncryptionRejectsTampering() {
        String cookie = login("admin", "fixture-admin-password");
        given().cookie("quarkus-credential", cookie).when().get("/api/session").then().statusCode(200).body("admin",
                equalTo(true));
        given().cookie("quarkus-credential", cookie).when().get("/api/accounts").then().statusCode(200);
        String encrypted = cipher.encrypt("fixture-token-cache");
        assertEquals("fixture-token-cache", cipher.decrypt(encrypted));
        assertThrows(IllegalStateException.class, () -> cipher.decrypt(encrypted.substring(0, encrypted.length() - 4) + "AAAA"));
    }
}