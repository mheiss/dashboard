package cloud.heiss.dashboard.proxy;

import java.net.URI;

import io.quarkus.vertx.web.RouteFilter;
import io.vertx.core.MultiMap;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class OpenhabProxy extends HttpProxy {

    @Inject
    OpenhabWebSocketProxy socket;

    @RouteFilter(0)
    void forward(RoutingContext context) {
        String path = context.request().path();
        if (matches(path, "/api/openhab")) {
            forward(context, upstream(), "/rest" + path.substring("/api/openhab".length()), null);
        } else if (path.equals("/api/ws/openhab")) {
            forward(context, upstream(), "/ws", socket);
        } else {
            context.next();
        }
    }

    private URI upstream() {
        return config.openhabToken().isPresent() ? config.openhabUrl().orElse(null) : null;
    }

    @Override
    protected void configureHttpHeaders(MultiMap headers) {
        headers.set("Authorization", config.openhabToken().orElseThrow());
    }
}