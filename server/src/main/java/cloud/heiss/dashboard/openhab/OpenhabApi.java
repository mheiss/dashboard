package cloud.heiss.dashboard.openhab;

import java.util.List;

import org.eclipse.microprofile.graphql.GraphQLApi;
import org.eclipse.microprofile.graphql.Mutation;
import org.eclipse.microprofile.graphql.Name;
import org.eclipse.microprofile.graphql.Query;

import cloud.heiss.dashboard.protect.MotionGroup;
import cloud.heiss.dashboard.protect.MotionSnapshots;
import cloud.heiss.dashboard.sync.DashboardAction;
import cloud.heiss.dashboard.sync.DashboardChanges;
import io.smallrye.graphql.api.Subscription;
import io.smallrye.mutiny.Multi;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;

/**
 * Exposes backend-owned openHAB state, PIN commands, snapshot groups, and client actions through GraphQL.
 */
@GraphQLApi
@PermitAll
public class OpenhabApi {

    @Inject
    OpenhabService openhab;

    @Inject
    MotionSnapshots snapshots;

    @Inject
    DashboardChanges changes;

    /**
     * Returns the latest backend security state without querying openHAB from the browser.
     *
     * @return the armed flag, or null while the state is unknown
     */
    @Query
    public Boolean securityArmed() {
        return openhab.securityArmed();
    }

    /**
     * Lists retained snapshot groups with backend media URLs.
     *
     * @return groups ordered newest first
     */
    @Query
    public List<MotionGroup> motionGroups() {
        return snapshots.groups();
    }

    /**
     * Sends a validated PIN to the configured openHAB command item using private backend credentials.
     *
     * @param pin a numeric PIN of one to 32 digits
     * @return true when openHAB accepts the command
     * @throws jakarta.ws.rs.BadRequestException if the PIN format is invalid
     * @throws jakarta.ws.rs.ServiceUnavailableException if configuration or upstream communication prevents submission
     */
    @Mutation
    public boolean submitSecurityPin(@Name("pin") String pin) {
        return openhab.submitPin(pin);
    }

    /**
     * Subscribes to client actions, starting with SYNC rather than replaying old camera-navigation events.
     *
     * @return a live stream of dashboard actions
     */
    @Subscription
    public Multi<DashboardAction> dashboardAction() {
        return changes.actions();
    }
}