package cloud.heiss.dashboard.protect;

import java.util.List;
import java.util.UUID;

/**
 * Represents motion snapshots collected within a 30-second window measured from the first snapshot.
 *
 * @param id the first snapshot's identifier, used as the stable group key
 * @param snapshots group members ordered oldest first
 * @param preview the newest smart-motion snapshot, or the newest snapshot when none is smart
 */
public record MotionGroup(UUID id, List<MotionSnapshot> snapshots, MotionSnapshot preview) {
}