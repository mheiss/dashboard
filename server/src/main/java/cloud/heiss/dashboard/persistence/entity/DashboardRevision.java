package cloud.heiss.dashboard.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Singleton dataset revision used as the durable, shared version marker for the dashboard's cached data.
 * <p>
 * The value is stored in the database instead of memory so every process, restart, and node can agree on
 * whether the dataset has changed. It is incremented whenever synchronized data is refreshed and then broadcast
 * through dashboard change notifications. Clients also include the current revision in image pagination cursors;
 * if a cursor was created before a newer dataset revision, the server rejects it as stale to prevent reading an
 * outdated page.
 * </p>
 */
@Entity(name = "DashboardRevision")
@Table(name = "revision")
public class DashboardRevision {

    @Id
    public Integer id;
    @Column(nullable = false)
    public long revision;
}