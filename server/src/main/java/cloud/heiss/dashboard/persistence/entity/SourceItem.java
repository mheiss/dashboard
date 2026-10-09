package cloud.heiss.dashboard.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.util.UUID;

/** Persisted OneDrive item metadata staged during folder delta synchronization. */
@Entity(name = "SourceItem")
@Table(name = "item")
@IdClass(SourceItemId.class)
public class SourceItem {

    @Id
    @Column(name = "source")
    public UUID sourceId;
    @Id
    @Column(name = "upstream")
    public String upstreamId;
    @Column(name = "parent")
    public String parentId;
    @Column(nullable = false, columnDefinition = "text")
    public String payload;
}
