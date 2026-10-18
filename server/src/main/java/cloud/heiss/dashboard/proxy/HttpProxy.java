package cloud.heiss.dashboard.proxy;

import java.net.URI;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

import cloud.heiss.dashboard.config.IntegrationProxyConfig;
import io.vertx.core.MultiMap;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpClient;
import io.vertx.core.http.HttpClientOptions;
import io.vertx.core.http.RequestOptions;
import io.vertx.ext.web.RoutingContext;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Inject;

public abstract class HttpProxy {

    private static final Set<String> HOP_HEADERS = Set.of("connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
            "te", "trailer", "transfer-encoding", "upgrade");

    @Inject
    IntegrationProxyConfig config;

    @Inject
    Vertx vertx;

    private HttpClient http;

    @PostConstruct
    void initialize() {
        http = vertx.createHttpClient(new HttpClientOptions().setConnectTimeout(config.connectTimeoutMs()));
    }

    @PreDestroy
    void close() {
        if (http != null) {
            http.close();
        }
    }

    protected void forward(RoutingContext context, URI upstream, String target, WebSocketProxy socket) {
        boolean websocketRoute = socket != null;
        boolean upgrade = "websocket".equalsIgnoreCase(context.request().getHeader("Upgrade"));
        if (websocketRoute != upgrade) {
            fail(context, websocketRoute ? 426 : 400);
            return;
        }
        if (upstream == null) {
            fail(context, 503);
            return;
        }
        String decodedPath = URI.create(context.request().uri()).getPath();
        if (decodedPath.contains("\\")
                || Arrays.stream(decodedPath.split("/")).anyMatch(segment -> segment.equals(".") || segment.equals(".."))) {
            fail(context, 400);
            return;
        }
        if (context.request().query() != null) {
            target += "?" + context.request().query();
        }
        if (websocketRoute) {
            socket.forward(context, options(upstream, target), headers(context.request().headers(), true));
        } else {
            http(context, upstream, target);
        }
    }

    protected boolean matches(String path, String prefix) {
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }

    protected void filterHeaders(MultiMap headers) {
    }

    protected void configureHttpHeaders(MultiMap headers) {
    }

    private RequestOptions options(URI upstream, String target) {
        boolean ssl = "https".equals(upstream.getScheme());
        int port = upstream.getPort() == -1 ? (ssl ? 443 : 80) : upstream.getPort();
        return new RequestOptions().setHost(upstream.getHost()).setPort(port).setSsl(ssl).setURI(target)
                .setTimeout(config.requestTimeoutMs());
    }

    protected MultiMap headers(MultiMap source, boolean request) {
        Set<String> excluded = new HashSet<>(HOP_HEADERS);
        for (String connection : source.getAll("Connection")) {
            for (String header : connection.split(",")) {
                excluded.add(header.trim().toLowerCase(Locale.ROOT));
            }
        }
        excluded.addAll(request ? Set.of("host", "cookie", "authorization", "forwarded", "sec-websocket-key",
                "sec-websocket-version", "sec-websocket-protocol", "sec-websocket-extensions") : Set.of("set-cookie"));
        MultiMap result = MultiMap.caseInsensitiveMultiMap();
        source.forEach(entry -> {
            String name = entry.getKey().toLowerCase(Locale.ROOT);
            if (!excluded.contains(name) && !name.startsWith("x-forwarded-")) {
                result.add(entry.getKey(), entry.getValue());
            }
        });
        filterHeaders(result);
        return result;
    }

    private void http(RoutingContext context, URI upstream, String target) {
        var incoming = context.request();
        incoming.pause();
        MultiMap outgoingHeaders = headers(incoming.headers(), true);
        configureHttpHeaders(outgoingHeaders);
        http.request(options(upstream, target).setMethod(incoming.method()).setHeaders(outgoingHeaders)).onSuccess(outgoing -> {
            context.response().closeHandler(_ -> outgoing.reset());
            if (!outgoingHeaders.contains("Content-Length")) {
                outgoing.setChunked(true);
            }
            outgoing.send(incoming).onSuccess(response -> {
                context.response().setStatusCode(response.statusCode());
                context.response().headers().setAll(headers(response.headers(), false));
                if (!response.headers().contains("Content-Length")) {
                    context.response().setChunked(true);
                }
                response.pipeTo(context.response()).onFailure(_ -> fail(context, 502));
            }).onFailure(_ -> fail(context, 502));
        }).onFailure(_ -> fail(context, 502));
    }

    private void fail(RoutingContext context, int status) {
        if (context.response().ended() || context.response().closed()) {
            return;
        }
        if (context.response().headWritten()) {
            context.response().reset();
        } else {
            context.response().setStatusCode(status).end();
        }
    }
}