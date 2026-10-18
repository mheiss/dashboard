package cloud.heiss.dashboard.proxy;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import io.vertx.core.json.JsonObject;

@QuarkusTest
@QuarkusTestResource(value = IntegrationProxyUpstream.class, restrictToAnnotatedClass = true)
class IntegrationProxyTest {

    @TestHTTPResource
    URI base;

    @Test
    void forwardsOpenhabHttpWithPrivateCredentialsAndPreservesResponse() {
        given().header("Origin", base.toString().replaceFirst("/$", "")).header("Cookie", "dashboard=private")
                .header("Authorization", "browser-token").header("Forwarded", "for=attacker").queryParam("value", "a b&c").when()
                .get("/api/openhab/items/Test/state").then().statusCode(200).header("ETag", "fixture-etag")
                .header("Set-Cookie", nullValue()).header("X-Upstream-Private", nullValue())
                .body("uri", equalTo("/rest/items/Test/state?value=a%20b%26c"))
                .body("authorization", equalTo("fixture-openhab-token")).body("cookie", nullValue())
                .body("forwarded", nullValue()).body("origin", equalTo(base.toString().replaceFirst("/$", "")));
        given().when().get("/api/openhab/error").then().statusCode(418).body("uri", equalTo("/rest/error"));
    }

    @Test
    void streamsRequestsAndGo2rtcResponsesWithoutBrowserCredentialsOrOrigin() {
        given().header("Origin", base.toString().replaceFirst("/$", "")).header("Cookie", "dashboard=private")
                .header("Authorization", "browser-token").contentType("text/plain").body("ON").when()
                .post("/api/webrtc/streams?src=front").then().statusCode(200).body("uri", equalTo("/api/streams?src=front"))
                .body("method", equalTo("POST")).body("body", equalTo("ON")).body("cookie", nullValue())
                .body("authorization", nullValue()).body("origin", nullValue());
        assertArrayEquals(new byte[] { 0, 1, 2, (byte) 255 }, given().when().get("/api/webrtc/frame.jpeg?src=front").then()
                .statusCode(200).contentType("image/jpeg").extract().asByteArray());
        assertEquals("a".repeat(131072) + "b".repeat(131072),
                given().when().get("/api/webrtc/chunked").then().statusCode(200).extract().asString());
    }

    @Test
    void cameraApiValidatesParametersAndForwardsUpstreamErrorsWithoutCredentials() {
        given().get("/api/webrtc/frame.jpeg").then().statusCode(400);
        given().queryParam("src", " ").get("/api/webrtc/frame.jpeg").then().statusCode(400);
        given().header("Connection", "Upgrade").header("Upgrade", "websocket").queryParam("src", "front")
                .get("/api/webrtc/frame.jpeg").then().statusCode(400);
        given().header("Origin", "https://attacker.example").queryParam("src", "front").get("/api/webrtc/frame.jpeg").then()
                .statusCode(403);
        given().header("Origin", base.toString().replaceFirst("/$", "")).header("Cookie", "dashboard=private")
                .header("Authorization", "browser-token").queryParam("src", "upstream-error").queryParam("extra", "a b&c")
                .get("/api/webrtc/frame.jpeg").then().statusCode(418).contentType("application/json")
                .header("Set-Cookie", nullValue()).header("X-Upstream-Private", nullValue())
                .body("uri", equalTo("/api/frame.jpeg?src=upstream-error&extra=a%20b%26c")).body("cookie", nullValue())
                .body("authorization", nullValue()).body("origin", nullValue());
    }

    @Test
    void rejectsCrossSiteRequestsAndApiUpgrades() {
        for (String path : new String[] { "/api/openhab/items/Test", "/api/webrtc/streams" }) {
            given().header("Sec-Fetch-Site", "cross-site").body("ON").when().post(path).then().statusCode(403);
            given().header("Origin", "https://attacker.example").when().get(path).then().statusCode(403);
            given().header("Connection", "Upgrade").header("Upgrade", "websocket").when().get(path).then().statusCode(400);
        }
        given().when().get("/api/ws/webrtc").then().statusCode(426);
        given().when().get("/api/ws/openhab").then().statusCode(426);
        given().when().get("/api/webrtc/disconnect").then().statusCode(502);
    }

