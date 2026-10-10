package cloud.heiss.dashboard.photos;

import cloud.heiss.dashboard.persistence.DashboardStore;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.CacheControl;
import jakarta.ws.rs.core.EntityTag;
import jakarta.ws.rs.core.Request;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.Context;
import java.util.UUID;

/** Serves public photo thumbnails and originals with private, version-aware HTTP caching. */
@Path("/media/images/{id}")
@PermitAll
public class MediaResource {

    @Inject
    DashboardStore store;
    @Inject
    MediaService media;
    @Context
    Request request;
    @QueryParam("v")
    String version;

    @GET
    @Path("/thumbnail")
    public Response thumbnail(@PathParam("id") UUID id) {
        return response(id, false);
    }

    @GET
    @Path("/original")
    public Response original(@PathParam("id") UUID id) {
        return response(id, true);
    }

    private Response response(UUID id, boolean original) {
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