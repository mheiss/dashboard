package cloud.heiss.dashboard.photos;

import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.model.PhotoSnapshot;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import jakarta.ws.rs.core.CacheControl;
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
            var cache = CacheControl.valueOf(response.getHeaderString("Cache-Control"));
            assertEquals(300, cache.getMaxAge());
            assertTrue(cache.isPrivate());
            assertTrue(cache.isMustRevalidate());
        }
    }

    @Test
    void missingOrOutdatedVersionsRequireRevalidation() {
        for (String version : new String[] { null, "outdated" }) {
            resource.version = version;
            try (var response = resource.thumbnail(photo.id())) {
                assertEquals(0, CacheControl.valueOf(response.getHeaderString("Cache-Control")).getMaxAge());
            }
        }
    }

    @Test
    void conditionalRequestsDoNotOpenMedia() {
        resource.version = Integer.toUnsignedString(photo.version().hashCode());
        when(resource.request.evaluatePreconditions(any(EntityTag.class))).thenReturn(Response.notModified());
        try (var response = resource.thumbnail(photo.id())) {
            assertEquals(304, response.getStatus());
            assertEquals(300, CacheControl.valueOf(response.getHeaderString("Cache-Control")).getMaxAge());
            verifyNoInteractions(resource.media);
        }
    }
}