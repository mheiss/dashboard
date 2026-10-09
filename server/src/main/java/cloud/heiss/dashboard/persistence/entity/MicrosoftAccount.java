package cloud.heiss.dashboard.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Persisted Microsoft identity, encrypted token cache, and synchronization scheduling state. */
@Entity(name = "MicrosoftAccount")
@Table(name = "account")
public class MicrosoftAccount {

    @Id
    public UUID id;
    @Column(name = "microsoft", nullable = false, unique = true)
    public String microsoftId;
    @Column(nullable = false)
    public String name;
    @Column(name = "cache", nullable = false, columnDefinition = "text")
    public String tokenCache;
    @Column(nullable = false, length = 40)
    public String status = "CONNECTED";
    public String error;
    @JdbcTypeCode(SqlTypes.TIMESTAMP_WITH_TIMEZONE)
    @Column(name = "synced")
    public Instant lastSync;
    @Column(nullable = false)
    public boolean requested = true;
    @JdbcTypeCode(SqlTypes.TIMESTAMP_WITH_TIMEZONE)
    @Column(name = "lease")
    public Instant leaseUntil;
    @JdbcTypeCode(SqlTypes.TIMESTAMP_WITH_TIMEZONE)
    @Column(name = "retry")
    public Instant retryAfter;
}
