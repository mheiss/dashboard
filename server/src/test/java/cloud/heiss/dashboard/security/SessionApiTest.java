package cloud.heiss.dashboard.security;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.entity.MicrosoftAccount;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;

/**
 * Verifies OIDC tokens, role restrictions, browser request safeguards, and
 * GraphQL HTTP/WebSocket access.
 */
@QuarkusTest
@QuarkusTestResource(OidcTestResource.class)
class SessionApiTest {

    @TestHTTPResource
    URI base;

    @Inject
    TokenCipher cipher;
    @Inject
    DashboardStore store;
    @Inject
    ObjectMapper mapper;

    @Test
    void uiConfigurationIsAvailableBeforeLogin() {
        given().when().get("/api/config").then().statusCode(200).contentType("application/json")
                .header("Cache-Control", "no-store").body("sitemapUrl", equalTo("https://openhab.example.lan/basicui/app"))
                .body("evccUrl", equalTo("https://evcc.example.lan")).body("cameras.entry", equalTo("Eingang"))
                .body("keycloak.realm", equalTo("dashboard")).body("keycloak.clientId", equalTo("dashboard"))
                .body("size()", equalTo(4));
        given().header("Origin", "https://attacker.example").when().get("/api/config").then().statusCode(403);
    }

    @Test
    void publicReadsGraphqlButCannotManageAccounts() {
        given().when().get("/api/session").then().statusCode(404);
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
        given().when().get("/api/media/protect/" + id).then().statusCode(404);
        given().when().post("/api/accounts/connect").then().statusCode(401);
        given().when().delete("/api/accounts/" + id).then().statusCode(401);
    }

    @Test
    void microsoftCallbackRequiresAdminAndValidState() {
        given().queryParam("state", "invalid-state").queryParam("code", "fixture-code").when().post("/api/accounts/callback")
                .then().statusCode(401);
        given().redirects().follow(false).header("Sec-Fetch-Site", "cross-site").header("Referer", "https://login.live.com/")
                .queryParam("state", "invalid-state").queryParam("code", "fixture-code").when().get("/api/accounts/callback")
                .then().statusCode(303).header("Location", org.hamcrest.Matchers.containsString("microsoft_state=invalid-state"));
        given().auth().oauth2(OidcTestResource.adminToken()).queryParam("state", "invalid-state")
                .queryParam("code", "fixture-code").post("/api/accounts/callback").then().statusCode(400);
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
        String token = OidcTestResource.adminToken();
        try {
            long revision = store.revision();
            given().auth().oauth2(token).contentType("application/json").body(Map.of("selected", true, "theme", "rose")).when()
                    .put("/api/accounts/sources/" + source.id).then().statusCode(200)
                    .body("find { it.id == '" + account.id + "' }.sources[0].selected", equalTo(true))
                    .body("find { it.id == '" + account.id + "' }.sources[0].theme", equalTo("rose"));
            assertEquals(true, store.sources(account.id).getFirst().selected());
            assertEquals("rose", store.sources(account.id).getFirst().theme());
            assertEquals(revision + 1, store.revision());
            given().auth().oauth2(token).contentType("application/json").body(Map.of("selected", true, "theme", "invalid")).when()
                    .put("/api/accounts/sources/" + source.id).then().statusCode(400);
            given().auth().oauth2(token).contentType("application/json").body(Map.of("theme", "rose")).when()
                    .put("/api/accounts/sources/" + source.id).then().statusCode(400);
            given().auth().oauth2(token).contentType("application/json").body(Map.of("selected", true, "theme", "rose")).when()
                    .put("/api/accounts/sources/" + java.util.UUID.randomUUID()).then().statusCode(404);
            given().auth().oauth2(token).when().delete("/api/accounts/" + account.id).then().statusCode(204);
            assertEquals(0, store.sources(account.id).size());
            assertEquals(revision + 2, store.revision());
        } finally {
            store.update("delete from MicrosoftAccount where id=?1", account.id);
        }
    }

    @Test
    void bearerAuthenticationStillRejectsCrossSiteWrites() {
        given().auth().oauth2(OidcTestResource.adminToken()).header("Origin", "https://attacker.example")
                .post("/api/accounts/sync").then().statusCode(403);
        given().auth().oauth2(OidcTestResource.adminToken()).header("Sec-Fetch-Site", "cross-site").post("/api/accounts/sync")
                .then().statusCode(403);
    }

