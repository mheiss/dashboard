package cloud.heiss.dashboard.photos;

import java.util.UUID;

import cloud.heiss.dashboard.api.MediaApi;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.protect.MotionSnapshots;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.CacheControl;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.EntityTag;
import jakarta.ws.rs.core.Request;
import jakarta.ws.rs.core.Response;

/**
 * Serves public photo thumbnails and originals with private, version-aware HTTP
 * caching.
 */
@Path("/")
@PermitAll
public class MediaResource implements MediaApi {

    @Inject
    DashboardStore store;
    @Inject
    MediaService media;
    @Inject
    MotionSnapshots snapshots;
    @Context
    Request request;

    @Override
    public Response getImageThumbnail(UUID id, String ifNoneMatch, String version) {
        return response(id, false, version);
    }

    @Override
    public Response getImageOriginal(UUID id, String ifNoneMatch, String version) {
        return response(id, true, version);
    }

    @Override
    public Response getMotionSnapshot(UUID id) {
        var cache = new CacheControl();
        cache.setPrivate(true);
        cache.setMaxAge(300);
        return Response.ok(snapshots.image(id), "image/jpeg").cacheControl(cache).tag(new EntityTag(id.toString()))
                .header("X-Content-Type-Options", "nosniff").build();
    }

    private Response response(UUID id, boolean original, String version) {
        var photo = store.photo(id);
        var tag = new EntityTag(id + "-" + Integer.toUnsignedString(photo.version().hashCode()) + (original ? "-o" : "-t"));
        var cache = new CacheControl();
        cache.setPrivate(true);
        cache.setMaxAge(Integer.toUnsignedString(photo.version().hashCode()).equals(version) ? 300 : 0);
        cache.setMustRevalidate(true);
        var precondition = request.evaluatePreconditions(tag);
        if (precondition != null) {
            return precondition.cacheControl(cache).build();
        }
        String type = original ? contentType(photo.name()) : "image/jpeg";
        return Response.ok(media.open(photo, original), type).tag(tag).cacheControl(cache)
                .header("X-Content-Type-Options", "nosniff").build();
    }

    private static String contentType(String name) {
        String extension = name.substring(Math.max(0, name.lastIndexOf('.') + 1)).toLowerCase(java.util.Locale.ROOT);
        return switch (extension) {
            case "png" -> "image/png";
            case "webp" -> "image/webp";
            case "gif" -> "image/gif";
            case "heic" -> "image/heic";
            case "heif" -> "image/heif";
            default -> "image/jpeg";
        };
    }
}