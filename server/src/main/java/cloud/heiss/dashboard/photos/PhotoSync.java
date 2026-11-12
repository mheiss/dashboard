package cloud.heiss.dashboard.photos;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;

import org.jboss.logging.Logger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import cloud.heiss.dashboard.calendar.CalendarSync;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.microsoft.GraphClient;
import cloud.heiss.dashboard.microsoft.GraphFailure;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.entity.Photo;
import cloud.heiss.dashboard.persistence.entity.PhotoMembership;
import cloud.heiss.dashboard.persistence.entity.SourceItem;
import cloud.heiss.dashboard.persistence.model.SourceSnapshot;
import cloud.heiss.dashboard.sync.DashboardChanges;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;

/** Stages OneDrive folder deltas and transactionally reconciles shared photos, memberships, and checkpoints. */
@ApplicationScoped
public class PhotoSync {

    private static final Logger LOG = Logger.getLogger(PhotoSync.class);

    @Inject
    GraphClient graph;
    @Inject
    DashboardStore store;
    @Inject
    DashboardConfig config;
    @Inject
    ObjectMapper mapper;
    @Inject
    DashboardChanges changes;

    public void sync(SourceSnapshot source) {
        long startedAt = System.nanoTime();
        String accountName = safeName(store.account(source.accountId()).name());
        String sourceName = safeName(source.name());
        String endpoint = source.deltaLink();
        boolean fullSync = endpoint == null;
        if (endpoint == null) {
            store.update("delete from SourceItem where sourceId=?1", source.id());
            endpoint = "drives/" + GraphClient.segment(source.driveId()) + "/items/" + GraphClient.segment(source.upstreamId())
                    + "/delta";
        }
        LOG.infof("Photo sync started accountName=\"%s\" sourceName=\"%s\" mode=%s", accountName, sourceName,
                fullSync ? "full" : "delta");
        int[] pageCount = { 0 };
        int[] itemCount = { 0 };
        String delta;
        try {
            delta = graph.pages(source.accountId(), endpoint, page -> {
                pageCount[0]++;
                itemCount[0] += page.path("value").size();
                stage(source, page);
                if (pageCount[0] == 1 || pageCount[0] % 10 == 0) {
                    LOG.infof("Photo sync progress accountName=\"%s\" sourceName=\"%s\" pages=%d graphItems=%d", accountName,
                            sourceName, pageCount[0], itemCount[0]);
                }
            });
        } catch (GraphFailure failure) {
            if (failure.status == 410) {
                store.update("update DashboardSource set deltaLink=null where id=?1", source.id());
            }
            LOG.warnf(
                    "Photo sync Graph failure accountName=\"%s\" sourceName=\"%s\" status=%d retryAt=%s pages=%d "
                            + "graphItems=%d elapsedMs=%d",
                    accountName, sourceName, failure.status, failure.retryAt, pageCount[0], itemCount[0],
                    elapsedMillis(startedAt));
            throw failure;
        }
        if (delta == null) {
            throw new IllegalStateException("OneDrive delta checkpoint missing");
        }
        Map<String, JsonNode> nodes = new HashMap<>();
        for (var json : store.list("select payload from SourceItem where sourceId=?1", String.class, source.id())) {
            try {
                var node = mapper.readTree(json);
                nodes.put(node.path("id").asText(), node);
            } catch (Exception exception) {
                throw new IllegalStateException("Stored OneDrive metadata invalid", exception);
            }
        }
        long folderPhotos = nodes.values().stream().filter(item -> {
            var target = item.has("remoteItem") ? item.path("remoteItem") : item;
            return target.has("photo") && insideFolder(item.path("id").asText(), source.upstreamId(), nodes);
        }).count();
        long revision = store.inTransaction(manager -> reconcile(manager, source, nodes, delta));
        if (revision >= 0) {
            changes.publish("IMAGES", revision);
        }
        long storedPhotos = store.list("select count(m) from PhotoMembership m where m.sourceId=?1", Long.class, source.id())
                .getFirst();
        LOG.infof(
                "Photo sync completed accountName=\"%s\" sourceName=\"%s\" pages=%d graphItems=%d stagedItems=%d "
                        + "matchedPhotos=%d sourcePhotos=%d changed=%s durationMs=%d",
                accountName, sourceName, pageCount[0], itemCount[0], nodes.size(), folderPhotos, storedPhotos, revision >= 0,
                elapsedMillis(startedAt));
    }

