package cloud.heiss.dashboard.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Singleton dataset revision used for change notifications and image cursor consistency. */
@Entity(name = "DashboardRevision")
@Table(name = "revision")
public class DashboardRevision {

    @Id
    public Integer id;
    @Column(nullable = false)
    public long revision;
}