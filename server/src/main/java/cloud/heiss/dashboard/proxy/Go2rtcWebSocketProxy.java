package cloud.heiss.dashboard.proxy;

import io.vertx.core.http.WebSocketConnectOptions;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class Go2rtcWebSocketProxy extends WebSocketProxy {

    @Override
    protected void configure(WebSocketConnectOptions options) {
        options.setAllowOriginHeader(false);
    }
}