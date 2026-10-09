package cloud.heiss.dashboard.persistence.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** Composite persistence key identifying an upstream OneDrive item within a dashboard source. */
public class SourceItemId implements Serializable {

    public UUID sourceId;
    public String upstreamId;

    public SourceItemId() {
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof SourceItemId key && Objects.equals(sourceId, key.sourceId)
                && Objects.equals(upstreamId, key.upstreamId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(sourceId, upstreamId);
    }
}
