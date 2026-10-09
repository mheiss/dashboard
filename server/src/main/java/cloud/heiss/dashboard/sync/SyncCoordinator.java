package cloud.heiss.dashboard.sync;

import cloud.heiss.dashboard.microsoft.GraphFailure;
import cloud.heiss.dashboard.calendar.CalendarSync;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.microsoft.GraphClient;
import cloud.heiss.dashboard.microsoft.GraphSubscriptions;
import cloud.heiss.dashboard.photos.MediaService;
import cloud.heiss.dashboard.photos.PhotoSync;

import io.quarkus.scheduler.Scheduled;
import jakarta.annotation.PreDestroy;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Coordinates leased background account syncs, retries, webhook renewal, and media prefetching. */
@Path("/accounts/sync")
@ApplicationScoped
public class SyncCoordinator {

    @Inject
    DashboardStore store;
    @Inject
    DashboardConfig config;
    @Inject
    CalendarSync calendars;
    @Inject
    PhotoSync photos;
    @Inject
    GraphSubscriptions subscriptions;
    @Inject
    MediaService media;
    @Inject
    DashboardChanges changes;
    private final ExecutorService workers = Executors.newFixedThreadPool(2);
    private final ConcurrentHashMap<UUID, Integer> failures = new ConcurrentHashMap<>();
    private final java.util.Set<UUID> running = ConcurrentHashMap.newKeySet();

    @POST
    @RolesAllowed("admin")
    @Produces(MediaType.APPLICATION_JSON)
    public Map<String, String> requestSync() {
        store.update("update MicrosoftAccount set requested=true where status<>'RECONNECT_REQUIRED'");
        return Map.of("status", "QUEUED");
    }

    @Scheduled(every = "10s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void dispatch() {
        if (running.size() >= 2) {
            return;
        }
        Instant now = Instant.now();
        Instant cutoff = now.minus(interval());
        var candidates = store.page("select id from MicrosoftAccount where status<>'RECONNECT_REQUIRED' "
                + "and (requested=true or lastSync is null or lastSync<?1) "
                + "and (leaseUntil is null or leaseUntil<?2) and (retryAfter is null or retryAfter<?2) order by lastSync nulls first",
                UUID.class, 2, cutoff, now);
        for (UUID account : candidates) {
            if (running.size() >= 2 || !running.add(account)) {
                continue;
            }
            boolean claimed = store.update("update MicrosoftAccount set leaseUntil=?1,requested=false,status='SYNCING' "
                    + "where id=?2 and (leaseUntil is null or leaseUntil<?3)", now.plusSeconds(600), account, now) == 1;
            if (!claimed) {
                running.remove(account);
                continue;
            }
            workers.submit(() -> synchronize(account));
        }
    }

    private void synchronize(UUID account) {
        try {
            RuntimeException failed = null;
            for (var source : store.sources(account)) {
                if (!source.selected()) {
                    continue;
                }
                try {
                    if (source.kind().equals("CALENDAR")) {
                        calendars.sync(source);
                    } else {
                        photos.sync(source);
                    }
                } catch (RuntimeException exception) {
                    failed = exception;
                }
            }
            if (failed != null) {
                throw failed;
            }
            String warning = null;
            try {
                subscriptions.maintain(account);
            } catch (RuntimeException exception) {
                warning = "Webhook setup or renewal failed; scheduled synchronization remains active";
            }
            store.update(
                    "update MicrosoftAccount set lastSync=?1,status='CONNECTED',error=?2,leaseUntil=null,retryAfter=null where id=?3",
                    Instant.now(), warning, account);
            failures.remove(account);
            media.prefetch(account);
        } catch (RuntimeException exception) {
            int attempt = failures.merge(account, 1, Integer::sum);
            Instant retry = exception instanceof GraphFailure failure ? failure.retryAt
                    : Instant.now().plusSeconds(Math.min(3600, 30L << Math.min(attempt, 7)));
            store.update("update MicrosoftAccount set status=case when status='RECONNECT_REQUIRED' then status else 'ERROR' end,"
                    + "error=case when status='RECONNECT_REQUIRED' then error else ?1 end,leaseUntil=null,retryAfter=?2 where id=?3",
                    "Synchronization failed; retry scheduled", retry, account);
        } finally {
            running.remove(account);
            changes.publish("SYNC_STATUS", store.revision());
        }
    }

    @Scheduled(every = "30s", concurrentExecution = Scheduled.ConcurrentExecution.SKIP)
    void renewLeases() {
        for (UUID account : running) {
            store.update("update MicrosoftAccount set leaseUntil=?1 where id=?2", Instant.now().plusSeconds(600), account);
        }
    }

    private Duration interval() {
        String value = config.sync().every();
        return Duration.parse(value.startsWith("P") ? value : "PT" + value.toUpperCase(java.util.Locale.ROOT));
    }

    @PreDestroy
    void stop() {
        workers.shutdownNow();
    }
}