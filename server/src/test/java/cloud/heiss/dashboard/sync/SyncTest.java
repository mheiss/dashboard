package cloud.heiss.dashboard.sync;

import cloud.heiss.dashboard.persistence.model.SourceSnapshot;
import cloud.heiss.dashboard.microsoft.GraphFailure;
import cloud.heiss.dashboard.calendar.CalendarSync;
import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.microsoft.GraphClient;
import cloud.heiss.dashboard.persistence.entity.MicrosoftAccount;
import cloud.heiss.dashboard.persistence.entity.Photo;
import cloud.heiss.dashboard.photos.PhotoSync;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Verifies sync leases, atomic calendar snapshots, resilient photo deltas, and subscriber lifecycle. */
@QuarkusTest
class SyncTest {

    @Inject
    DashboardStore store;
    @Inject
    CalendarSync calendars;
    @Inject
    PhotoSync photos;
    @Inject
    ObjectMapper mapper;
    @Inject
    DashboardChanges notifications;
    @Inject
    SyncCoordinator coordinator;
    @InjectMock
    GraphClient graph;
    UUID account;
    UUID source;

    @BeforeEach
    void createAccount() {
        account = UUID.randomUUID();
        source = UUID.randomUUID();
        var entity = new MicrosoftAccount();
        entity.id = account;
        entity.microsoftId = account.toString();
        entity.name = "Sync fixture";
        entity.tokenCache = "Fixture cache";
        store.persist(entity);
    }

    @AfterEach
    void removeAccount() {
        store.update("delete from MicrosoftAccount where id=?1", account);
        store.update("delete from Photo p where not exists (select 1 from PhotoMembership m where m.photoId=p.id)");
    }

    SourceSnapshot source(String kind) {
        var entity = new DashboardSource();
        entity.id = source;
        entity.accountId = account;
        entity.kind = kind;
        entity.upstreamId = "folder";
        entity.driveId = "drive";
        entity.name = "Fixture";
        entity.selected = true;
        store.persist(entity);
        return currentSource();
    }

    SourceSnapshot currentSource() {
        return store.sources(account).getFirst();
    }

