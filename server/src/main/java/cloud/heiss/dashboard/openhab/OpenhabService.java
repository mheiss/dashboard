package cloud.heiss.dashboard.openhab;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Objects;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.jboss.logging.Logger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.config.CameraConfig;
import cloud.heiss.dashboard.config.IntegrationProxyConfig;
import cloud.heiss.dashboard.protect.MotionSnapshots;
import cloud.heiss.dashboard.sync.DashboardAction;
import cloud.heiss.dashboard.sync.DashboardChanges;
import io.quarkus.runtime.Startup;
import io.quarkus.scheduler.Scheduled;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.ServiceUnavailableException;

/**
 * Owns one authenticated openHAB event connection for the entire dashboard.
 * Publishes interpreted client actions and captures motion images on a separate bounded worker queue, even without browsers.
 */
@Startup
@ApplicationScoped
public class OpenhabService {

    private static final Logger LOG = Logger.getLogger(OpenhabService.class);
    private static final String PROTOCOL = "org.openhab.ws.protocol.default";
    private static final String HEARTBEAT = """
            {"type":"WebSocketEvent","topic":"openhab/websocket/heartbeat","payload":"PING","source":"Dashboard"}
            """;

    @Inject
    DashboardConfig config;
    @Inject
    IntegrationProxyConfig proxy;
    @Inject
    ObjectMapper mapper;
    @Inject
    MotionSnapshots snapshots;
    @Inject
    DashboardChanges changes;

