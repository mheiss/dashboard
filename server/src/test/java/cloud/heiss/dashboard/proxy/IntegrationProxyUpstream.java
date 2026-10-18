package cloud.heiss.dashboard.proxy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import io.vertx.core.Vertx;
import io.vertx.core.buffer.Buffer;
import io.vertx.core.http.HttpServer;
import io.vertx.core.http.HttpServerOptions;
import io.vertx.core.http.ServerWebSocket;
import io.vertx.core.json.JsonObject;

public class IntegrationProxyUpstream implements QuarkusTestResourceLifecycleManager {

    private Vertx vertx;
    private HttpServer server;
    private Path data;
    private final Set<ServerWebSocket> itemSockets = ConcurrentHashMap.newKeySet();
    private final Map<String, String> states = new ConcurrentHashMap<>();
    private final AtomicInteger snapshotRequests = new AtomicInteger();
    private String pinCommand;
    private String commandAuthorization;
    private String snapshotAuthorization;
    private String snapshotCookie;

    @Override
    public Map<String, String> start() {
        try {
            data = Files.createTempDirectory("dashboard-integration-fixture-");
            Files.writeString(data.resolve("config.json"), """
                    {"openhab":{"sitemap":"http://openhab.fixture/basicui",
                    "items":{"security":"Armed","pin":"Pin","doorbell":"Bell"},"doorbellCamera":"front"},
                    "evcc":{"url":"http://evcc.fixture"},"protect":{"cameras":{"front":"Front","back":"Back"}}}
                    """);
        } catch (Exception failure) {
            throw new IllegalStateException("Cannot create integration fixture settings", failure);
        }
        for (String item : List.of("Armed", "Bell", "Front_Camera_Motion", "Front_Camera_SmartMotion", "Back_Camera_Motion",
                "Back_Camera_SmartMotion")) {
            states.put(item, "OFF");
        }
        vertx = Vertx.vertx();
        server = vertx
                .createHttpServer(new HttpServerOptions().setWebSocketSubProtocols(List.of("org.openhab.ws.protocol.default")))
                .requestHandler(request -> {
                    if ("websocket".equalsIgnoreCase(request.getHeader("Upgrade"))) {
                        request.toWebSocket().onSuccess(this::websocket);
                    } else if (request.path().equals("/fixture/event")) {
                        request.body().onSuccess(body -> {
                            JsonObject event = body.toJsonObject();
                            String topic = event.getString("topic");
                            String item = topic.substring("openhab/items/".length(), topic.length() - "/stateupdated".length());
                            states.put(item, new JsonObject(event.getString("payload")).getString("value"));
                            itemSockets.forEach(socket -> socket.writeTextMessage(event.encode()));
                            request.response().end();
                        });
                    } else if (request.path().equals("/fixture/status")) {
                        request.response().putHeader("Content-Type", "application/json")
                                .end(new JsonObject().put("snapshotRequests", snapshotRequests.get()).put("pin", pinCommand)
                                        .put("commandAuthorization", commandAuthorization)
                                        .put("snapshotAuthorization", snapshotAuthorization).put("snapshotCookie", snapshotCookie)
                                        .put("connections", itemSockets.size()).encode());
                    } else if (request.path().equals("/rest/items/Pin")) {
                        request.body().onSuccess(body -> {
                            pinCommand = body.toString();
                            commandAuthorization = request.getHeader("Authorization");
                            if (pinCommand.equals("1234")) {
                                states.put("Armed", "OFF");
                                JsonObject event = new JsonObject().put("type", "ItemStateUpdatedEvent")
                                        .put("topic", "openhab/items/Armed/stateupdated")
                                        .put("payload", new JsonObject().put("value", "OFF").encode());
                                itemSockets.forEach(socket -> socket.writeTextMessage(event.encode()));
                            }
                            request.response().setStatusCode(204).end();
                        });
                    } else if (request.path().startsWith("/rest/items/") && request.path().endsWith("/state")
                            && states.containsKey(request.path().substring("/rest/items/".length(),
                                    request.path().length() - "/state".length()))) {
                        String item = request.path().substring("/rest/items/".length(),
                                request.path().length() - "/state".length());
                        request.response().putHeader("Content-Type", "text/plain").end(states.get(item));
                    } else if (request.path().equals("/api/disconnect")) {
                        request.connection().close();
                    } else if (request.path().equals("/api/frame.jpeg")) {
                        if ("upstream-error".equals(request.getParam("src"))) {
                            request.response().setStatusCode(418).putHeader("Content-Type", "application/json")
                                    .putHeader("Set-Cookie", "upstream-session=secret")
                                    .putHeader("Connection", "x-upstream-private")
                                    .putHeader("X-Upstream-Private", "not-forwarded")
                                    .end(new JsonObject().put("uri", request.uri()).put("cookie", request.getHeader("Cookie"))
                                            .put("authorization", request.getHeader("Authorization"))
                                            .put("origin", request.getHeader("Origin")).encode());
                            return;
                        }
                        snapshotRequests.incrementAndGet();
                        snapshotAuthorization = request.getHeader("Authorization");
                        snapshotCookie = request.getHeader("Cookie");
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
                "fixture-openhab-token", "dashboard.ui-config-file", data.resolve("config.json").toString(),
                "dashboard.media-directory", data.resolve("media").toString());
    }

    private void websocket(ServerWebSocket socket) {
        if (socket.path().equals("/ws")) {
            itemSockets.add(socket);
            socket.closeHandler(_ -> itemSockets.remove(socket));
        }
        socket.writeTextMessage(
                new JsonObject().put("uri", socket.uri()).put("protocols", socket.headers().get("Sec-WebSocket-Protocol"))
                        .put("origin", socket.headers().get("Origin")).put("cookie", socket.headers().get("Cookie"))
                        .put("authorization", socket.headers().get("Authorization")).encode());
        socket.textMessageHandler(message -> {
            if (message.contains("\"WebSocketEvent\"")) {
                return;
            }
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
        if (data != null) {
            try (var paths = Files.walk(data)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                    Files.deleteIfExists(path);
                }
            } catch (Exception failure) {
                throw new IllegalStateException("Cannot remove integration fixture files", failure);
            }
        }
    }
}