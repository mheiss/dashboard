package cloud.heiss.dashboard.microsoft;

import java.net.URI;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import cloud.heiss.dashboard.api.AccountsApi;
import cloud.heiss.dashboard.api.model.AccountView;
import cloud.heiss.dashboard.api.model.ConnectionUrl;
import cloud.heiss.dashboard.api.model.FolderItem;
import cloud.heiss.dashboard.api.model.FolderList;
import cloud.heiss.dashboard.api.model.FolderRequest;
import cloud.heiss.dashboard.api.model.QueuedSynchronization;
import cloud.heiss.dashboard.api.model.SourceSelection;
import cloud.heiss.dashboard.api.model.SourceView;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.sync.DashboardChanges;
import cloud.heiss.dashboard.sync.SyncCoordinator;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.persistence.LockModeType;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;

/**
 * Admin endpoints for connecting Microsoft accounts and discovering, selecting, or removing their sources.
 */
@RolesAllowed("admin")
public class AccountsResource implements AccountsApi {

    @Inject
    DashboardStore store;

    @Inject
    MicrosoftAuth auth;

    @Inject
    GraphClient graph;

    @Inject
    SecurityIdentity identity;

    @Inject
    DashboardChanges changes;

    @Inject
    DashboardConfig config;

    @Inject
    SyncCoordinator synchronization;

    private List<AccountView> accounts() {
        return store.accounts().stream()
                .map(account -> new AccountView(account.id(), account.name(), account.status(), account.error(),
                        account.lastSync() == null ? null : OffsetDateTime.ofInstant(account.lastSync(), ZoneOffset.UTC),
                        store.sources(account.id()).stream()
                                .map(source -> new SourceView(source.id(), SourceView.KindEnum.fromValue(source.kind()),
                                        source.name(), SourceView.ThemeEnum.fromValue(source.theme()), source.selected(),
                                        SourceView.SyncStatusEnum.fromValue(source.syncStatus()), source.syncError(),
                                        source.syncLastSync() == null ? null
                                                : OffsetDateTime.ofInstant(source.syncLastSync(), ZoneOffset.UTC),
                                        source.kind().equals("PHOTOS") ? source.fileCount() : null))
                                .toList()))
                .toList();
    }

    @Override
    public Response getAccounts() {
        return Response.ok(accounts()).build();
    }

    @Override
    public Response connectAccount() {
        return Response.ok(new ConnectionUrl(URI.create(auth.connectUrl(identity.getPrincipal().getName())))).build();
    }

    @GET
    @Path("/api/accounts/callback")
    @PermitAll
    public Response relayAccountConnection(@QueryParam("code") String code, @QueryParam("state") String state) {
        if (code == null || code.isBlank() || state == null || state.isBlank() || code.length() > 16384
                || state.length() > 1024) {
            throw new BadRequestException("Invalid account connection callback");
        }
        String base = config.uiBasePath();
        return Response
                .seeOther(UriBuilder.fromPath(base + (base.endsWith("/") ? "" : "/") + "setup").queryParam("microsoft_code", code)
                        .queryParam("microsoft_state", state).build())
                .header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer").build();
    }

    @Override
    public Response completeAccountConnection(String code, String state) {
        UUID accountId = auth.complete(identity.getPrincipal().getName(), state, code);
        try {
            discoverSources(accountId);
        } catch (RuntimeException exception) {
            store.update("update MicrosoftAccount set error=?1 where id=?2", "Source discovery failed; retry in setup",
                    accountId);
        }
        return Response.noContent().build();
    }

    @Override
    public Response discoverAccountSources(UUID accountId) {
        discoverSources(accountId);
        return Response.ok(accounts()).build();
    }

    @Override
    public Response browseAccountFolders(UUID accountId, String parentId, String driveId) {
        store.account(accountId);
        if ((parentId == null) != (driveId == null) || (parentId != null
                && (parentId.isBlank() || driveId.isBlank() || parentId.length() > 255 || driveId.length() > 255))) {
            throw new BadRequestException("Invalid OneDrive folder location");
        }
        String endpoint = parentId == null ? "me/drive/root/children"
                : "drives/" + GraphClient.segment(driveId) + "/items/" + GraphClient.segment(parentId) + "/children";
        var folders = new ArrayList<FolderItem>();
        graph.pages(accountId, endpoint + "?$select=id,name,folder,parentReference,remoteItem", page -> {
            for (var item : page.path("value")) {
                var target = item.has("remoteItem") ? item.path("remoteItem") : item;
                String id = target.path("id").asText();
                String folderDriveId = target.path("parentReference").path("driveId").asText();
                if (target.has("folder") && !id.isBlank() && !folderDriveId.isBlank()) {
                    String name = target.path("name").asText();
                    if (name.isBlank()) {
                        name = item.path("name").asText();
                    }
                    if (name.isBlank()) {
                        name = "OneDrive folder";
                    }
                    folders.add(new FolderItem(id, folderDriveId, name));
                }
            }
        });
        return Response.ok(new FolderList(folders)).build();
    }

