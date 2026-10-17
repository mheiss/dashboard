package cloud.heiss.dashboard.protect;

import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.CacheControl;
import jakarta.ws.rs.core.EntityTag;
import jakarta.ws.rs.core.Response;
import java.util.UUID;

/**
 * Serves persisted motion snapshots through the dashboard's media API.
 * Images are identified by snapshot UUIDs and cached privately for five minutes.
 */
@Path("/api/media/protect/{id}")
@PermitAll
public class MotionResource {

    @Inject
    MotionSnapshots snapshots;

    /**
     * Returns a stored JPEG with a snapshot-based entity tag and private cache headers.
     *
     * @param id identifier of the persisted snapshot
     * @return the JPEG response
     * @throws jakarta.ws.rs.NotFoundException if either file is unavailable or the image exceeds its size limit
     */
    @GET
    public Response image(@PathParam("id") UUID id) {
        var cache = new CacheControl();
        cache.setPrivate(true);
        cache.setMaxAge(300);
        return Response.ok(snapshots.image(id), "image/jpeg").cacheControl(cache).tag(new EntityTag(id.toString()))
                .header("X-Content-Type-Options", "nosniff").build();
    }
}