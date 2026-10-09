package cloud.heiss.dashboard.microsoft;

import java.time.Instant;

/** Short-lived OAuth connection state binding a local user to a PKCE verifier and expiry. */
record PendingConnection(String owner, String verifier, Instant expires) {
}