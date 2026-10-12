package cloud.heiss.dashboard.proxy;

import io.vertx.core.http.WebSocketConnectOptions;
import jakarta.enterprise.context.ApplicationScoped;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

@ApplicationScoped
public class OpenhabWebSocketProxy extends WebSocketProxy {

    private static final String OPENHAB_WS_ACCESS_TOKEN = "org.openhab.ws.accessToken.base64.";
    private static final String OPENHAB_WS_PROTOCOL = "org.openhab.ws.protocol.default";

    @Override
    protected void configure(WebSocketConnectOptions options) {
        String encoded = Base64.getEncoder().encodeToString(config.openhabToken().orElseThrow().getBytes(StandardCharsets.UTF_8));
        options.setAllowOriginHeader(true).setSubProtocols(List.of(OPENHAB_WS_PROTOCOL, OPENHAB_WS_ACCESS_TOKEN + encoded));
    }
}