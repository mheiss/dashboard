package cloud.heiss.dashboard.persistence;

import cloud.heiss.dashboard.persistence.entity.DashboardRevision;
import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.entity.MicrosoftAccount;
import cloud.heiss.dashboard.persistence.model.AccountSnapshot;
import cloud.heiss.dashboard.persistence.model.SourceSnapshot;
import cloud.heiss.dashboard.persistence.model.PhotoSnapshot;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import io.quarkus.narayana.jta.QuarkusTransaction;
import java.util.function.Function;
import java.util.List;
import java.util.UUID;

/** Provides typed Hibernate queries, transaction boundaries, snapshots, and locked revision updates. */
@ApplicationScoped
public class DashboardStore {

    @Inject
    EntityManager entityManager;

    public <Result> Result inTransaction(Function<EntityManager, Result> work) {
        return QuarkusTransaction.requiringNew().call(() -> work.apply(entityManager));
    }

    public <Result> List<Result> list(String hql, Class<Result> type, Object... parameters) {
        return page(hql, type, Integer.MAX_VALUE, parameters);
    }

    public <Result> List<Result> page(String hql, Class<Result> type, int limit, Object... parameters) {
        return QuarkusTransaction.joiningExisting().call(() -> {
            var query = entityManager.createQuery(hql, type).setMaxResults(limit);
            for (int index = 0; index < parameters.length; index++) {
                query.setParameter(index + 1, parameters[index]);
            }
            return query.getResultList();
        });
    }

    public int update(String hql, Object... parameters) {
        return inTransaction(manager -> {
            var query = manager.createQuery(hql);
            for (int index = 0; index < parameters.length; index++) {
                query.setParameter(index + 1, parameters[index]);
            }
            return query.executeUpdate();
        });
    }

    public void persist(Object entity) {
        inTransaction(manager -> {
            manager.persist(entity);
            return null;
        });
    }

    public static long advanceRevision(EntityManager manager) {
        var revision = manager.find(DashboardRevision.class, 1, LockModeType.PESSIMISTIC_WRITE);
        revision.revision++;
        manager.flush();
        return revision.revision;
    }

    public List<AccountSnapshot> accounts() {
        return list("from MicrosoftAccount order by name, id", MicrosoftAccount.class).stream().map(DashboardStore::account)
                .toList();
    }

    public AccountSnapshot account(UUID id) {
        return list("from MicrosoftAccount where id = ?1", MicrosoftAccount.class, id).stream().map(DashboardStore::account)
                .findFirst().orElseThrow(() -> new jakarta.ws.rs.NotFoundException("Account not found"));
    }

    public List<SourceSnapshot> sources() {
        return list("from DashboardSource order by kind, name, id", DashboardSource.class).stream().map(DashboardStore::source)
                .toList();
    }

    public List<SourceSnapshot> sources(UUID accountId) {
        return list("from DashboardSource where accountId = ?1 order by kind, name, id", DashboardSource.class, accountId)
                .stream().map(DashboardStore::source).toList();
    }

    public long revision() {
        return list("select revision from DashboardRevision where id = 1", Long.class).getFirst();
    }

    public PhotoSnapshot photo(UUID id) {
        return list("from Photo p where p.id = ?1 and exists "
                + "(select 1 from PhotoMembership m join DashboardSource s on s.id=m.sourceId "
                + "where m.photoId=p.id and s.selected=true)", cloud.heiss.dashboard.persistence.entity.Photo.class, id).stream()
                        .map(DashboardStore::photo).findFirst()
                        .orElseThrow(() -> new jakarta.ws.rs.NotFoundException("Photo not found"));
    }

    public AccountSnapshot photoAccount(UUID photoId) {
        return page("select a from MicrosoftAccount a join DashboardSource s on s.accountId=a.id "
                + "join PhotoMembership m on m.sourceId=s.id where m.photoId=?1 and s.selected=true "
                + "order by case when a.status='CONNECTED' then 0 else 1 end, a.id", MicrosoftAccount.class, 1, photoId).stream()
                        .map(DashboardStore::account).findFirst()
                        .orElseThrow(() -> new jakarta.ws.rs.NotFoundException("Photo source not found"));
    }

    public static AccountSnapshot account(MicrosoftAccount entity) {
        return new AccountSnapshot(entity.id, entity.microsoftId, entity.name, entity.tokenCache, entity.status, entity.error,
                entity.lastSync);
    }

    public static SourceSnapshot source(DashboardSource entity) {
        return new SourceSnapshot(entity.id, entity.accountId, entity.kind, entity.upstreamId, entity.driveId, entity.name,
                entity.theme, entity.selected, entity.deltaLink);
    }

    public static PhotoSnapshot photo(cloud.heiss.dashboard.persistence.entity.Photo entity) {
        return new PhotoSnapshot(entity.id, entity.driveId, entity.upstreamId, entity.name, entity.takenAt, entity.modifiedAt,
                entity.version);
    }

}