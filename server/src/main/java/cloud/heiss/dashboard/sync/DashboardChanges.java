package cloud.heiss.dashboard.sync;

import cloud.heiss.dashboard.persistence.DashboardStore;

import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.infrastructure.Infrastructure;
import io.smallrye.mutiny.subscription.BackPressureStrategy;
import io.smallrye.mutiny.subscription.MultiEmitter;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Broadcasts dataset invalidations and supplies the initial revision to new GraphQL subscribers. */
@ApplicationScoped
public class DashboardChanges {

    @Inject
    DashboardStore store;
    private final Set<MultiEmitter<? super Change>> subscribers = ConcurrentHashMap.newKeySet();

    public void publish(String dataset, long revision) {
        var change = new Change(dataset, revision);
        subscribers.forEach(subscriber -> subscriber.emit(change));
    }

    public Multi<Change> stream() {
        return Multi.createFrom().<Change> emitter(subscriber -> {
            subscribers.add(subscriber);
            subscriber.onTermination(() -> subscribers.remove(subscriber));
            subscriber.emit(new Change("ALL", store.revision()));
        }, BackPressureStrategy.DROP).runSubscriptionOn(Infrastructure.getDefaultWorkerPool());
    }
}