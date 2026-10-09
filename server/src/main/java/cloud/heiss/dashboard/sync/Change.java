package cloud.heiss.dashboard.sync;

import java.time.Instant;

/** Dataset invalidation notification containing the current revision and publication timestamp. */
public record Change(String dataset, long revision, String timestamp) {

    public Change(String dataset, long revision) {
        this(dataset, revision, Instant.now().toString());
    }
}