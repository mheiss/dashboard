package cloud.heiss.dashboard.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** Persisted account-owned calendar or photo folder with display settings and a delta checkpoint. */
@Entity(name = "DashboardSource")
@Table(name = "source")
public class DashboardSource {

    @Id
    public UUID id;
    @Column(name = "account", nullable = false)
    public UUID accountId;
    @Column(nullable = false, length = 20)
    public String kind;
    @Column(name = "upstream", nullable = false)
    public String upstreamId;
    @Column(name = "drive")
    public String driveId;
    @Column(nullable = false)
    public String name;
    @Column(nullable = false, length = 30)
    public String theme = "emerald";
    @Column(nullable = false)
    public boolean selected;
    @Column(name = "delta", columnDefinition = "text")
    public String deltaLink;
}
