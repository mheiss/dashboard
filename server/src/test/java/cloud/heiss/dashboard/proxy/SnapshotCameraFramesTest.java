package cloud.heiss.dashboard.proxy;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.InetSocketAddress;
import java.net.URI;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.sun.net.httpserver.HttpServer;

import cloud.heiss.dashboard.config.IntegrationProxyConfig;

class SnapshotCameraFramesTest {

    private static final byte[] JPEG = { (byte) 0xff, (byte) 0xd8, (byte) 0xff, 1 };
    private HttpServer server;
    private SnapshotCameraFrames frames;
    private final AtomicInteger requests = new AtomicInteger();
    private volatile int status = 200;
    private volatile byte[] image = JPEG;
    private volatile String query;
    private volatile long responseDelayMs;

    @BeforeEach
    void setup() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/frame.jpeg", exchange -> {
            requests.incrementAndGet();
            query = exchange.getRequestURI().getRawQuery();
            if (responseDelayMs > 0) {
                try {
                    Thread.sleep(responseDelayMs);
                } catch (InterruptedException failure) {
                    Thread.currentThread().interrupt();
                    exchange.close();
                    return;
                }
            }
            exchange.getResponseHeaders().set("Content-Type", "image/jpeg");
            exchange.sendResponseHeaders(status, image.length);
            exchange.getResponseBody().write(image);
            exchange.close();
        });
        server.start();
        frames = new SnapshotCameraFrames();
        frames.config = mock(IntegrationProxyConfig.class);
        when(frames.config.go2rtcUrl()).thenReturn(Optional.of(URI.create("http://127.0.0.1:" + server.getAddress().getPort())));
        when(frames.config.connectTimeoutMs()).thenReturn(5000);
        when(frames.config.requestTimeoutMs()).thenReturn(5000L);
        frames.initialize();
    }

    @AfterEach
    void cleanup() {
        frames.close();
        server.stop(0);
    }

    @Test
    void sharesSnapshotsAcrossConcurrentViewersAndLimitsRequests() throws Exception {
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(4)) {
            var tasks = java.util.stream.IntStream.range(0, 4).mapToObj(i -> executor.submit(() -> {
                start.await();
                return frames.get("unifi_tablet");
            })).toList();
            start.countDown();
            for (var task : tasks) {
                try (var response = task.get(5, TimeUnit.SECONDS)) {
                    assertEquals(200, response.getStatus());
                    assertArrayEquals(JPEG, (byte[]) response.getEntity());
                    assertEquals("no-store", response.getHeaderString("Cache-Control"));
                }
            }
        }
        assertEquals(1, requests.get());
        assertEquals("src=unifi_tablet", query);
        Thread.sleep(1100);
        try (var response = frames.get("unifi_tablet")) {
            assertEquals(200, response.getStatus());
        }
        assertEquals(2, requests.get());
    }

    @Test
    void reportsFailuresWithoutServingAnOldFrameOrRetryingTooFast() throws Exception {
        try (var response = frames.get("unifi_tablet")) {
            assertEquals(200, response.getStatus());
        }

        Thread.sleep(1100);
        status = 500;
        try (var response = frames.get("unifi_tablet")) {
            assertEquals(502, response.getStatus());
        }
        try (var response = frames.get("unifi_tablet")) {
            assertEquals(502, response.getStatus());
        }
        assertEquals(2, requests.get());
    }

    @Test
    void sharesSlowRequestsWithViewersWaitingForTheSameFrame() throws Exception {
        responseDelayMs = 1200;
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var tasks = java.util.stream.IntStream.range(0, 2).mapToObj(i -> executor.submit(() -> {
                start.await();
                return frames.get("unifi_tablet");
            })).toList();
            start.countDown();
            for (var task : tasks) {
                try (var response = task.get(5, TimeUnit.SECONDS)) {
                    assertEquals(200, response.getStatus());
                }
            }
        }
        assertEquals(1, requests.get());
    }

    @Test
    void rejectsNonJpegAndOversizedResponses() throws Exception {
        image = new byte[] { 1, 2, 3 };
        try (var response = frames.get("unifi_tablet")) {
            assertEquals(502, response.getStatus());
        }
        Thread.sleep(1100);
        image = new byte[5 * 1024 * 1024 + 1];
        try (var response = frames.get("unifi_tablet")) {
            assertEquals(502, response.getStatus());
        }
    }
}
