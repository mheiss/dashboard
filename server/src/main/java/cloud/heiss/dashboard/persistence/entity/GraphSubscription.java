package cloud.heiss.dashboard.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Persisted Graph webhook subscription with its account, resource, validation secret, and expiry. */
@Entity(name = "GraphSubscription")
@Table(name = "subscription")
public class GraphSubscription {

    @Id
    public String id;
    @Column(name = "account", nullable = false)
    public UUID accountId;
    @Column(nullable = false, columnDefinition = "text")
    public String resource;
    @Column(name = "state", nullable = false, length = 100)
    public String clientState;
    @JdbcTypeCode(SqlTypes.TIMESTAMP_WITH_TIMEZONE)
    @Column(name = "expires", nullable = false)
    public Instant expiresAt;
}