    private void stage(SourceSnapshot source, JsonNode page) {
        store.inTransaction(manager -> {
            var items = new HashMap<String, JsonNode>();
            for (var item : page.path("value")) {
                String id = item.path("id").asText();
                if (!id.isBlank()) {
                    items.put(id, item);
                }
            }
            if (items.isEmpty()) {
                return null;
            }
            var existing = new HashMap<String, SourceItem>();
            var ids = new ArrayList<>(items.keySet());
            for (int offset = 0; offset < ids.size(); offset += 500) {
                var batch = ids.subList(offset, Math.min(offset + 500, ids.size()));
                manager.createQuery("from SourceItem where sourceId=?1 and upstreamId in ?2", SourceItem.class)
                        .setParameter(1, source.id()).setParameter(2, batch).getResultList()
                        .forEach(item -> existing.put(item.upstreamId, item));
            }
            for (var entry : items.entrySet()) {
                var entity = existing.get(entry.getKey());
                if (entry.getValue().has("deleted")) {
                    if (entity != null) {
                        manager.remove(entity);
                    }
                    continue;
                }
                if (entity == null) {
                    entity = new SourceItem();
                    entity.sourceId = source.id();
                    entity.upstreamId = entry.getKey();
                }
                entity.parentId = entry.getValue().path("parentReference").path("id").asText(null);
                entity.payload = entry.getValue().toString();
                if (!existing.containsKey(entry.getKey())) {
                    manager.persist(entity);
                }
            }
            return null;
        });
    }

    public static boolean insideFolder(String id, String folderId, Map<String, JsonNode> nodes) {
        var visited = new HashSet<String>();
        String current = id;
        while (current != null && visited.add(current)) {
            if (current.equals(folderId)) {
                return true;
            }
            var item = nodes.get(current);
            if (item == null) {
                return false;
            }
            current = item.path("parentReference").path("id").asText(null);
        }
        return false;
    }

