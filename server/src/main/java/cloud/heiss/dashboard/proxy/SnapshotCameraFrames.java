package cloud.heiss.dashboard.proxy;

import java.io.IOException;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.jboss.logging.Logger;

import cloud.heiss.dashboard.config.IntegrationProxyConfig;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;

@ApplicationScoped
public class SnapshotCameraFrames {

    private static final Logger LOG = Logger.getLogger(SnapshotCameraFrames.class);
    private static final int MAX_BYTES = 5 * 1024 * 1024;
    private static final long INTERVAL_NANOS = TimeUnit.SECONDS.toNanos(1);

    @Inject
    IntegrationProxyConfig config;

    private final ConcurrentHashMap<String, CameraState> states = new ConcurrentHashMap<>();
    private HttpClient client;

    @PostConstruct
    void initialize() {
        client = HttpClient.newBuilder().connectTimeout(Duration.ofMillis(config.connectTimeoutMs()))
                .followRedirects(HttpClient.Redirect.NEVER).build();
    }

    @PreDestroy
    void close() {
        client.close();
    }

    public Response get(String source) {
        var origin = config.go2rtcUrl();
        if (origin.isEmpty()) {
            return Response.status(503).build();
        }
        var state = states.computeIfAbsent(source, ignored -> new CameraState());
        byte[] frame = capture(state, source);
        if (frame == null) {
            return Response.status(502).header("Cache-Control", "no-store").build();
        }
        return Response.ok(frame, "image/jpeg").header("Cache-Control", "no-store").build();
    }

    private byte[] capture(CameraState state, String source) {
        synchronized (state) {
            long now = System.nanoTime();
            if (state.attempted && now - state.lastAttempt < INTERVAL_NANOS) {
                return state.frame;
            }
            state.attempted = true;
            state.frame = null;
            var encoded = URLEncoder.encode(source, StandardCharsets.UTF_8);
            var endpoint = config.go2rtcUrl().orElseThrow().resolve("/api/frame.jpeg?src=" + encoded);
            var request = HttpRequest.newBuilder(endpoint).timeout(Duration.ofMillis(config.requestTimeoutMs())).GET().build();
            try {
                var response = client.send(request,
                        HttpResponse.BodyHandlers.limiting(HttpResponse.BodyHandlers.ofByteArray(), MAX_BYTES));
                var contentType = response.headers().firstValue("Content-Type").orElse("").toLowerCase(Locale.ROOT);
                byte[] body = response.body();
                if (response.statusCode() != 200 || !contentType.split(";", 2)[0].trim().equals("image/jpeg") || body.length < 3
                        || (body[0] & 0xff) != 0xff || (body[1] & 0xff) != 0xd8 || (body[2] & 0xff) != 0xff) {
                    LOG.warnf("go2rtc returned an invalid snapshot for %s (HTTP %d)", source, response.statusCode());
                    return null;
                }
                state.frame = body;
                return body;
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
                LOG.warnf("Snapshot request interrupted for %s", source);
            } catch (IOException failure) {
                LOG.warnf("Snapshot request failed for %s (%s)", source, failure.getClass().getSimpleName());
            } finally {
                state.lastAttempt = System.nanoTime();
            }
            return null;
        }
    }

    private static class CameraState {

        private boolean attempted;
        private long lastAttempt;
        private byte[] frame;
    }
}
