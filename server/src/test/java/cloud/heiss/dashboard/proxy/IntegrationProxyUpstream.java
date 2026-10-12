package cloud.heiss.dashboard.proxy;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.http.HttpServer;
import io.vertx.core.http.HttpServerOptions;
import io.vertx.core.http.ServerWebSocket;
import io.vertx.core.json.JsonObject;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public class IntegrationProxyUpstream implements QuarkusTestResourceLifecycleManager {

    private Vertx vertx;
    private HttpServer server;

    @Override
    public Map<String, String> start() {
        vertx = Vertx.vertx();
        server = vertx
                .createHttpServer(new HttpServerOptions().setWebSocketSubProtocols(List.of("org.openhab.ws.protocol.default")))
                .requestHandler(request -> {
                    if ("websocket".equalsIgnoreCase(request.getHeader("Upgrade"))) {
                        request.toWebSocket().onSuccess(this::websocket);
                    } else if (request.path().equals("/api/disconnect")) {
                        request.connection().close();
                    } else if (request.path().equals("/api/frame.jpeg")) {
                        request.response().putHeader("Content-Type", "image/jpeg")
                                .end(Buffer.buffer(new byte[] { 0, 1, 2, (byte) 255 }));
                    } else if (request.path().equals("/api/chunked")) {
                        request.response().setChunked(true).write("a".repeat(131072));
                        request.response().end("b".repeat(131072));
                    } else {
                        request.body().onSuccess(body -> {
                            JsonObject result = new JsonObject().put("uri", request.uri()).put("method", request.method().name())
                                    .put("body", body.toString()).put("authorization", request.getHeader("Authorization"))
                                    .put("cookie", request.getHeader("Cookie")).put("origin", request.getHeader("Origin"))
                                    .put("forwarded", request.getHeader("Forwarded"));
                            request.response().setStatusCode(request.path().equals("/rest/error") ? 418 : 200)
                                    .putHeader("Content-Type", "application/json").putHeader("ETag", "fixture-etag")
                                    .putHeader("Set-Cookie", "upstream-session=secret")
                                    .putHeader("Connection", "x-upstream-private")
                                    .putHeader("X-Upstream-Private", "not-forwarded").end(result.encode());
                        });
                    }
                });
        try {
            server.listen(0, "127.0.0.1").toCompletionStage().toCompletableFuture().get(10, TimeUnit.SECONDS);
        } catch (Exception exception) {
            stop();
            throw new IllegalStateException("Cannot start proxy fixture", exception);
        }
        String url = "http://127.0.0.1:" + server.actualPort();
        return Map.of("dashboard.proxy.openhab-url", url, "dashboard.proxy.go2rtc-url", url, "dashboard.proxy.openhab-token",
                "fixture-openhab-token");
    }

    private void websocket(ServerWebSocket socket) {
        socket.writeTextMessage(
                new JsonObject().put("uri", socket.uri()).put("protocols", socket.headers().get("Sec-WebSocket-Protocol"))
                        .put("origin", socket.headers().get("Origin")).put("cookie", socket.headers().get("Cookie"))
                        .put("authorization", socket.headers().get("Authorization")).encode());
        socket.textMessageHandler(message -> {
            if (message.equals("close-upstream")) {
                socket.close((short) 1001, "Fixture closed");
            } else {
                socket.writeTextMessage("echo:" + message);
            }
        });
        socket.binaryMessageHandler(socket::writeBinaryMessage);
    }

    @Override
    public void stop() {
        if (vertx != null) {
            try {
                vertx.close().toCompletionStage().toCompletableFuture().get(10, TimeUnit.SECONDS);
            } catch (Exception exception) {
                throw new IllegalStateException("Cannot stop proxy fixture", exception);
            }
        }
    }
}