    private final AtomicReference<WebSocket> socket = new AtomicReference<>();
    private final AtomicBoolean connecting = new AtomicBoolean();
    private final ExecutorService initialization = Executors.newSingleThreadExecutor();
    private final ExecutorService captures = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(32));
    private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
    private HttpClient http;
    private volatile boolean stopped;
    volatile OpenhabItems items;

    /**
     * Creates the upstream HTTP client, loads initial item mappings, and cleans the persisted snapshot store.
     * Item-configuration and snapshot-cleanup failures are logged without preventing application startup.
     */
    @PostConstruct
    void initialize() {
        http = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(proxy.connectTimeoutMs())).build();
        try {
            items = loadItems();
            snapshots.prune();
        } catch (RuntimeException failure) {
            LOG.warn("Cannot initialize openHAB item handling", failure);
        }
    }

    /**
     * Sends a heartbeat to the current connection or starts an authenticated connection when none exists.
     * Each connection attempt reloads item mappings; concurrent attempts and connections during shutdown are suppressed.
     */
    @Scheduled(every = "5s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    public void maintainConnection() {
        if (stopped || proxy.openhabUrl().isEmpty() || proxy.openhabToken().isEmpty()) {
            return;
        }
        WebSocket current = socket.get();
        if (current != null) {
            current.sendText(HEARTBEAT, true).exceptionally(failure -> {
                current.abort();
                socket.compareAndSet(current, null);
                LOG.warn("openHAB heartbeat failed", failure);
                return null;
            });
            return;
        }
        if (!connecting.compareAndSet(false, true)) {
            return;
        }
        try {
            OpenhabItems configured = loadItems();
            URI endpoint = URI.create(proxy.openhabUrl().orElseThrow().toString().replaceFirst("^http", "ws")).resolve("/ws");
            String token = Base64.getEncoder()
                    .encodeToString(proxy.openhabToken().orElseThrow().getBytes(StandardCharsets.UTF_8));
            http.newWebSocketBuilder().connectTimeout(Duration.ofMillis(proxy.connectTimeoutMs()))
                    .subprotocols(PROTOCOL, "org.openhab.ws.accessToken.base64." + token)
                    .buildAsync(endpoint, new Listener(configured)).whenComplete((connected, failure) -> {
                        connecting.set(false);
                        if (failure != null) {
                            LOG.warn("Backend openHAB connection failed", failure);
                        } else if (stopped) {
                            connected.abort();
                        }
                    });
        } catch (RuntimeException failure) {
            connecting.set(false);
            LOG.warn("Cannot configure backend openHAB connection", failure);
        }
    }

    /**
     * Reads the current security state from the shared item model.
     *
     * @return the armed flag, or null before configuration or security state is available
     */
    public Boolean securityArmed() {
        OpenhabItems current = items;
        return current == null ? null : current.securityState();
    }

    /**
     * Validates and posts a PIN command to openHAB using the backend token and configured request timeout.
     *
     * @param pin a numeric PIN of one to 32 digits
     * @return true for an upstream 2xx response
     * @throws BadRequestException if the PIN format is invalid
     * @throws ServiceUnavailableException if configuration is missing or the command fails, is rejected, or is interrupted
     */
    public boolean submitPin(String pin) {
        if (pin == null || !pin.matches("[0-9]{1,32}")) {
            throw new BadRequestException("Invalid PIN format");
        }
        OpenhabItems current = items;
        if (current == null || current.pinItem().isEmpty() || proxy.openhabUrl().isEmpty() || proxy.openhabToken().isEmpty()) {
            throw new ServiceUnavailableException("openHAB is unavailable");
        }
        var request = authenticated(proxy.openhabUrl().orElseThrow().resolve("/rest/items/" + segment(current.pinItem())))
                .header("Content-Type", "text/plain; charset=UTF-8").POST(HttpRequest.BodyPublishers.ofString(pin)).build();
        try {
            var response = http.send(request, HttpResponse.BodyHandlers.discarding());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ServiceUnavailableException("openHAB rejected the command");
            }
            return true;
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw new ServiceUnavailableException("openHAB command interrupted");
        } catch (IOException failure) {
            throw new ServiceUnavailableException("openHAB command failed");
        }
    }

    /**
     * Interprets tracked item-state events, publishes security or camera actions, and queues motion snapshots.
     * Doorbell actions do not capture images; unsupported events are ignored and malformed messages are logged.
     *
     * @param message a complete openHAB event encoded as JSON
     */
    void process(String message) {
        try {
            JsonNode event = mapper.readTree(message);
            if (event == null || !"ItemStateUpdatedEvent".equals(event.path("type").asText())) {
                return;
            }
            String topic = event.path("topic").asText();
            String prefix = "openhab/items/";
            String suffix = "/stateupdated";
            if (!topic.startsWith(prefix) || !topic.endsWith(suffix) || topic.length() <= prefix.length() + suffix.length()) {
                return;
            }
            OpenhabItems current = items;
            if (current == null) {
                return;
            }
            String item = topic.substring(prefix.length(), topic.length() - suffix.length());
            if (!current.itemNames().contains(item)) {
                return;
            }
            JsonNode payload = event.path("payload");
            if (payload.isTextual()) {
                payload = mapper.readTree(payload.asText());
            }
            if (payload == null || !payload.path("value").isTextual()) {
                return;
            }
            Boolean previous = current.securityState();
            CameraAction action = current.update(item, payload.path("value").asText());
            if (item.equals(current.securityItem()) && !Objects.equals(previous, current.securityState())) {
                changes.action(new DashboardAction("SECURITY_STATE", null, current.securityState()));
            }
            if (action != null) {
                changes.action(new DashboardAction("SHOW_CAMERA", action.camera(), null));
                if (!action.reason().equals("doorbell")) {
                    long timestamp = System.currentTimeMillis();
                    try {
                        captures.execute(() -> capture(action, timestamp));
                    } catch (RejectedExecutionException failure) {
                        LOG.warnf("Snapshot queue full for camera %s", action.camera());
                    }
                }
            }
        } catch (IOException | RuntimeException failure) {
            LOG.warn("Ignoring invalid openHAB item event");
        }
    }

    /**
     * Constructs a fresh item-state model from runtime properties.
     *
     * @return the configured item mappings with no initialized states
     */
    private OpenhabItems loadItems() {
        var openhab = config.openhab();
        return new OpenhabItems(openhab.items().security().orElse(""), openhab.items().pin().orElse(""),
                openhab.items().doorbell().orElse(""), openhab.doorbellCamera().orElse(""),
                config.protect().cameras().stream().map(CameraConfig::id).toList());
    }

    /**
     * Seeds tracked states through bounded REST reads without generating motion actions or overwriting live updates.
     * Stops when the model is replaced or the service shuts down, and publishes security state after initialization.
     *
     * @param current the model belonging to the active connection
     */
    private void loadStates(OpenhabItems current) {
        for (String item : current.itemNames()) {
            if (stopped || items != current) {
                return;
            }
            var request = authenticated(proxy.openhabUrl().orElseThrow().resolve("/rest/items/" + segment(item) + "/state")).GET()
                    .build();
            try {
                var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
                try (InputStream input = response.body()) {
                    requireSuccess(response.statusCode());
                    current.initialize(item,
                            new String(read(input, 4096, proxy.requestTimeoutMs()), StandardCharsets.UTF_8).trim());
                }
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
                return;
            } catch (IOException | RuntimeException failure) {
                LOG.warnf("Cannot load initial openHAB state for %s", item);
            }
        }
        if (!stopped && items == current && current.securityState() != null) {
            changes.action(new DashboardAction("SECURITY_STATE", null, current.securityState()));
        }
    }

    /**
     * Downloads a size-bounded JPEG from go2rtc, persists it, and notifies clients after successful storage.
     * Capture failures are logged independently of the already published camera-navigation action.
     *
     * @param action the motion camera and trigger category
     * @param timestamp the event time in milliseconds since the Unix epoch
     */
    private void capture(CameraAction action, long timestamp) {
        if (stopped) {
            return;
        }
        try {
            URI origin = proxy.go2rtcUrl().orElseThrow(() -> new IOException("go2rtc is not configured"));
            URI endpoint = origin.resolve("/api/frame.jpeg?src=" + segment("unifi_" + action.camera()));
            var request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(10)).GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (InputStream input = response.body()) {
                requireSuccess(response.statusCode());
                if (!response.headers().firstValue("Content-Type").orElse("").split(";")[0].trim()
                        .equalsIgnoreCase("image/jpeg")) {
                    throw new IOException("go2rtc did not return a JPEG snapshot");
                }
                snapshots.save(action.camera(), action.reason(), timestamp, read(input, MotionSnapshots.MAX_IMAGE_BYTES, 10_000));
            }
            changes.action(new DashboardAction("SNAPSHOTS_CHANGED", null, null));
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
        } catch (IOException | RuntimeException failure) {
            LOG.warnf(failure, "Cannot capture motion snapshot for %s", action.camera());
        }
    }

    /**
     * Prepares an openHAB request with the private raw authorization token and configured timeout.
     *
     * @param endpoint the upstream REST endpoint
     * @return a request builder ready for method and body configuration
     */
    private HttpRequest.Builder authenticated(URI endpoint) {
        return HttpRequest.newBuilder(endpoint).timeout(Duration.ofMillis(proxy.requestTimeoutMs())).header("Authorization",
                proxy.openhabToken().orElseThrow());
    }

    /**
     * Reads a bounded response body and schedules stream closure to limit time spent consuming it.
     *
     * @param input the upstream response body
     * @param limit the maximum accepted byte count
     * @param timeout the body-read deadline in milliseconds
     * @return the response bytes
     * @throws IOException if reading fails or the size limit is exceeded
     */
    private byte[] read(InputStream input, int limit, long timeout) throws IOException {
        var deadline = deadlines.schedule(() -> {
            try {
                input.close();
            } catch (IOException ignored) {
            }
        }, timeout, TimeUnit.MILLISECONDS);
        try {
            byte[] bytes = input.readNBytes(limit + 1);
            if (bytes.length > limit) {
                throw new IOException("Upstream response exceeds its size limit");
            }
            return bytes;
        } finally {
            deadline.cancel(false);
        }
    }

    /**
     * Rejects non-successful upstream HTTP responses before consuming their data.
     *
     * @param status the upstream status code
     * @throws IOException if the status is outside the 2xx range
     */
    private static void requireSuccess(int status) throws IOException {
        if (status < 200 || status >= 300) {
            throw new IOException("Upstream request failed with status " + status);
        }
    }

    /**
     * Encodes an item name or stream key for use as a URL component, representing spaces as percent escapes.
     *
     * @param value the unencoded component
     * @return the UTF-8 percent-encoded component
     */
    private static String segment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    /**
     * Prevents further work, aborts the active socket, and shuts down HTTP, initialization, capture, and deadline resources.
     */
    @PreDestroy
    void close() {
        stopped = true;
        WebSocket current = socket.getAndSet(null);
        if (current != null) {
            current.abort();
        }
        initialization.shutdownNow();
        captures.shutdownNow();
        deadlines.shutdownNow();
        if (http != null) {
            http.shutdownNow();
        }
    }

    /**
     * Binds one socket to its item model and assembles bounded messages before handing them to the event interpreter.
     */
    private class Listener implements WebSocket.Listener {

        private final OpenhabItems configured;
        private final StringBuilder message = new StringBuilder();

        /**
         * Associates the listener with the mappings loaded for this connection attempt.
         *
         * @param configured the new connection's item model
         */
        private Listener(OpenhabItems configured) {
            this.configured = configured;
        }

        /**
         * Installs the active socket and item model, starts frame demand, and schedules initial REST state reads.
         *
         * @param connected the newly opened upstream socket
         */
        @Override
        public void onOpen(WebSocket connected) {
            if (stopped) {
                connected.abort();
                return;
            }
            items = configured;
            socket.set(connected);
            connected.request(1);
            initialization.execute(() -> loadStates(configured));
            LOG.info("Backend openHAB item connection established");
        }

        /**
         * Assembles a text message, rejects oversized input, and processes complete events only from the active socket.
         *
         * @param connected the socket delivering the fragment
         * @param data the current text fragment
         * @param last whether this fragment completes the message
         * @return an already completed stage after handling the fragment
         */
        @Override
        public CompletionStage<?> onText(WebSocket connected, CharSequence data, boolean last) {
            if (message.length() + data.length() > 1_048_576) {
                connected.abort();
                socket.compareAndSet(connected, null);
                LOG.warn("openHAB event exceeds its size limit");
                return CompletableFuture.completedFuture(null);
            }
            message.append(data);
            if (last) {
                if (!stopped && socket.get() == connected) {
                    process(message.toString());
                }
                message.setLength(0);
            }
            connected.request(1);
            return CompletableFuture.completedFuture(null);
        }

        /**
         * Clears the closed socket if it is still active, allowing the maintenance task to reconnect.
         *
         * @param connected the closed upstream socket
         * @param statusCode the WebSocket close code
         * @param reason the upstream close reason
         * @return an already completed stage after handling closure
         */
        @Override
        public CompletionStage<?> onClose(WebSocket connected, int statusCode, String reason) {
            socket.compareAndSet(connected, null);
            LOG.infof("Backend openHAB connection closed (%d)", statusCode);
            return CompletableFuture.completedFuture(null);
        }

        /**
         * Releases the failed active socket and logs the transport error for a subsequent reconnect attempt.
         *
         * @param connected the failed upstream socket
         * @param failure the connection error
         */
        @Override
        public void onError(WebSocket connected, Throwable failure) {
            socket.compareAndSet(connected, null);
            LOG.warn("Backend openHAB connection failed", failure);
        }
    }
}