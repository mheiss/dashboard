package cloud.heiss.dashboard.security;

import cloud.heiss.dashboard.config.DashboardConfig;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import io.quarkus.vertx.web.RouteFilter;
import io.vertx.ext.web.RoutingContext;

/** Enforces approved browser origins and the dashboard header on unsafe requests, excluding the public webhook. */
@ApplicationScoped
public class BrowserRequestFilter {

    @Inject
    DashboardConfig config;

    @RouteFilter(1000)
    void filter(RoutingContext context) {
        var request = context.request();
        String path = request.path();
        if (path.equals("/graph/webhook")) {
            context.next();
            return;
        }
        if (!(path.equals("/graphql") || path.startsWith("/graphql/") || path.startsWith("/accounts")
                || path.startsWith("/session") || path.startsWith("/media") || path.equals("/j_security_check"))) {
            context.next();
            return;
        }
        String origin = request.getHeader("Origin");
        boolean unsafe = !request.method().name().equals("GET") && !request.method().name().equals("HEAD");
        if ((origin != null && !config.allowedOrigins().contains(origin))
                || (unsafe && !"true".equals(request.getHeader("X-Dashboard-Request")))) {
            context.response().setStatusCode(403).end();
            return;
        }
        context.next();
    }
}