    private void discoverSources(UUID accountId) {
        store.account(accountId);
        for (var calendar : graph.list(accountId, "me/calendars")) {
            saveSource(accountId, "CALENDAR", calendar.path("id").asText(), null, calendar.path("name").asText("Calendar"));
        }
    }

    @Override
    public Response addAccountFolder(UUID accountId, FolderRequest request) {
        if (request == null || request.getId() == null || request.getId().isBlank() || request.getId().length() > 255
                || request.getDriveId() == null || request.getDriveId().isBlank() || request.getDriveId().length() > 255) {
            throw new BadRequestException("A OneDrive folder selection is required");
        }
        store.account(accountId);
        var item = graph.get(accountId,
                "drives/" + GraphClient.segment(request.getDriveId()) + "/items/" + GraphClient.segment(request.getId()));
        var target = item.has("remoteItem") ? item.path("remoteItem") : item;
        if (!target.has("folder") || target.path("id").asText().isBlank()
                || target.path("parentReference").path("driveId").asText().isBlank()
                || !request.getId().equals(target.path("id").asText())) {
            throw new BadRequestException("The selected item is not an accessible OneDrive folder");
        }
        saveSource(accountId, "PHOTOS", target.path("id").asText(), target.path("parentReference").path("driveId").asText(),
                target.path("name").asText("OneDrive folder"), true);
        long revision = store.inTransaction(manager -> {
            manager.createQuery("update MicrosoftAccount set requested=true,retryAfter=null where id=?1")
                    .setParameter(1, accountId).executeUpdate();
            return DashboardStore.advanceRevision(manager);
        });
        changes.publish("ALL", revision);
        return Response.ok(accounts()).build();
    }

    private void saveSource(UUID accountId, String kind, String upstreamId, String driveId, String name) {
        saveSource(accountId, kind, upstreamId, driveId, name, false);
    }

    private void saveSource(UUID accountId, String kind, String upstreamId, String driveId, String name, boolean selected) {
        if (upstreamId.isBlank()) {
            throw new BadRequestException("Invalid Microsoft source");
        }
        store.inTransaction(manager -> {
            var existing = manager
                    .createQuery("from DashboardSource where accountId=?1 and kind=?2 and upstreamId=?3", DashboardSource.class)
                    .setParameter(1, accountId).setParameter(2, kind).setParameter(3, upstreamId)
                    .setLockMode(LockModeType.PESSIMISTIC_WRITE).getResultList();
            if (existing.isEmpty()) {
                var entity = new DashboardSource();
                entity.id = UUID.randomUUID();
                entity.accountId = accountId;
                entity.kind = kind;
                entity.upstreamId = upstreamId;
                entity.driveId = driveId;
                entity.name = name;
                entity.selected = selected;
                manager.persist(entity);
            } else {
                existing.getFirst().name = name;
                existing.getFirst().driveId = driveId;
                if (selected) {
                    existing.getFirst().selected = true;
                }
            }
            return null;
        });
    }

    @Override
    public Response selectAccountSource(UUID sourceId, SourceSelection request) {
        if (request == null || request.getTheme() == null || request.getSelected() == null) {
            throw new BadRequestException("Choose a supported calendar theme");
        }
        long revision = store.inTransaction(manager -> {
            var source = java.util.Optional
                    .ofNullable(manager.find(DashboardSource.class, sourceId, LockModeType.PESSIMISTIC_WRITE))
                    .orElseThrow(jakarta.ws.rs.NotFoundException::new);
            source.selected = request.getSelected();
            source.theme = request.getTheme().value();
            manager.createQuery("update MicrosoftAccount set requested=true,retryAfter=null where id=?1")
                    .setParameter(1, source.accountId).executeUpdate();
            return DashboardStore.advanceRevision(manager);
        });
        changes.publish("ALL", revision);
        return Response.ok(accounts()).build();
    }

    @Override
    public Response requestSync() {
        synchronization.requestSync();
        return Response.ok(new QueuedSynchronization(QueuedSynchronization.StatusEnum.QUEUED)).build();
    }

    @Override
    public Response disconnectAccount(UUID accountId) {
        var subscriptions = store.list("select id from GraphSubscription where accountId=?1", String.class, accountId);
        for (String subscription : subscriptions) {
            try {
                graph.json(accountId, "subscriptions/" + GraphClient.segment(subscription), "DELETE", null);
            } catch (RuntimeException ignored) {
            }
        }
        long revision = store.inTransaction(manager -> {
            manager.createQuery("delete from MicrosoftAccount where id=?1").setParameter(1, accountId).executeUpdate();
            manager.createQuery("delete from Photo p where not exists (select 1 from PhotoMembership m where m.photoId=p.id)")
                    .executeUpdate();
            return DashboardStore.advanceRevision(manager);
        });
        changes.publish("ALL", revision);
        return Response.noContent().build();
    }
}