    @Test
    void dispatcherClaimsAndCompletesAnAccountUsingHibernate() throws Exception {
        source("CALENDAR");
        when(graph.list(eq(account), anyString())).thenReturn(List.of());
        var initial = new java.util.concurrent.CountDownLatch(1);
        var completed = new java.util.concurrent.CountDownLatch(1);
        var subscription = notifications.stream().subscribe().with(change -> {
            if (change.dataset().equals("ALL"))
                initial.countDown();
            if (change.dataset().equals("SYNC_STATUS"))
                completed.countDown();
        });
        try {
            org.junit.jupiter.api.Assertions.assertTrue(initial.await(5, java.util.concurrent.TimeUnit.SECONDS));
            coordinator.dispatch();
            org.junit.jupiter.api.Assertions.assertTrue(completed.await(10, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals("CONNECTED", store.account(account).status());
            org.junit.jupiter.api.Assertions.assertNotNull(store.account(account).lastSync());
            assertEquals(false,
                    store.list("select requested from MicrosoftAccount where id=?1", Boolean.class, account).getFirst());
        } finally {
            subscription.cancel();
        }
    }

    @Test
    void subscribersReceiveAnInitialRevisionAndUnsubscribeCleanly() throws Exception {
        var received = new java.util.concurrent.CopyOnWriteArrayList<Change>();
        var initial = new java.util.concurrent.CountDownLatch(1);
        var subscription = notifications.stream().subscribe().with(change -> {
            received.add(change);
            initial.countDown();
        });
        org.junit.jupiter.api.Assertions.assertTrue(initial.await(5, java.util.concurrent.TimeUnit.SECONDS));
        assertEquals("ALL", received.getFirst().dataset());
        assertEquals(store.revision(), received.getFirst().revision());
        notifications.publish("CALENDAR", store.revision());
        assertEquals(2, received.size());
        subscription.cancel();
        notifications.publish("IMAGES", store.revision());
        assertEquals(2, received.size());
    }

    @Test
    void calendarSnapshotsAreAtomicAndUnchangedSnapshotsDoNotNotify() throws Exception {
        var calendar = source("CALENDAR");
        var occurrence = mapper.readTree("""
                {"id":"occurrence","subject":"Recurring appointment","start":{"dateTime":"2026-10-25T08:00:00"},
                 "end":{"dateTime":"2026-10-25T09:00:00"},"type":"occurrence"}
                """);
        var cancelled = mapper.readTree("{\"id\":\"cancelled\",\"isCancelled\":true}");
        when(graph.list(eq(account), anyString())).thenReturn(List.of(occurrence, cancelled));
        calendars.sync(calendar);
        long revision = store.revision();
        assertEquals(1, store.list("select id from CalendarEvent where sourceId=?1", UUID.class, source).size());
        calendars.sync(calendar);
        assertEquals(revision, store.revision());
        when(graph.list(eq(account), anyString())).thenThrow(new GraphFailure(429, Instant.now().plusSeconds(60)));
        assertThrows(GraphFailure.class, () -> calendars.sync(calendar));
        assertEquals(revision, store.revision());
        assertEquals(1, store.list("select id from CalendarEvent where sourceId=?1", UUID.class, source).size());
    }

    @Test
    void photoCheckpointSurvivesFailedPagesAndRecoversFromGone() throws Exception {
        var folder = source("PHOTOS");
        JsonNode page = mapper.readTree("""
                {"value":[{"id":"picture","name":"Photo.jpg","parentReference":{"id":"folder","driveId":"drive"},
                "photo":{"takenDateTime":"2020-10-08T10:00:00Z"},"eTag":"v1","lastModifiedDateTime":"2020-10-08T10:00:00Z"}]}
                """);
        when(graph.pages(eq(account), anyString(), any())).thenAnswer(invocation -> {
            Consumer<JsonNode> consumer = invocation.getArgument(2);
            consumer.accept(page);
            return "https://graph.microsoft.com/v1.0/fixture/delta?token=one";
        });
        photos.sync(folder);
        long revision = store.revision();
        photos.sync(currentSource());
        assertEquals(revision, store.revision());
        when(graph.pages(eq(account), anyString(), any())).thenAnswer(invocation -> {
            Consumer<JsonNode> consumer = invocation.getArgument(2);
            consumer.accept(mapper.readTree("{\"value\":[{\"id\":\"picture\",\"deleted\":{}}]}"));
            throw new GraphFailure(429, Instant.now().plusSeconds(60));
        });
        assertThrows(GraphFailure.class, () -> photos.sync(currentSource()));
        assertEquals(revision, store.revision());
        assertEquals(1, store.list("select photoId from PhotoMembership where sourceId=?1", UUID.class, source).size());
        assertEquals("https://graph.microsoft.com/v1.0/fixture/delta?token=one", currentSource().deltaLink());
        when(graph.pages(eq(account), anyString(), any())).thenThrow(new GraphFailure(410, Instant.now()));
        assertThrows(GraphFailure.class, () -> photos.sync(currentSource()));
        assertNull(currentSource().deltaLink());
        when(graph.pages(eq(account), anyString(), any())).thenAnswer(invocation -> {
            Consumer<JsonNode> consumer = invocation.getArgument(2);
            consumer.accept(mapper.readTree("{\"value\":[]}"));
            return "https://graph.microsoft.com/v1.0/fixture/delta?token=two";
        });
        photos.sync(currentSource());
        assertEquals(0, store.list("select photoId from PhotoMembership where sourceId=?1", UUID.class, source).size());
    }

    @Test
    void sharedRemotePhotosAreIncludedAndDeduplicated() throws Exception {
        var folder = source("PHOTOS");
        JsonNode page = mapper.readTree("""
                {"value":[
                {"id":"link-one","parentReference":{"id":"folder"},"remoteItem":{"id":"photo","name":"Shared.jpg",
                 "parentReference":{"driveId":"shared-drive"},"photo":{"takenDateTime":"2020-10-08T10:00:00Z"},"eTag":"v1"}},
                {"id":"link-two","parentReference":{"id":"folder"},"remoteItem":{"id":"photo","name":"Shared.jpg",
                 "parentReference":{"driveId":"shared-drive"},"photo":{"takenDateTime":"2020-10-08T10:00:00Z"},"eTag":"v1"}}]}
                """);
        when(graph.pages(eq(account), anyString(), any())).thenAnswer(invocation -> {
            Consumer<JsonNode> consumer = invocation.getArgument(2);
            consumer.accept(page);
            return "https://graph.microsoft.com/v1.0/fixture/delta?token=shared";
        });
        photos.sync(folder);
        var rows = store.list("select p.name from Photo p join PhotoMembership m on m.photoId=p.id where m.sourceId=?1",
                String.class, source);
        assertEquals(List.of("Shared.jpg"), rows);
    }
}