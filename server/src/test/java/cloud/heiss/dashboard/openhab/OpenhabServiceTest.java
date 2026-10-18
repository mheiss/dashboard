package cloud.heiss.dashboard.openhab;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import cloud.heiss.dashboard.config.IntegrationProxyConfig;
import cloud.heiss.dashboard.proxy.IntegrationProxyUpstream;
import cloud.heiss.dashboard.security.OidcTestResource;
import cloud.heiss.dashboard.sync.DashboardAction;
import cloud.heiss.dashboard.sync.DashboardChanges;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import io.vertx.core.json.JsonObject;
import jakarta.inject.Inject;

/**
 * Exercises backend item handling, GraphQL client actions, private PIN forwarding, and snapshot media with real sockets.
 * A local upstream fixture records connection and capture counts to detect browser-dependent or duplicated work.
 */
@QuarkusTest
@QuarkusTestResource(value = IntegrationProxyUpstream.class, restrictToAnnotatedClass = true)
class OpenhabServiceTest {

    @Inject
    OpenhabService openhab;
    @Inject
    IntegrationProxyConfig proxy;
    @Inject
    DashboardChanges changes;
    @TestHTTPResource
    URI base;

    /**
     * Verifies shared camera actions with one capture, credential isolation, PIN commands, and capture without browser clients.
     * Reconnected clients must receive current gallery data without replaying previous navigation actions.
     *
     * @throws Exception if fixture transport, subscription setup, or event delivery fails
     */
    @Test
    void handlesItemsAndCapturesOnceForAllClientsAndWithoutBrowsers() throws Exception {
        try (var first = new ActionClient(); var second = new ActionClient()) {
            openhab.maintainConnection();
            first.await("SECURITY_STATE");
            second.await("SECURITY_STATE");
            graphql("{ securityArmed }").then().body("data.securityArmed", equalTo(false));
            int before = status().getInteger("snapshotRequests");

            event("Bell", "ON");
            assertEquals("front", first.await("SHOW_CAMERA").getString("camera"));
            assertEquals("front", second.await("SHOW_CAMERA").getString("camera"));
            assertEquals(before, status().getInteger("snapshotRequests"));

            event("Back_Camera_SmartMotion", "ON");
            assertEquals("back", first.await("SHOW_CAMERA").getString("camera"));
            assertEquals("back", second.await("SHOW_CAMERA").getString("camera"));
            first.await("SNAPSHOTS_CHANGED");
            second.await("SNAPSHOTS_CHANGED");
            assertEquals(before + 1, status().getInteger("snapshotRequests"));
            assertEquals(null, status().getString("snapshotAuthorization"));
            assertEquals(null, status().getString("snapshotCookie"));
            var groups = graphql("{ motionGroups { id snapshots { id } preview { camera type url timestamp } } }").then()
                    .body("data.motionGroups.size()", equalTo(1)).body("data.motionGroups[0].preview.camera", equalTo("back"))
                    .body("data.motionGroups[0].preview.type", equalTo("smart")).extract().jsonPath();
            String image = groups.getString("data.motionGroups[0].preview.url");
            assertArrayEquals(new byte[] { 0, 1, 2, (byte) 255 }, given().get(image).then().statusCode(200)
                    .contentType("image/jpeg").header("X-Content-Type-Options", equalTo("nosniff")).extract().asByteArray());

            event("Armed", "ON");
            assertEquals(true, first.await("SECURITY_STATE").getBoolean("armed"));
            second.await("SECURITY_STATE");
            graphql("mutation { submitSecurityPin(pin: \"1234\") }").then().body("data.submitSecurityPin", equalTo(true));
            assertEquals(false, first.await("SECURITY_STATE").getBoolean("armed"));
            second.await("SECURITY_STATE");
            assertEquals("1234", status().getString("pin"));
            assertEquals("fixture-openhab-token", status().getString("commandAuthorization"));
            graphql("mutation { submitSecurityPin(pin: \"not-a-pin\") }").then().body("errors.size()", equalTo(1));
            given().auth().oauth2(OidcTestResource.token(Map.of())).contentType("application/json")
                    .body(Map.of("query", "mutation { submitSecurityPin(pin: \"1234\") }")).post("/api/graphql").then()
                    .statusCode(200).body("errors", equalTo(null)).body("data.submitSecurityPin", equalTo(true));
        }

        var actions = new LinkedBlockingQueue<DashboardAction>();
        var subscriber = changes.actions().subscribe().with(actions::add);
        try {
            assertEquals("SYNC", actions.poll(10, TimeUnit.SECONDS).type());
            int before = status().getInteger("snapshotRequests");
            event("Front_Camera_Motion", "ON");
            assertEquals("SHOW_CAMERA", actions.poll(10, TimeUnit.SECONDS).type());
            assertEquals("SNAPSHOTS_CHANGED", actions.poll(10, TimeUnit.SECONDS).type());
            assertEquals(before + 1, status().getInteger("snapshotRequests"));
            assertEquals(1, status().getInteger("connections"));
        } finally {
            subscriber.cancel();
        }
        try (var reconnected = new ActionClient()) {
            assertEquals(0, reconnected.messages.size());
            graphql("{ motionGroups { snapshots { id } } }").then().body("data.motionGroups[0].snapshots.size()", equalTo(2));
        }
    }

