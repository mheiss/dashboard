package cloud.heiss.dashboard.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.util.UUID;

/** Persisted association between a shared photo and a dashboard photo source. */
@Entity(name = "PhotoMembership")
@Table(name = "membership")
@IdClass(MembershipId.class)
public class PhotoMembership {

    @Id
    @Column(name = "photo")
    public UUID photoId;
    @Id
    @Column(name = "source")
    public UUID sourceId;
}
