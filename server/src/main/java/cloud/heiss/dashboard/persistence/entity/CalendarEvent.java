package cloud.heiss.dashboard.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Persisted calendar occurrence with its source, time boundaries, and all-day date range. */
@Entity(name = "CalendarEvent")
@Table(name = "event")
public class CalendarEvent {

    @Id
    public UUID id;
    @Column(name = "source", nullable = false)
    public UUID sourceId;
    @Column(name = "upstream", nullable = false, length = 1024)
    public String upstreamId;
    @Column(nullable = false, columnDefinition = "text")
    public String subject;
    @JdbcTypeCode(SqlTypes.TIMESTAMP_WITH_TIMEZONE)
    @Column(name = "starts", nullable = false)
    public Instant startsAt;
    @JdbcTypeCode(SqlTypes.TIMESTAMP_WITH_TIMEZONE)
    @Column(name = "ends", nullable = false)
    public Instant endsAt;
    @Column(name = "allday", nullable = false)
    public boolean allDay;
    @Column(name = "startdate", nullable = false)
    public LocalDate startDate;
    @Column(name = "enddate", nullable = false)
    public LocalDate endDate;
}
