package cloud.heiss.dashboard.security;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;

import io.vertx.core.http.HttpMethod;
import io.vertx.core.http.HttpServerRequest;
import io.vertx.core.http.HttpServerResponse;
import io.vertx.ext.web.RoutingContext;

class BrowserRequestFilterTest {

    @Test
    void acceptsSecureWebsocketOriginsWithForwardedSchemesAndPorts() {
        assertOrigin("https://dashboard.home.arpa", "wss://dashboard.home.arpa", true, true);
        assertOrigin("https://dashboard.home.arpa", "wss://dashboard.home.arpa:443", true, true);
        assertOrigin("https://dashboard.home.arpa:443", "wss://dashboard.home.arpa", true, true);
        assertOrigin("https://dashboard.home.arpa:8443", "wss://dashboard.home.arpa:8443", true, true);
        assertOrigin("https://dashboard.home.arpa", "https://dashboard.home.arpa", true, true);
    }

    @Test
    void acceptsPlainWebsocketOriginsWithForwardedSchemesAndPorts() {
        assertOrigin("http://dashboard.home.arpa", "ws://dashboard.home.arpa", true, true);
        assertOrigin("http://dashboard.home.arpa", "ws://dashboard.home.arpa:80", true, true);
        assertOrigin("http://dashboard.home.arpa:8080", "ws://dashboard.home.arpa:8080", true, true);
        assertOrigin("http://dashboard.home.arpa", "http://dashboard.home.arpa", true, true);
    }

    @Test
    void rejectsMismatchedAndInvalidWebsocketOrigins() {
        assertOrigin("http://dashboard.home.arpa", "wss://dashboard.home.arpa", true, false);
        assertOrigin("https://dashboard.home.arpa", "ws://dashboard.home.arpa", true, false);
        assertOrigin("https://attacker.home.arpa", "wss://dashboard.home.arpa", true, false);
        assertOrigin("https://dashboard.home.arpa:8443", "wss://dashboard.home.arpa", true, false);
        assertOrigin("https://dashboard.home.arpa", "wss://dashboard.home.arpa:8443", true, false);
        assertOrigin("https://user@dashboard.home.arpa", "wss://dashboard.home.arpa", true, false);
        assertOrigin("null", "wss://dashboard.home.arpa", true, false);
        assertOrigin("not an origin", "wss://dashboard.home.arpa", true, false);
    }

    @Test
    void preservesOrdinaryHttpOriginChecks() {
        assertOrigin("https://dashboard.home.arpa", "https://dashboard.home.arpa", false, true);
        assertOrigin("https://dashboard.home.arpa", "http://dashboard.home.arpa", false, false);
        assertOrigin("https://dashboard.home.arpa", "wss://dashboard.home.arpa", false, false);
        assertOrigin("http://dashboard.home.arpa", "ws://dashboard.home.arpa", false, false);
    }

    private void assertOrigin(String origin, String target, boolean websocket, boolean accepted) {
        for (String path : List.of("/api/graphql", "/api/ws/webrtc")) {
            var context = mock(RoutingContext.class);
            var request = mock(HttpServerRequest.class);
            var response = mock(HttpServerResponse.class);
            when(context.request()).thenReturn(request);
            when(context.response()).thenReturn(response);
            when(request.path()).thenReturn(path);
            when(request.method()).thenReturn(HttpMethod.GET);
            when(request.absoluteURI()).thenReturn(target + path);
            when(request.getHeader("Origin")).thenReturn(origin);
            when(request.getHeader("Upgrade")).thenReturn(websocket ? "websocket" : null);
            when(response.setStatusCode(403)).thenReturn(response);

            new BrowserRequestFilter().filter(context);

            if (accepted) {
                verify(context).next();
                verify(response, never()).setStatusCode(anyInt());
            } else {
                verify(context, never()).next();
                verify(response).setStatusCode(403);
                verify(response).end();
            }
        }
    }
}