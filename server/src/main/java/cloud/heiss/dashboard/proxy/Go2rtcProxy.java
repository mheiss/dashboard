package cloud.heiss.dashboard.proxy;

import java.io.IOException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import cloud.heiss.dashboard.api.CameraApi;
import io.quarkus.vertx.web.RouteFilter;
import io.smallrye.common.annotation.Blocking;
import io.vertx.core.MultiMap;
import io.vertx.core.http.HttpMethod;
import io.vertx.ext.web.RoutingContext;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

@ApplicationScoped
@Path("/")
public class Go2rtcProxy extends HttpProxy implements CameraApi {

    @Inject
    Go2rtcWebSocketProxy socket;
    @Inject
    RoutingContext requestContext;

    private HttpClient frames;

    @PostConstruct
    void initializeFrames() {
        frames = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(config.connectTimeoutMs()))
                .version(HttpClient.Version.HTTP_1_1).followRedirects(HttpClient.Redirect.NEVER).build();
    }

    @PreDestroy
    void closeFrames() {
        frames.close();
    }

    @Override
    @Blocking
    public Response getCameraFrame(String src) {
        if (src == null || src.isBlank() || "websocket".equalsIgnoreCase(requestContext.request().getHeader("Upgrade"))) {
            return Response.status(400).build();
        }
        var upstream = config.go2rtcUrl().orElse(null);
        if (upstream == null) {
            return Response.status(503).build();
        }
        String query = requestContext.request().query();
        var outgoing = HttpRequest.newBuilder(upstream.resolve("/api/frame.jpeg" + (query == null ? "" : "?" + query)))
                .timeout(Duration.ofMillis(config.requestTimeoutMs())).GET();
        var requestHeaders = headers(requestContext.request().headers(), true);
        requestHeaders.remove("Content-Length");
        requestHeaders.remove("Expect");
        requestHeaders.forEach(header -> outgoing.header(header.getKey(), header.getValue()));
        try {
            var incoming = frames.send(outgoing.build(), HttpResponse.BodyHandlers.ofInputStream());
            var response = Response.status(incoming.statusCode()).entity(incoming.body());
            var responseHeaders = MultiMap.caseInsensitiveMultiMap();
            incoming.headers().map().forEach(responseHeaders::add);
            headers(responseHeaders, false).forEach(header -> response.header(header.getKey(), header.getValue()));
            return response.build();
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            return Response.status(502).build();
        } catch (IOException failure) {
            return Response.status(502).build();
        }
    }

    @RouteFilter(900)
    void forward(RoutingContext context) {
        String path = context.request().path();
        if (path.equals("/api/webrtc/frame.jpeg") && context.request().method() == HttpMethod.GET) {
            context.next();
        } else if (matches(path, "/api/webrtc")) {
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