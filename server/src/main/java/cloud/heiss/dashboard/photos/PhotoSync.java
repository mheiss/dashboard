package cloud.heiss.dashboard.photos;

import cloud.heiss.dashboard.persistence.model.SourceSnapshot;
import cloud.heiss.dashboard.microsoft.GraphFailure;
import cloud.heiss.dashboard.calendar.CalendarSync;
import cloud.heiss.dashboard.sync.DashboardChanges;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.microsoft.GraphClient;
import cloud.heiss.dashboard.persistence.entity.Photo;
import cloud.heiss.dashboard.persistence.entity.PhotoMembership;
import cloud.heiss.dashboard.persistence.entity.SourceItem;
import cloud.heiss.dashboard.persistence.entity.SourceItemId;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.UUID;

/** Stages OneDrive folder deltas and transactionally reconciles shared photos, memberships, and checkpoints. */
@ApplicationScoped
public class PhotoSync {

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
        String endpoint = source.deltaLink();
        if (endpoint == null) {
            store.update("delete from SourceItem where sourceId=?1", source.id());
            endpoint = "drives/" + GraphClient.segment(source.driveId()) + "/items/" + GraphClient.segment(source.upstreamId())
                    + "/delta";
        }
        String delta;
        try {
            delta = graph.pages(source.accountId(), endpoint, page -> stage(source, page));
        } catch (GraphFailure failure) {
            if (failure.status == 410) {
                store.update("update DashboardSource set deltaLink=null where id=?1", source.id());
            }
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
        long revision = store.inTransaction(manager -> reconcile(manager, source, nodes, delta));
        if (revision >= 0) {
            changes.publish("IMAGES", revision);
        }
    }

    private void stage(SourceSnapshot source, JsonNode page) {
        store.inTransaction(manager -> {
            for (var item : page.path("value")) {
                String id = item.path("id").asText();
                if (id.isBlank()) {
                    continue;
                }
                if (item.has("deleted")) {
                    var key = new SourceItemId();
                    key.sourceId = source.id();
                    key.upstreamId = id;
                    var existing = manager.find(SourceItem.class, key);
                    if (existing != null) {
                        manager.remove(existing);
                        manager.flush();
                    }
                } else {
                    var entity = new SourceItem();
                    entity.sourceId = source.id();
                    entity.upstreamId = id;
                    entity.parentId = item.path("parentReference").path("id").asText(null);
                    entity.payload = item.toString();
                    manager.merge(entity);
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
        var old = new HashSet<>(manager
                .createQuery("select p from Photo p join PhotoMembership m on m.photoId=p.id where m.sourceId=?1", Photo.class)
                .setParameter(1, source.id()).getResultList().stream().map(photo -> photo.id + ":" + photo.version).toList());
        var next = new HashSet<String>();
        var memberships = new HashSet<UUID>();
        manager.createQuery("delete from PhotoMembership where sourceId=?1").setParameter(1, source.id()).executeUpdate();
        for (var item : nodes.values()) {
            var target = item.has("remoteItem") ? item.path("remoteItem") : item;
            if (!target.has("photo") || !insideFolder(item.path("id").asText(), source.upstreamId(), nodes)) {
                continue;
            }
            String drive = target.path("parentReference").path("driveId").asText(source.driveId());
            String itemId = target.path("id").asText();
            if (itemId.isBlank() || drive == null || drive.isBlank()) {
                continue;
            }
            var found = manager.createQuery("from Photo where driveId=?1 and upstreamId=?2", Photo.class).setParameter(1, drive)
                    .setParameter(2, itemId).getResultList();
            var photo = found.isEmpty() ? new Photo() : found.getFirst();
            UUID photoId = found.isEmpty() ? UUID.randomUUID() : photo.id;
            if (!memberships.add(photoId)) {
                continue;
            }
            Instant modified = parseDate(target.path("lastModifiedDateTime").asText(null));
            if (modified == null) {
                modified = Instant.EPOCH;
            }
            Instant taken = parseDate(target.path("photo").path("takenDateTime").asText(null));
            var date = taken == null ? null : taken.atZone(ZoneId.of(config.zone())).toLocalDate();
            String version = target.path("eTag").asText(modified.toString());
            photo.id = photoId;
            photo.driveId = drive;
            photo.upstreamId = itemId;
            photo.name = target.path("name").asText(itemId);
            photo.takenAt = taken;
            photo.takenDay = date == null ? null : date.getDayOfMonth();
            photo.takenMonth = date == null ? null : date.getMonthValue();
            photo.takenYear = date == null ? null : date.getYear();
            photo.modifiedAt = modified;
            photo.version = version;
            if (found.isEmpty()) {
                manager.persist(photo);
            }
            var membership = new PhotoMembership();
            membership.photoId = photoId;
            membership.sourceId = source.id();
            manager.persist(membership);
            next.add(photoId + ":" + version);
        }
        manager.flush();
        manager.createQuery("delete from Photo p where not exists (select 1 from PhotoMembership m where m.photoId=p.id)")
                .executeUpdate();
        selected.deltaLink = delta;
        return old.equals(next) ? -1 : DashboardStore.advanceRevision(manager);
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
}