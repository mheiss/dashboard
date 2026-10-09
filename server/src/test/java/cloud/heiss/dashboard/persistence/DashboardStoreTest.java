package cloud.heiss.dashboard.persistence;

import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.entity.MicrosoftAccount;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Verifies Liquibase migration idempotency, transactional rollback, and account deletion cascades. */
@QuarkusTest
class DashboardStoreTest {

    @Inject
    DashboardStore store;
    @Inject
    io.quarkus.liquibase.LiquibaseFactory migrations;

    @Test
    void liquibaseBaselineIsAppliedOnceAndUpdatesAreIdempotent() throws Exception {
        long revision = store.revision();
        try (var liquibase = migrations.createLiquibase()) {
            liquibase.validate();
            var applied = liquibase.getDatabase().getRanChangeSetList();
            assertEquals(1, applied.stream().filter(change -> change.getId().equals("1-initial-dashboard-schema")).count());
            liquibase.update(new liquibase.Contexts(), new liquibase.LabelExpression());
            assertEquals(applied.size(), liquibase.getDatabase().getRanChangeSetList().size());
        }
        assertEquals(revision, store.revision());
    }

    @Test
    void migrationsAndRollbackPreserveRevision() {
        long revision = store.revision();
        assertThrows(IllegalStateException.class, () -> store.inTransaction(manager -> {
            DashboardStore.advanceRevision(manager);
            throw new IllegalStateException("Rollback probe");
        }));
        assertEquals(revision, store.revision());
    }

    @Test
    void accountDeletionCascadesSources() {
        var accountId = UUID.randomUUID();
        var account = new MicrosoftAccount();
        account.id = accountId;
        account.microsoftId = accountId.toString();
        account.name = "Test account";
        account.tokenCache = "Encrypted fixture";
        store.persist(account);
        var source = new DashboardSource();
        source.id = UUID.randomUUID();
        source.accountId = accountId;
        source.kind = "CALENDAR";
        source.upstreamId = "calendar-1";
        source.name = "Calendar";
        store.persist(source);
        assertEquals(1, store.sources(accountId).size());
        store.update("delete from MicrosoftAccount where id=?1", accountId);
        assertEquals(0, store.sources(accountId).size());
    }
}