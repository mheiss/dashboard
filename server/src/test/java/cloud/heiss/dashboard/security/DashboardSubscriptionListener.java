package cloud.heiss.dashboard.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.http.WebSocket;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;

/** Test listener that completes the GraphQL WebSocket handshake and captures a subscription payload. */
final class DashboardSubscriptionListener implements WebSocket.Listener {

    private final ObjectMapper mapper;
    private final CompletableFuture<JsonNode> received;
    private final StringBuilder frame = new StringBuilder();

    DashboardSubscriptionListener(ObjectMapper mapper, CompletableFuture<JsonNode> received) {
        this.mapper = mapper;
        this.received = received;
    }

    @Override
    public void onOpen(WebSocket socket) {
        socket.request(1);
        socket.sendText("{\"type\":\"connection_init\"}", true);
    }

    @Override
    public CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last) {
        frame.append(data);
        if (last) {
            try {
                JsonNode message = mapper.readTree(frame.toString());
                if (message.path("type").asText().equals("connection_ack")) {
                    socket.sendText("""
                            {"id":"fixture","type":"subscribe","payload":{"query":
                            "subscription { dashboardChanged { dataset revision timestamp } }"}}
                            """, true);
                } else if (message.path("type").asText().equals("next")) {
                    received.complete(message.path("payload"));
                } else if (message.path("type").asText().equals("error")) {
                    received.completeExceptionally(new IllegalStateException("Subscription rejected"));
                }
            } catch (Exception exception) {
                received.completeExceptionally(exception);
            }
            frame.setLength(0);
        }
        socket.request(1);
        return null;
    }

    @Override
    public void onError(WebSocket socket, Throwable error) {
        received.completeExceptionally(error);
    }
}