    @Test
    void openApiIsAdminOnlyAndServesThePackagedContract() {
        given().get("/q/openapi").then().statusCode(401);
        given().auth().oauth2(OidcTestResource.adminToken()).queryParam("format", "json").get("/q/openapi").then().statusCode(200)
                .contentType("application/json").body("paths.size()", equalTo(13))
                .body("paths.'/api/config'.get.operationId", equalTo("getConfiguration"))
                .body("paths.'/api/session'", equalTo(null))
                .body("components.schemas.UiConfiguration.properties.cameras.additionalProperties.type", equalTo("string"))
                .body("paths.'/api/accounts/{accountId}/discover'.post.responses.'200'.content.'application/json'.schema.type",
                        equalTo("array"))
                .body("paths.'/api/accounts/{accountId}/folders'.post.responses.'200'.content.'application/json'.schema.type",
                        equalTo("array"))
                .body("paths.'/api/accounts/sources/{sourceId}'.put.responses.'200'.content.'application/json'.schema.type",
                        equalTo("array"))
                .body("paths.'/api/accounts/{accountId}'.delete.responses.'204'.description", equalTo("Account disconnected"))
                .body("paths.'/api/accounts/callback'.post.responses.'204'.description", equalTo("Account connected"))
                .body("paths.'/api/media/images/{id}/thumbnail'.get.responses.'200'.content.'image/jpeg'.schema.format",
                        equalTo("binary"))
                .body("paths.'/api/media/images/{id}/original'.get.responses.'200'.content.'image/*'.schema.format",
                        equalTo("binary"))
                .body("paths.'/api/media/images/{id}/original'.get.responses.'304'.headers.ETag", notNullValue())
                .body("paths.'/api/media/protect/{id}'.get.responses.'200'.content.'image/jpeg'.schema.format", equalTo("binary"))
                .body("paths.'/api/webrtc/frame.jpeg'.get.operationId", equalTo("getCameraFrame"))
                .body("paths.'/api/webrtc/frame.jpeg'.get.parameters[0].required", equalTo(true))
                .body("components.securitySchemes.bearerAuth.scheme", equalTo("bearer"));
    }

    @Test
    void administratorCanQueueSynchronization() {
        given().post("/api/accounts/sync").then().statusCode(401);
        given().auth().oauth2(OidcTestResource.adminToken()).post("/api/accounts/sync").then().statusCode(200)
                .contentType("application/json").body("status", equalTo("QUEUED"));
    }

    @Test
    void localLoginAndCookiesAreNoLongerAccepted() {
        given().contentType("application/json").body(Map.of("username", "admin", "password", "old-password"))
                .post("/api/session/login").then().statusCode(404);
        given().post("/api/session/logout").then().statusCode(404);
        given().post("/api/j_security_check").then().statusCode(404);
        given().cookie("quarkus-credential", "old-cookie").get("/api/accounts").then().statusCode(401);
    }

    @Test
    void onlyDashboardClientAdminRoleAuthorizesChanges() {
        for (var claims : java.util.List.<Map<String, Object>> of(Map.of(),
                Map.of("realm_access", Map.of("roles", java.util.List.of("admin"))),
                Map.of("resource_access", Map.of("other-client", Map.of("roles", java.util.List.of("admin")))),
                Map.of("resource_access", Map.of("dashboard", Map.of("roles", java.util.List.of("viewer")))))) {
            String token = OidcTestResource.token(claims);
            given().auth().oauth2(token).post("/api/accounts/sync").then().statusCode(403);
            given().auth().oauth2(token).get("/api/accounts").then().statusCode(403);
            given().auth().oauth2(token).get("/q/openapi").then().statusCode(403);
        }
    }

    @Test
    void rejectsInvalidExpiredWrongIssuerAndWrongAudienceTokens() {
        given().auth().oauth2("not-a-token").post("/api/accounts/sync").then().statusCode(401);
        String valid = OidcTestResource.adminToken();
        String[] parts = valid.split("\\.");
        parts[2] = (parts[2].startsWith("A") ? "B" : "A") + parts[2].substring(1);
        given().auth().oauth2(String.join(".", parts)).post("/api/accounts/sync").then().statusCode(401);
        given().auth().oauth2(
                OidcTestResource.token(Map.of(), "https://wrong-issuer.example", "dashboard", Instant.now().plusSeconds(300)))
                .post("/api/accounts/sync").then().statusCode(401);
        given().auth().oauth2(OidcTestResource.token(Map.of(), "other-api", Instant.now().plusSeconds(300)))
                .post("/api/accounts/sync").then().statusCode(401);
        String expired = OidcTestResource.token(Map.of(), "dashboard", Instant.now().minusSeconds(300));
        given().auth().oauth2(expired).post("/api/accounts/sync").then().statusCode(401);
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
        given().auth().oauth2(OidcTestResource.adminToken()).when().get("/api/accounts").then().statusCode(200);
        String encrypted = cipher.encrypt("fixture-token-cache");
        assertEquals("fixture-token-cache", cipher.decrypt(encrypted));
        assertThrows(IllegalStateException.class, () -> cipher.decrypt(encrypted.substring(0, encrypted.length() - 4) + "AAAA"));
    }
}