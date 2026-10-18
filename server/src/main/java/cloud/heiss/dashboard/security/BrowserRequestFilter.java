package cloud.heiss.dashboard.security;

import java.net.URI;

import io.quarkus.vertx.web.RouteFilter;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.context.ApplicationScoped;

/** Rejects cross-origin browser API requests while allowing the public webhook and OAuth callback navigation. */
@ApplicationScoped
public class BrowserRequestFilter {

    @RouteFilter(1000)
    void filter(RoutingContext context) {
        var request = context.request();
        String path = request.path();
        if (path.equals("/api/graph/webhook") || !(path.equals("/api") || path.startsWith("/api/"))) {
            context.next();
            return;
        }
        String origin = request.getHeader("Origin");
        boolean unsafe = !request.method().name().equals("GET") && !request.method().name().equals("HEAD");
        boolean websocket = "websocket".equalsIgnoreCase(request.getHeader("Upgrade"));
        String site = request.getHeader("Sec-Fetch-Site");
        String referer = request.getHeader("Referer");
        if ((origin != null && !sameOrigin(origin, request)) || ((unsafe || websocket) && ("cross-site".equals(site)
                || "same-site".equals(site) || (origin == null && referer != null && !sameOrigin(referer, request))))) {
            context.response().setStatusCode(403).end();
            return;
        }
        context.next();
    }

    private boolean sameOrigin(String value, HttpServerRequest request) {
        try {
            URI source = URI.create(value);
            URI target = URI.create(request.absoluteURI());
            String targetScheme = target.getScheme();
            if ("websocket".equalsIgnoreCase(request.getHeader("Upgrade"))) {
                if ("wss".equalsIgnoreCase(targetScheme)) {
                    targetScheme = "https";
                } else if ("ws".equalsIgnoreCase(targetScheme)) {
                    targetScheme = "http";
                }
            }
            return source.getHost() != null && source.getUserInfo() == null && source.getHost().equalsIgnoreCase(target.getHost())
                    && targetScheme.equalsIgnoreCase(source.getScheme()) && port(source) == port(target);
        } catch (IllegalArgumentException exception) {
            return false;
        }
    }

    private int port(URI uri) {
        return uri.getPort() == -1
                ? (("https".equalsIgnoreCase(uri.getScheme()) || "wss".equalsIgnoreCase(uri.getScheme())) ? 443 : 80)
                : uri.getPort();
    }
}