    @Test
    void bridgesOpenhabWebsocketWithServerSideAuthentication() throws Exception {
        var listener = new SocketListener();
        WebSocket socket = connect("/api/ws/openhab", base.toString().replaceFirst("/$", ""), listener, true);
        try {
            JsonObject handshake = new JsonObject(listener.texts.poll(10, TimeUnit.SECONDS));
            String encoded = Base64.getEncoder().encodeToString("fixture-openhab-token".getBytes(StandardCharsets.UTF_8));
            assertEquals("/ws", handshake.getString("uri"));
            assertEquals("org.openhab.ws.protocol.default,org.openhab.ws.accessToken.base64." + encoded,
                    handshake.getString("protocols").replace(" ", ""));
            assertEquals(null, handshake.getString("cookie"));
            assertEquals("org.openhab.ws.protocol.default", socket.getSubprotocol());
            assertFalse(socket.getSubprotocol().contains("accessToken"));
            socket.sendText("command", true).get(10, TimeUnit.SECONDS);
            assertEquals("echo:command", listener.texts.poll(10, TimeUnit.SECONDS));
        } finally {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "Done").get(10, TimeUnit.SECONDS);
        }
    }

    @Test
    void bridgesOpenhabWebsocketWithoutBrowserSubprotocol() throws Exception {
        var listener = new SocketListener();
        WebSocket socket = connect("/api/ws/openhab", base.toString().replaceFirst("/$", ""), listener, false);
        try {
            assertEquals("", socket.getSubprotocol());
            JsonObject handshake = new JsonObject(listener.texts.poll(10, TimeUnit.SECONDS));
            assertEquals("/ws", handshake.getString("uri"));
            socket.sendText("command", true).get(10, TimeUnit.SECONDS);
            assertEquals("echo:command", listener.texts.poll(10, TimeUnit.SECONDS));
        } finally {
            socket.sendClose(WebSocket.NORMAL_CLOSURE, "Done").get(10, TimeUnit.SECONDS);
        }
    }

    @Test
    void bridgesGo2rtcTextBinaryAndUpstreamClose() throws Exception {
        var listener = new SocketListener();
        WebSocket socket = connect("/api/ws/webrtc?src=unifi_front", base.toString().replaceFirst("/$", ""), listener, false);
        try {
            assertEquals("", socket.getSubprotocol());
            JsonObject handshake = new JsonObject(listener.texts.poll(10, TimeUnit.SECONDS));
            assertEquals("/api/ws?src=unifi_front", handshake.getString("uri"));
            assertEquals(null, handshake.getString("origin"));
            assertEquals(null, handshake.getString("cookie"));
            assertEquals(null, handshake.getString("authorization"));
            socket.sendText("off", false).get(10, TimeUnit.SECONDS);
            socket.sendText("er", true).get(10, TimeUnit.SECONDS);
            assertEquals("echo:offer", listener.texts.poll(10, TimeUnit.SECONDS));
            byte[] payload = new byte[] { 0, 1, 2, (byte) 255 };
            socket.sendBinary(ByteBuffer.wrap(payload), true).get(10, TimeUnit.SECONDS);
            assertArrayEquals(payload, listener.binary.get(10, TimeUnit.SECONDS));
            socket.sendText("close-upstream", true).get(10, TimeUnit.SECONDS);
            assertEquals(1001, listener.closed.get(10, TimeUnit.SECONDS));
            assertEquals("Fixture closed", listener.closeReason);
        } finally {
            socket.abort();
        }
    }

    @Test
    void rejectsWebsocketFromUnapprovedOrigin() {
        assertThrows(Exception.class,
                () -> connect("/api/ws/webrtc?src=front", "https://attacker.example", new SocketListener(), false));
    }

    private WebSocket connect(String path, String origin, SocketListener listener, boolean openhab) throws Exception {
        var builder = HttpClient.newHttpClient().newWebSocketBuilder().header("Origin", origin)
                .header("Cookie", "dashboard=private").header("Authorization", "browser-token");
        if (openhab) {
            builder.subprotocols("org.openhab.ws.protocol.default");
        }
        URI endpoint = URI.create(base.toString().replaceFirst("^http", "ws")).resolve(path);
        return builder.buildAsync(endpoint, listener).get(10, TimeUnit.SECONDS);
    }

    private static class SocketListener implements WebSocket.Listener {

        final LinkedBlockingQueue<String> texts = new LinkedBlockingQueue<>();
        final CompletableFuture<byte[]> binary = new CompletableFuture<>();
        final CompletableFuture<Integer> closed = new CompletableFuture<>();
        final StringBuilder text = new StringBuilder();
        volatile String closeReason;

        @Override
        public void onOpen(WebSocket socket) {
            socket.request(1);
        }

        @Override
        public CompletableFuture<Void> onText(WebSocket socket, CharSequence data, boolean last) {
            text.append(data);
            if (last) {
                texts.add(text.toString());
                text.setLength(0);
            }
            socket.request(1);
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public CompletableFuture<Void> onBinary(WebSocket socket, ByteBuffer data, boolean last) {
            byte[] bytes = new byte[data.remaining()];
            data.get(bytes);
            binary.complete(bytes);
            socket.request(1);
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public CompletableFuture<Void> onClose(WebSocket socket, int status, String reason) {
            closeReason = reason;
            closed.complete(status);
            return CompletableFuture.completedFuture(null);
        }

        @Override
        public void onError(WebSocket socket, Throwable error) {
            binary.completeExceptionally(error);
            closed.completeExceptionally(error);
        }
    }
}