package cloud.heiss.dashboard.sync;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.jboss.logging.Logger;

import cloud.heiss.dashboard.calendar.CalendarSync;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.microsoft.GraphFailure;
import cloud.heiss.dashboard.microsoft.GraphSubscriptions;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.photos.MediaService;
import cloud.heiss.dashboard.photos.PhotoSync;
import io.quarkus.scheduler.Scheduled;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/**
 * Coordinates leased background account syncs, retries, webhook renewal, and
 * media prefetching.
 */
@ApplicationScoped
public class SyncCoordinator {

    private static final Logger LOG = Logger.getLogger(SyncCoordinator.class);

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

    @PostConstruct
    void recoverInterruptedSyncs() {
        int recovered = store.update("update MicrosoftAccount set requested=true,status='ERROR',error=?1,leaseUntil=null,"
                + "retryAfter=null where status='SYNCING'", "Previous synchronization was interrupted; retry queued");
        store.update("update DashboardSource set syncStatus='ERROR',syncError=?1 where syncStatus='SYNCING'",
                "Previous synchronization was interrupted; retry queued");
        if (recovered > 0) {
            LOG.warnf("Recovered %d interrupted account synchronization(s); retry queued", recovered);
            changes.publish("SYNC_STATUS", store.revision());
        }
    }

    public void requestSync() {
        int queued = store.update("update MicrosoftAccount set requested=true where status<>'RECONNECT_REQUIRED'");
        LOG.infof("Manual synchronization requested for %d account(s)", queued);
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
                LOG.debugf("Skipped synchronization claim for account=%s because its lease is active", account);
                running.remove(account);
                continue;
            }
            LOG.infof("Claimed synchronization accountName=\"%s\" leaseUntil=%s", accountName(account), now.plusSeconds(600));
            changes.publish("SYNC_STATUS", store.revision());
            workers.submit(() -> synchronize(account));
        }
    }

    private void synchronize(UUID account) {
        long startedAt = System.nanoTime();
        String accountName = accountName(account);
        var sources = store.sources(account);
        long selectedSources = sources.stream().filter(source -> source.selected()).count();
        LOG.infof("Account synchronization started accountName=\"%s\" selectedSources=%d totalSources=%d", accountName,
                selectedSources, sources.size());
        try {
            RuntimeException failed = null;
            for (var source : sources) {
                if (!source.selected()) {
                    LOG.debugf("Skipping disabled source accountName=\"%s\" sourceName=\"%s\" kind=%s", accountName,
                            safeName(source.name()), source.kind());
                    continue;
                }
                long sourceStartedAt = System.nanoTime();
                String sourceName = safeName(source.name());
                store.update("update DashboardSource set syncStatus='SYNCING',syncError=null where id=?1", source.id());
                LOG.infof("Source synchronization started accountName=\"%s\" sourceName=\"%s\" kind=%s mode=%s", accountName,
                        sourceName, source.kind(), source.deltaLink() == null ? "full" : "delta");
                try {
                    if (source.kind().equals("CALENDAR")) {
                        calendars.sync(source);
                    } else {
                        photos.sync(source);
                    }
                    store.update("update DashboardSource set syncStatus='SYNCED',syncError=null,syncLastSync=?1 where id=?2",
                            Instant.now(), source.id());
                    LOG.infof("Source synchronization completed accountName=\"%s\" sourceName=\"%s\" kind=%s durationMs=%d",
                            accountName, sourceName, source.kind(), elapsedMillis(sourceStartedAt));
                } catch (RuntimeException exception) {
                    store.update("update DashboardSource set syncStatus='ERROR',syncError=?1 where id=?2",
                            "Synchronization failed; check account access and retry", source.id());
                    LOG.errorf(exception,
                            "Source synchronization failed accountName=\"%s\" sourceName=\"%s\" kind=%s durationMs=%d",
                            accountName, sourceName, source.kind(), elapsedMillis(sourceStartedAt));
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
            LOG.infof("Account synchronization completed accountName=\"%s\" selectedSources=%d durationMs=%d warning=%s",
                    accountName, selectedSources, elapsedMillis(startedAt), warning == null ? "none" : "webhook-maintenance");
            failures.remove(account);
            media.prefetch(account);
        } catch (RuntimeException exception) {
            int attempt = failures.merge(account, 1, Integer::sum);
            Instant retry = exception instanceof GraphFailure failure ? failure.retryAt
                    : Instant.now().plusSeconds(Math.min(3600, 30L << Math.min(attempt, 7)));
            store.update("update MicrosoftAccount set status=case when status='RECONNECT_REQUIRED' then status else 'ERROR' end,"
                    + "error=case when status='RECONNECT_REQUIRED' then error else ?1 end,leaseUntil=null,retryAfter=?2 where id=?3",
                    "Synchronization failed; retry scheduled", retry, account);
            LOG.errorf(exception, "Account synchronization failed accountName=\"%s\" attempt=%d retryAt=%s durationMs=%d",
                    accountName, attempt, retry, elapsedMillis(startedAt));
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

    private static long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }

    private String accountName(UUID account) {
        return safeName(store.account(account).name());
    }

    private static String safeName(String value) {
        if (value == null || value.isBlank()) {
            return "unnamed";
        }
        String safe = value.replaceAll("[\\p{Cntrl}]", " ").replace('"', '\'');
        return safe.length() <= 80 ? safe : safe.substring(0, 77) + "...";
    }

    @PreDestroy
    void stop() {
        workers.shutdownNow();
    }
}