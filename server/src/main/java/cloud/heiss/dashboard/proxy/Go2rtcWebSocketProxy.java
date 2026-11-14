package cloud.heiss.dashboard.proxy;

import io.vertx.core.http.WebSocketConnectOptions;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class Go2rtcWebSocketProxy extends WebSocketProxy {

    private static final int MSE_LIMIT = 8 * 1024 * 1024;

    /** go2rtc sends every MSE fragment, up to a whole keyframe, as a single unfragmented frame. */
    @Override
    protected int maxFrameSize() {
        return MSE_LIMIT;
    }

    @Override
    protected int maxMessageSize() {
        return MSE_LIMIT;
    }

    @Override
    protected void configure(WebSocketConnectOptions options) {
        options.setAllowOriginHeader(false);
    }
}