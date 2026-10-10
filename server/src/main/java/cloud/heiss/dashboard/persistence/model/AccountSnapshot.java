package cloud.heiss.dashboard.persistence.model;

import java.time.Instant;
import java.util.UUID;

/** Detached account value containing identity, encrypted token cache, and synchronization status. */
public record AccountSnapshot(UUID id, String microsoftId, String name, String cache, String status, String error,
        Instant lastSync) {
}