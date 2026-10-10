package cloud.heiss.dashboard.api;

import io.smallrye.graphql.api.ErrorCode;
import jakarta.ws.rs.BadRequestException;

/** GraphQL error indicating that an image cursor belongs to an outdated dataset revision. */
@ErrorCode("IMAGE_CURSOR_EXPIRED")
public class CursorExpired extends BadRequestException {

    public CursorExpired() {
        super("Image cursor expired; reload the first page");
    }
}