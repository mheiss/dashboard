package cloud.heiss.dashboard.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Shared OneDrive photo metadata that can belong to multiple dashboard sources. */
@Entity(name = "Photo")
@Table(name = "photo")
public class Photo {

    @Id
    public UUID id;
    @Column(name = "drive", nullable = false)
    public String driveId;
    @Column(name = "upstream", nullable = false)
    public String upstreamId;
    @Column(nullable = false, columnDefinition = "text")
    public String name;
    @JdbcTypeCode(SqlTypes.TIMESTAMP_WITH_TIMEZONE)
    @Column(name = "taken")
    public Instant takenAt;
    @Column(name = "takenday")
    public Integer takenDay;
    @Column(name = "takenmonth")
    public Integer takenMonth;
    @Column(name = "takenyear")
    public Integer takenYear;
    @JdbcTypeCode(SqlTypes.TIMESTAMP_WITH_TIMEZONE)
    @Column(name = "modified", nullable = false)
    public Instant modifiedAt;
    @Column(nullable = false, columnDefinition = "text")
    public String version;
}
