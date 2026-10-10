package cloud.heiss.dashboard.persistence.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** Composite persistence key linking a photo ID to a source ID. */
public class MembershipId implements Serializable {

    public UUID photoId;
    public UUID sourceId;

    public MembershipId() {
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof MembershipId key && Objects.equals(photoId, key.photoId)
                && Objects.equals(sourceId, key.sourceId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(photoId, sourceId);
    }
}
