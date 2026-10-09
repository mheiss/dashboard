package cloud.heiss.dashboard.microsoft;

import java.time.Instant;

/** Microsoft Graph HTTP failure carrying its status and earliest retry time. */
public class GraphFailure extends RuntimeException {

    public final int status;
    public final Instant retryAt;

    public GraphFailure(int status, Instant retryAt) {
        super("Microsoft Graph returned HTTP " + status);
        this.status = status;
        this.retryAt = retryAt;
    }
}