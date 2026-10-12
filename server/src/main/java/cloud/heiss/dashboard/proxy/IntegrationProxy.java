package cloud.heiss.dashboard.proxy;

import cloud.heiss.dashboard.config.IntegrationProxyConfig;
import io.quarkus.vertx.web.RouteFilter;
import io.vertx.core.MultiMap;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpClient;
import io.vertx.core.http.HttpClientOptions;
import io.vertx.core.http.RequestOptions;
import io.vertx.ext.web.RoutingContext;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

@ApplicationScoped
public class IntegrationProxy {

    private static final Set<String> HOP_HEADERS = Set.of("connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
            "te", "trailer", "transfer-encoding", "upgrade");

    @Inject
    IntegrationProxyConfig config;
    @Inject
    Vertx vertx;
    @Inject
    OpenhabWebSocketProxy openhabSocket;
    @Inject
    Go2rtcWebSocketProxy go2rtcSocket;

    private HttpClient http;

    @PostConstruct
    void initialize() {
        config.openhabUrl().ifPresent(this::validateUpstream);
        config.go2rtcUrl().ifPresent(this::validateUpstream);
        http = vertx.createHttpClient(new HttpClientOptions().setConnectTimeout(config.connectTimeoutMs()));
    }

    @PreDestroy
    void close() {
        if (http != null) {
            http.close();
        }
    }

    @RouteFilter(900)
    void forward(RoutingContext context) {
        String path = context.request().path();
        boolean openhab = matches(path, "/api/openhab") || path.equals("/api/ws/openhab");
        boolean go2rtc = matches(path, "/api/webrtc") || path.equals("/api/ws/webrtc");
        if (!openhab && !go2rtc) {
            context.next();
            return;
        }
        boolean websocketRoute = path.startsWith("/api/ws/");
        boolean upgrade = "websocket".equalsIgnoreCase(context.request().getHeader("Upgrade"));
        if (websocketRoute != upgrade) {
            fail(context, websocketRoute ? 426 : 400);
            return;
        }
        URI upstream = (openhab ? config.openhabUrl() : config.go2rtcUrl()).orElse(null);
        if (upstream == null || (openhab && config.openhabToken().isEmpty())) {
            fail(context, 503);
            return;
        }
        String decodedPath = URI.create(context.request().uri()).getPath();
        if (decodedPath.contains("\\")
                || Arrays.stream(decodedPath.split("/")).anyMatch(segment -> segment.equals(".") || segment.equals(".."))) {
            fail(context, 400);
            return;
        }
        String target = websocketRoute ? (openhab ? "/ws" : "/api/ws")
                : (openhab ? "/rest" + path.substring("/api/openhab".length()) : "/api" + path.substring("/api/webrtc".length()));
        if (context.request().query() != null) {
            target += "?" + context.request().query();
        }
        if (websocketRoute) {
            WebSocketProxy socket = openhab ? openhabSocket : go2rtcSocket;
            socket.forward(context, options(upstream, target), headers(context.request().headers(), true, openhab));
        } else {
            http(context, upstream, target, openhab);
        }
    }

    public static boolean matches(String path, String prefix) {
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }

    private void validateUpstream(URI upstream) {
        if (!("http".equals(upstream.getScheme()) || "https".equals(upstream.getScheme())) || upstream.getHost() == null
                || upstream.getUserInfo() != null || upstream.getQuery() != null || upstream.getFragment() != null
                || !(upstream.getPath().isEmpty() || upstream.getPath().equals("/"))) {
            throw new IllegalArgumentException("Integration proxy upstream must be an HTTP(S) origin without credentials");
        }
    }

    private RequestOptions options(URI upstream, String target) {
        boolean ssl = "https".equals(upstream.getScheme());
        int port = upstream.getPort() == -1 ? (ssl ? 443 : 80) : upstream.getPort();
        return new RequestOptions().setHost(upstream.getHost()).setPort(port).setSsl(ssl).setURI(target)
                .setTimeout(config.requestTimeoutMs());
    }

    private MultiMap headers(MultiMap source, boolean request, boolean openhab) {
        Set<String> excluded = new HashSet<>(HOP_HEADERS);
        for (String connection : source.getAll("Connection")) {
            for (String header : connection.split(",")) {
                excluded.add(header.trim().toLowerCase(Locale.ROOT));
            }
        }
        excluded.addAll(request ? Set.of("host", "cookie", "authorization", "forwarded", "sec-websocket-key",
                "sec-websocket-version", "sec-websocket-protocol", "sec-websocket-extensions") : Set.of("set-cookie"));
        if (!openhab) {
            excluded.add("origin");
        }
        MultiMap result = MultiMap.caseInsensitiveMultiMap();
        source.forEach(entry -> {
            String name = entry.getKey().toLowerCase(Locale.ROOT);
            if (!excluded.contains(name) && !name.startsWith("x-forwarded-")) {
                result.add(entry.getKey(), entry.getValue());
            }
        });
        return result;
    }

    private void http(RoutingContext context, URI upstream, String target, boolean openhab) {
        var incoming = context.request();
        incoming.pause();
        MultiMap outgoingHeaders = headers(incoming.headers(), true, openhab);
        if (openhab) {
            outgoingHeaders.set("Authorization", config.openhabToken().orElseThrow());
        }
        http.request(options(upstream, target).setMethod(incoming.method()).setHeaders(outgoingHeaders)).onSuccess(outgoing -> {
            context.response().closeHandler(ignored -> outgoing.reset());
            if (!outgoingHeaders.contains("Content-Length")) {
                outgoing.setChunked(true);
            }
            outgoing.send(incoming).onSuccess(response -> {
                context.response().setStatusCode(response.statusCode());
                context.response().headers().setAll(headers(response.headers(), false, openhab));
                if (!response.headers().contains("Content-Length")) {
                    context.response().setChunked(true);
                }
                response.pipeTo(context.response()).onFailure(error -> fail(context, 502));
            }).onFailure(error -> fail(context, 502));
        }).onFailure(error -> fail(context, 502));
    }

    private void fail(RoutingContext context, int status) {
        if (context.response().ended() || context.response().closed()) {
            return;
        }
        if (context.response().headWritten()) {
            context.response().close();
        } else {
            context.response().setStatusCode(status).end();
        }
    }
}