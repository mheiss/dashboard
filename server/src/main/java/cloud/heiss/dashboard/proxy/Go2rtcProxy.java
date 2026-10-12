package cloud.heiss.dashboard.proxy;

import io.quarkus.vertx.web.RouteFilter;
import io.vertx.core.MultiMap;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

@ApplicationScoped
public class Go2rtcProxy extends HttpProxy {

    @Inject
    Go2rtcWebSocketProxy socket;

    @RouteFilter(900)
    void forward(RoutingContext context) {
        String path = context.request().path();
        if (matches(path, "/api/webrtc")) {
            forward(context, config.go2rtcUrl().orElse(null), "/api" + path.substring("/api/webrtc".length()), null);
        } else if (path.equals("/api/ws/webrtc")) {
            forward(context, config.go2rtcUrl().orElse(null), "/api/ws", socket);
        } else {
            context.next();
        }
    }

    @Override
    protected void filterHeaders(MultiMap headers) {
        headers.remove("Origin");
    }
}