package cloud.heiss.dashboard.api;

import cloud.heiss.dashboard.api.model.CalendarInfo;
import cloud.heiss.dashboard.api.model.AccountStatus;
import cloud.heiss.dashboard.api.model.Agenda;
import cloud.heiss.dashboard.api.model.Image;
import cloud.heiss.dashboard.api.model.ImagePage;
import cloud.heiss.dashboard.api.model.Moment;
import cloud.heiss.dashboard.sync.DashboardChanges;
import cloud.heiss.dashboard.sync.Change;

import io.smallrye.graphql.api.Subscription;
import io.smallrye.mutiny.Multi;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import java.util.List;
import org.eclipse.microprofile.graphql.DefaultValue;
import org.eclipse.microprofile.graphql.GraphQLApi;
import org.eclipse.microprofile.graphql.Name;
import org.eclipse.microprofile.graphql.Query;

/** Exposes public GraphQL queries for cached data and subscriptions for dataset changes. */
@GraphQLApi
@PermitAll
public class DashboardApi {

    @Inject
    DashboardReadService reads;
    @Inject
    DashboardChanges changes;

    @Query
    public Agenda agenda(@Name("startDate") String startDate, @Name("days") @DefaultValue("7") int days) {
        return reads.agenda(startDate, days);
    }

    @Query
    public List<CalendarInfo> calendars() {
        return reads.calendars();
    }

    @Query
    public ImagePage images(@Name("first") @DefaultValue("25") int first, @Name("after") String after) {
        return reads.images(first, after);
    }

    @Query
    public Image image(@Name("id") String id) {
        return reads.image(id);
    }

    @Query
    public List<Moment> moments(@Name("referenceDate") String referenceDate) {
        return reads.moments(referenceDate);
    }

    @Query
    public List<AccountStatus> syncStatus() {
        return reads.status();
    }

    @Subscription
    public Multi<Change> dashboardChanged() {
        return changes.stream();
    }
}