package cloud.heiss.dashboard.microsoft;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;

/** Authenticated Microsoft Graph client handling JSON paging, trusted media redirects, and retry hints. */
@ApplicationScoped
public class GraphClient {

    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10))
            .followRedirects(HttpClient.Redirect.NEVER).build();
    @Inject
    MicrosoftAuth auth;
    @Inject
    ObjectMapper mapper;

    public static URI graphUri(String endpoint) {
        URI uri = URI.create(endpoint.startsWith("https://") ? endpoint : "https://graph.microsoft.com/v1.0/" + endpoint);
        if (!"https".equals(uri.getScheme()) || !"graph.microsoft.com".equalsIgnoreCase(uri.getHost())
                || uri.getUserInfo() != null || (uri.getPort() != -1 && uri.getPort() != 443)
                || !uri.getPath().startsWith("/v1.0/")) {
            throw new IllegalArgumentException("Invalid Microsoft Graph endpoint");
        }
        return uri;
    }

    public static String segment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    public JsonNode get(UUID account, String endpoint) {
        return json(account, endpoint, "GET", null);
    }

    public JsonNode json(UUID account, String endpoint, String method, JsonNode body) {
        for (int attempt = 0; attempt < 2; attempt++) {
            var request = HttpRequest.newBuilder(graphUri(endpoint)).timeout(Duration.ofSeconds(45))
                    .header("Authorization", "Bearer " + auth.token(account, attempt > 0))
                    .header("Prefer", "outlook.timezone=\"UTC\", IdType=\"ImmutableId\"")
                    .header("Content-Type", "application/json").method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                            : HttpRequest.BodyPublishers.ofString(body.toString()))
                    .build();
            try {
                var response = client.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() == 401 && attempt == 0) {
                    continue;
                }
                check(response);
                return response.body().isBlank() ? mapper.createObjectNode() : mapper.readTree(response.body());
            } catch (InterruptedException exception) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Microsoft request interrupted");
            } catch (IOException exception) {
                throw new IllegalStateException("Microsoft request failed");
            }
        }
        throw new GraphFailure(401, Instant.now().plusSeconds(300));
    }

    public List<JsonNode> list(UUID account, String endpoint) {
        var result = new ArrayList<JsonNode>();
        pages(account, endpoint, page -> page.path("value").forEach(result::add));
        return result;
    }

    public String pages(UUID account, String endpoint, Consumer<JsonNode> consumer) {
        String next = endpoint;
        int pageCount = 0;
        while (next != null) {
            if (++pageCount > 100000) {
                throw new IllegalStateException("Microsoft pagination limit exceeded");
            }
            JsonNode page = get(account, next);
            if (!page.path("value").isArray()) {
                throw new IllegalStateException("Invalid Microsoft collection response");
            }
            consumer.accept(page);
            next = page.path("@odata.nextLink").asText(null);
            if (next == null) {
                return page.path("@odata.deltaLink").asText(null);
            }
        }
        return null;
    }

    public InputStream media(UUID account, String endpoint) {
        try {
            var request = HttpRequest.newBuilder(graphUri(endpoint)).timeout(Duration.ofMinutes(2))
                    .header("Authorization", "Bearer " + auth.token(account, false)).build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() == 302 || response.statusCode() == 301 || response.statusCode() == 307) {
                response.body().close();
                URI redirect = URI.create(response.headers().firstValue("Location").orElseThrow());
                validateMediaRedirect(redirect);
                var download = HttpRequest.newBuilder(redirect).timeout(Duration.ofMinutes(2)).GET().build();
                response = client.send(download, HttpResponse.BodyHandlers.ofInputStream());
            }
            try {
                check(response);
            } catch (RuntimeException exception) {
                response.body().close();
                throw exception;
            }
            return response.body();
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Media request interrupted");
        } catch (IOException exception) {
            throw new IllegalStateException("Media download failed");
        }
    }

    public static void validateMediaRedirect(URI uri) {
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null || uri.getUserInfo() != null
                || (uri.getPort() != -1 && uri.getPort() != 443)
                || !(host.endsWith(".1drv.com") || host.endsWith(".files.1drv.com") || host.endsWith(".live.com")
                        || host.endsWith(".sharepoint.com") || host.endsWith(".svc.ms"))) {
            throw new IllegalArgumentException("Untrusted Microsoft media redirect host: " + (host == null ? "<invalid>" : host));
        }
    }

    private static void check(HttpResponse<?> response) {
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            return;
        }
        long seconds = 60;
        String retry = response.headers().firstValue("Retry-After").orElse("60");
        try {
            seconds = Long.parseLong(retry);
        } catch (NumberFormatException exception) {
            try {
                seconds = Duration
                        .between(Instant.now(), ZonedDateTime.parse(retry, DateTimeFormatter.RFC_1123_DATE_TIME).toInstant())
                        .getSeconds();
            } catch (RuntimeException ignored) {
                seconds = 60;
            }
        }
        throw new GraphFailure(response.statusCode(), Instant.now().plusSeconds(Math.max(1, Math.min(seconds, 86400))));
    }
}