package cloud.heiss.dashboard.photos;

import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.model.PhotoSnapshot;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import jakarta.ws.rs.core.EntityTag;
import jakarta.ws.rs.core.Request;
import jakarta.ws.rs.core.Response;
import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MediaResourceTest {

    MediaResource resource;
    PhotoSnapshot photo;

    @BeforeEach
    void createResource() {
        resource = new MediaResource();
        resource.store = mock(DashboardStore.class);
        resource.media = mock(MediaService.class);
        resource.request = mock(Request.class);
        photo = new PhotoSnapshot(UUID.randomUUID(), "drive", "photo", "Photo.jpg", Instant.EPOCH, Instant.EPOCH, "v1");
        when(resource.store.photo(photo.id())).thenReturn(photo);
        when(resource.media.open(photo, false)).thenReturn(new ByteArrayInputStream(new byte[] { 1 }));
    }

    @Test
    void matchingVersionCanBeCachedPrivatelyForFiveMinutes() {
        resource.version = Integer.toUnsignedString(photo.version().hashCode());
        try (var response = resource.thumbnail(photo.id())) {
            String cache = response.getHeaderString("Cache-Control");
            assertMaxAge(cache, 300);
            assertTrue(cache.contains("private"));
            assertTrue(cache.contains("must-revalidate"));
        }
    }

    @Test
    void missingOrOutdatedVersionsRequireRevalidation() {
        for (String version : new String[] { null, "outdated" }) {
            resource.version = version;
            try (var response = resource.thumbnail(photo.id())) {
                assertMaxAge(response.getHeaderString("Cache-Control"), 0);
            }
        }
    }

    @Test
    void conditionalRequestsDoNotOpenMedia() {
        resource.version = Integer.toUnsignedString(photo.version().hashCode());
        when(resource.request.evaluatePreconditions(any(EntityTag.class))).thenReturn(Response.notModified());
        try (var response = resource.thumbnail(photo.id())) {
            assertEquals(304, response.getStatus());
            assertMaxAge(response.getHeaderString("Cache-Control"), 300);
            verifyNoInteractions(resource.media);
        }
    }

    private static void assertMaxAge(String cacheControl, int expected) {
        int maxAge = -1;
        for (String directive : cacheControl.split(",")) {
            String trimmed = directive.trim();
            if (trimmed.startsWith("max-age=")) {
                maxAge = Integer.parseInt(trimmed.substring("max-age=".length()));
                break;
            }
        }
        assertEquals(expected, maxAge);
    }
}