    private long reconcile(EntityManager manager, SourceSnapshot source, Map<String, JsonNode> nodes, String delta) {
        var selected = manager.find(DashboardSource.class, source.id(), LockModeType.PESSIMISTIC_WRITE);
        if (selected == null || !selected.selected) {
            return -1;
        }
        var existingPhotos = new HashMap<PhotoKey, Photo>();
        var previousPhotos = manager
                .createQuery("select p from Photo p join PhotoMembership m on m.photoId=p.id where m.sourceId=?1", Photo.class)
                .setParameter(1, source.id()).getResultList();
        previousPhotos.forEach(photo -> existingPhotos.put(new PhotoKey(photo.driveId, photo.upstreamId), photo));
        var old = new HashSet<String>();
        previousPhotos.forEach(photo -> old.add(photo.id + ":" + photo.version + ":" + photo.width + ":" + photo.height));

        var desiredPhotos = new HashMap<PhotoKey, PhotoData>();
        int fileCount = 0;
        for (var item : nodes.values()) {
            var target = item.has("remoteItem") ? item.path("remoteItem") : item;
            if (!insideFolder(item.path("id").asText(), source.upstreamId(), nodes)) {
                continue;
            }
            if (target.has("file")) {
                fileCount++;
            }
            if (!target.has("photo")) {
                continue;
            }
            String drive = target.path("parentReference").path("driveId").asText(source.driveId());
            String itemId = target.path("id").asText();
            if (itemId.isBlank() || drive == null || drive.isBlank()) {
                continue;
            }
            Instant modified = parseDate(target.path("lastModifiedDateTime").asText(null));
            if (modified == null) {
                modified = Instant.EPOCH;
            }
            Instant taken = parseDate(target.path("photo").path("takenDateTime").asText(null));
            var date = taken == null ? null : taken.atZone(ZoneId.of(config.zone())).toLocalDate();
            String version = target.path("eTag").asText(modified.toString());
            int width = target.path("image").path("width").asInt(0);
            int height = target.path("image").path("height").asInt(0);
            var key = new PhotoKey(drive, itemId);
            desiredPhotos.put(key,
                    new PhotoData(target.path("name").asText(itemId), taken, date == null ? null : date.getDayOfMonth(),
                            date == null ? null : date.getMonthValue(), date == null ? null : date.getYear(), modified, version,
                            width > 0 && height > 0 ? width : null, width > 0 && height > 0 ? height : null));
        }

        var missingKeys = desiredPhotos.keySet().stream().filter(key -> !existingPhotos.containsKey(key)).toList();
        for (int offset = 0; offset < missingKeys.size(); offset += 250) {
            var batch = missingKeys.subList(offset, Math.min(offset + 250, missingKeys.size()));
            var predicate = new StringBuilder();
            for (int index = 0; index < batch.size(); index++) {
                if (index > 0) {
                    predicate.append(" or ");
                }
                predicate.append("(p.driveId=?").append(index * 2 + 1).append(" and p.upstreamId=?").append(index * 2 + 2)
                        .append(')');
            }
            var query = manager.createQuery("from Photo p where " + predicate, Photo.class);
            for (int index = 0; index < batch.size(); index++) {
                query.setParameter(index * 2 + 1, batch.get(index).driveId());
                query.setParameter(index * 2 + 2, batch.get(index).upstreamId());
            }
            query.getResultList().forEach(photo -> existingPhotos.put(new PhotoKey(photo.driveId, photo.upstreamId), photo));
        }

        var next = new HashSet<String>();
        var memberships = new ArrayList<PhotoMembership>(desiredPhotos.size());
        for (var entry : desiredPhotos.entrySet()) {
            var photo = existingPhotos.get(entry.getKey());
            boolean newPhoto = photo == null;
            if (photo == null) {
                photo = new Photo();
                photo.id = UUID.randomUUID();
                photo.driveId = entry.getKey().driveId();
                photo.upstreamId = entry.getKey().upstreamId();
            }
            apply(photo, entry.getValue());
            if (newPhoto) {
                manager.persist(photo);
            }
            var membership = new PhotoMembership();
            membership.photoId = photo.id;
            membership.sourceId = source.id();
            memberships.add(membership);
            next.add(photo.id + ":" + photo.version + ":" + photo.width + ":" + photo.height);
        }
        manager.createQuery("delete from PhotoMembership where sourceId=?1").setParameter(1, source.id()).executeUpdate();
        for (var membership : memberships) {
            manager.persist(membership);
        }
        manager.flush();
        manager.createQuery("delete from Photo p where not exists (select 1 from PhotoMembership m where m.photoId=p.id)")
                .executeUpdate();
        selected.deltaLink = delta;
        selected.fileCount = fileCount;
        return old.equals(next) ? -1 : DashboardStore.advanceRevision(manager);
    }

    private static void apply(Photo photo, PhotoData data) {
        photo.name = data.name();
        photo.takenAt = data.takenAt();
        photo.takenDay = data.takenDay();
        photo.takenMonth = data.takenMonth();
        photo.takenYear = data.takenYear();
        photo.modifiedAt = data.modifiedAt();
        photo.version = data.version();
        photo.width = data.width();
        photo.height = data.height();
    }

    private record PhotoKey(String driveId, String upstreamId) {
    }

    private record PhotoData(String name, Instant takenAt, Integer takenDay, Integer takenMonth, Integer takenYear,
            Instant modifiedAt, String version, Integer width, Integer height) {
    }

    private static Instant parseDate(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return CalendarSync.graphInstant(value);
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static long elapsedMillis(long startedAt) {
        return (System.nanoTime() - startedAt) / 1_000_000;
    }

    private static String safeName(String value) {
        if (value == null || value.isBlank()) {
            return "unnamed";
        }
        String safe = value.replaceAll("[\\p{Cntrl}]", " ").replace('"', '\'');
        return safe.length() <= 80 ? safe : safe.substring(0, 77) + "...";
    }
}