    /**
     * Executes a GraphQL query or mutation against the running dashboard test server.
     *
     * @param query the GraphQL operation
     * @return the HTTP response for assertions
     */
    private io.restassured.response.Response graphql(String query) {
        return given().contentType("application/json").body(Map.of("query", query)).post("/api/graphql");
    }

    /**
     * Makes the upstream fixture emit an item-state event through its active openHAB socket.
     *
     * @param item the updated item name
     * @param value the new item state
     * @throws Exception if the fixture request fails
     */
    private void event(String item, String value) throws Exception {
        String body = new JsonObject().put("type", "ItemStateUpdatedEvent")
                .put("topic", "openhab/items/" + item + "/stateupdated")
                .put("payload", new JsonObject().put("type", "OnOff").put("value", value).encode()).encode();
        try (var http = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(proxy.openhabUrl().orElseThrow().resolve("/fixture/event"))
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            assertEquals(200, http.send(request, HttpResponse.BodyHandlers.discarding()).statusCode());
        }
    }

    /**
     * Reads fixture counters and recorded headers used to verify capture ownership and credential isolation.
     *
     * @return the upstream fixture's current observations
     * @throws Exception if fixture status cannot be retrieved
     */
    private JsonObject status() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            return new JsonObject(
                    http.send(HttpRequest.newBuilder(proxy.openhabUrl().orElseThrow().resolve("/fixture/status")).GET().build(),
                            HttpResponse.BodyHandlers.ofString()).body());
        }
    }

    /**
     * Represents one browser-like GraphQL action subscriber with a queue of complete protocol messages.
     */
    private class ActionClient implements WebSocket.Listener, AutoCloseable {

        private final HttpClient http = HttpClient.newHttpClient();
        private final LinkedBlockingQueue<JsonObject> messages = new LinkedBlockingQueue<>();
        private final StringBuilder text = new StringBuilder();
        private final WebSocket socket;

        /**
         * Opens a GraphQL transport socket, initializes it, and subscribes through the initial SYNC action.
         *
         * @throws Exception if connection or subscription initialization fails
         */
        private ActionClient() throws Exception {
            URI endpoint = URI.create(base.toString().replaceFirst("^http", "ws")).resolve("/api/graphql");
            socket = http.newWebSocketBuilder().subprotocols("graphql-transport-ws").buildAsync(endpoint, this).get(10,
                    TimeUnit.SECONDS);
            socket.sendText(new JsonObject().put("type", "connection_init").encode(), true).get(10, TimeUnit.SECONDS);
            assertEquals("connection_ack", messages.poll(10, TimeUnit.SECONDS).getString("type"));
            socket.sendText(new JsonObject().put("id", "actions").put("type", "subscribe")
                    .put("payload", new JsonObject().put("query", "subscription { dashboardAction { type camera armed } }"))
                    .encode(), true).get(10, TimeUnit.SECONDS);
            await("SYNC");
        }

        /**
         * Waits up to ten seconds for an action type, consuming unrelated actions and asserting valid GraphQL messages.
         *
         * @param type the expected dashboard action type
         * @return the matching action payload
         * @throws Exception if waiting is interrupted
         */
        private JsonObject await(String type) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
            while (System.nanoTime() < deadline) {
                JsonObject message = messages.poll(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertNotNull(message, "Missing dashboard action " + type);
                assertEquals("next", message.getString("type"), message.encode());
                JsonObject action = message.getJsonObject("payload").getJsonObject("data").getJsonObject("dashboardAction");
                if (type.equals(action.getString("type"))) {
                    return action;
                }
            }
            throw new AssertionError("Missing dashboard action " + type);
        }

        /**
         * Requests the first WebSocket message when the transport opens.
         *
         * @param socket the newly connected transport
         */
        @Override
        public void onOpen(WebSocket socket) {
            socket.request(1);
        }

        /**
         * Assembles fragmented JSON messages and queues each complete message for test assertions.
         *
         * @param socket the transport delivering the fragment
         * @param data the current text fragment
         * @param last whether this fragment completes the message
         * @return an already completed stage after queuing the message when complete
         */
        @Override
        public CompletableFuture<Void> onText(WebSocket socket, CharSequence data, boolean last) {
            text.append(data);
            if (last) {
                messages.add(new JsonObject(text.toString()));
                text.setLength(0);
            }
            socket.request(1);
            return CompletableFuture.completedFuture(null);
        }

        /**
         * Aborts the browser-like socket and releases its HTTP client to exercise disconnected-client behavior.
         */
        @Override
        public void close() {
            socket.abort();
            http.shutdownNow();
        }
    }
}