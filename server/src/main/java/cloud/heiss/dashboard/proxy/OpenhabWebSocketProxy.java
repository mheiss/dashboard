package cloud.heiss.dashboard.proxy;

import io.quarkus.vertx.http.HttpServerOptionsCustomizer;
import io.vertx.core.http.HttpServerOptions;
import io.vertx.core.http.WebSocketConnectOptions;
import jakarta.enterprise.context.ApplicationScoped;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

@ApplicationScoped
public class OpenhabWebSocketProxy extends WebSocketProxy implements HttpServerOptionsCustomizer {

    private static final String OPENHAB_WS_ACCESS_TOKEN = "org.openhab.ws.accessToken.base64.";
    private static final String OPENHAB_WS_PROTOCOL = "org.openhab.ws.protocol.default";

    @Override
    protected void configure(WebSocketConnectOptions options) {
        String encoded = Base64.getEncoder().encodeToString(config.openhabToken().orElseThrow().getBytes(StandardCharsets.UTF_8));
        options.setAllowOriginHeader(true).setSubProtocols(List.of(OPENHAB_WS_PROTOCOL, OPENHAB_WS_ACCESS_TOKEN + encoded));
    }

    @Override
    public void customizeHttpServer(HttpServerOptions options) {
        configureSubProtocols(options);
    }

    @Override
    public void customizeHttpsServer(HttpServerOptions options) {
        configureSubProtocols(options);
    }

    @Override
    public void customizeDomainSocketServer(HttpServerOptions options) {
        configureSubProtocols(options);
    }

    private void configureSubProtocols(HttpServerOptions options) {
        var protocols = new ArrayList<>(options.getWebSocketSubProtocols());
        if (!protocols.contains(OPENHAB_WS_PROTOCOL)) {
            protocols.add(OPENHAB_WS_PROTOCOL);
            options.setWebSocketSubProtocols(protocols);
        }
    }
}