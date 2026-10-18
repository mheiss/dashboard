package cloud.heiss.dashboard.proxy;

import org.jboss.logging.Logger;

import cloud.heiss.dashboard.config.IntegrationProxyConfig;
import io.vertx.core.MultiMap;
import io.vertx.core.Vertx;
import io.vertx.core.http.RequestOptions;
import io.vertx.core.http.WebSocketBase;
import io.vertx.core.http.WebSocketClient;
import io.vertx.core.http.WebSocketClientOptions;
import io.vertx.core.http.WebSocketConnectOptions;
import io.vertx.core.http.WebSocketFrameType;
import io.vertx.ext.web.RoutingContext;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.inject.Inject;

public abstract class WebSocketProxy {

    private static final Logger LOG = Logger.getLogger(WebSocketProxy.class);

    @Inject
    IntegrationProxyConfig config;

    @Inject
    Vertx vertx;

    private WebSocketClient sockets;

    @PostConstruct
    void initialize() {
        sockets = vertx.createWebSocketClient(new WebSocketClientOptions().setConnectTimeout(config.connectTimeoutMs())
                .setMaxFrameSize(65536).setMaxMessageSize(1048576));
    }

    @PreDestroy
    void close() {
        if (sockets != null) {
            sockets.close();
        }
    }

    void forward(RoutingContext context, RequestOptions requestOptions, MultiMap headers) {
        context.request().pause();
        var options = new WebSocketConnectOptions().setHost(requestOptions.getHost()).setPort(requestOptions.getPort())
                .setSsl(requestOptions.isSsl()).setURI(requestOptions.getURI()).setTimeout(config.connectTimeoutMs())
                .setHeaders(headers);
        configure(options);
        sockets.connect(options).onSuccess(upstreamSocket -> {
            upstreamSocket.pause();
            context.request().toWebSocket().onSuccess(browserSocket -> {
                String path = context.request().path();
                LOG.debugf("WebSocket proxy connected for %s to %s:%d", path, options.getHost(), options.getPort());
                bridge(browserSocket, upstreamSocket, path, "browser to upstream");
                bridge(upstreamSocket, browserSocket, path, "upstream to browser");
                browserSocket.resume();
                upstreamSocket.resume();
            }).onFailure(error -> {
                LOG.warnf(error, "Browser WebSocket upgrade failed for %s", context.request().path());
                upstreamSocket.close();
                fail(context);
            });
        }).onFailure(error -> {
            LOG.warnf(error, "Upstream WebSocket connection failed for %s to %s:%d", context.request().path(), options.getHost(),
                    options.getPort());
            fail(context);
        });
    }

    protected abstract void configure(WebSocketConnectOptions options);

    private void bridge(WebSocketBase source, WebSocketBase destination, String path, String direction) {
        destination.setWriteQueueMaxSize(65536);
        destination.drainHandler(_ -> source.resume());
        source.frameHandler(frame -> {
            if (frame.isClose() || frame.isPing() || frame.type() == WebSocketFrameType.PONG) {
                return;
            }
            destination.writeFrame(frame).onFailure(error -> {
                LOG.warnf(error, "WebSocket frame forwarding failed for %s (%s)", path, direction);
                source.close((short) 1011, "Proxy connection failed");
                destination.close((short) 1011, "Proxy connection failed");
            });
            if (destination.writeQueueFull()) {
                source.pause();
            }
        });
        source.exceptionHandler(error -> {
            LOG.warnf(error, "WebSocket connection failed for %s (%s)", path, direction);
            source.close((short) 1011, "Proxy connection failed");
            destination.close((short) 1011, "Proxy connection failed");
        });
        source.closeHandler(_ -> {
            Short status = source.closeStatusCode();
            if (!destination.isClosed()) {
                if (status == null || status == 1005 || status == 1006 || status == 1015) {
                    destination.close();
                } else {
                    destination.close(status, source.closeReason() == null ? "" : source.closeReason());
                }
            }
        });
    }

    private void fail(RoutingContext context) {
        if (context.response().ended() || context.response().closed()) {
            return;
        }
        if (context.response().headWritten()) {
            context.response().reset();
        } else {
            context.response().setStatusCode(502).end();
        }
    }
}