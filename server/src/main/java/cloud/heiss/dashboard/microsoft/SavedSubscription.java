package cloud.heiss.dashboard.microsoft;

import java.time.Instant;

/** Stored Graph subscription snapshot used when reconciling remote subscription lifetimes. */
record SavedSubscription(String id, String resource, String state, Instant expiry) {
}