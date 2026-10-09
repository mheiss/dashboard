package cloud.heiss.dashboard.microsoft;

import cloud.heiss.dashboard.microsoft.model.AccountView;
import cloud.heiss.dashboard.microsoft.model.FolderRequest;
import cloud.heiss.dashboard.microsoft.model.SourceSelection;
import cloud.heiss.dashboard.microsoft.model.SourceView;
import cloud.heiss.dashboard.sync.DashboardChanges;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.entity.DashboardSource;
import cloud.heiss.dashboard.persistence.DashboardStore;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.persistence.LockModeType;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Admin endpoints for connecting Microsoft accounts and discovering, selecting, or removing their sources. */
@Path("/accounts")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed("admin")
public class AccountsResource {

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

    @GET
    public List<AccountView> accounts() {
        return store.accounts().stream()
                .map(account -> new AccountView(account.id().toString(), account.name(), account.status(), account.error(),
                        account.lastSync() == null ? null : account.lastSync().toString(),
                        store.sources(account.id()).stream().map(source -> new SourceView(source.id().toString(), source.kind(),
                                source.name(), source.theme(), source.selected())).toList()))
                .toList();
    }

    @POST
    @Path("/connect")
    public Map<String, String> connect() {
        return Map.of("url", auth.connectUrl(identity.getPrincipal().getName()));
    }

    @GET
    @Path("/callback")
    public Response callback(@QueryParam("state") String state, @QueryParam("code") String code) {
        UUID accountId = auth.complete(identity.getPrincipal().getName(), state, code);
        try {
            discover(accountId);
        } catch (RuntimeException exception) {
            store.update("update MicrosoftAccount set error=?1 where id=?2", "Source discovery failed; retry in setup",
                    accountId);
        }
        String base = config.uiBasePath();
        return Response.seeOther(URI.create(base + (base.endsWith("/") ? "" : "/") + "setup")).build();
    }

    @POST
    @Path("/{accountId}/discover")
    public List<AccountView> discover(@PathParam("accountId") UUID accountId) {
        store.account(accountId);
        for (var calendar : graph.list(accountId, "me/calendars")) {
            saveSource(accountId, "CALENDAR", calendar.path("id").asText(), null, calendar.path("name").asText("Calendar"));
        }
        return accounts();
    }

    @POST
    @Path("/{accountId}/folders")
    public List<AccountView> addFolder(@PathParam("accountId") UUID accountId, FolderRequest request) {
        if (request == null || request.path() == null || request.path().isBlank() || request.path().length() > 1024) {
            throw new BadRequestException("A OneDrive folder path is required");
        }
        String path = java.util.Arrays.stream(request.path().split("/")).map(GraphClient::segment)
                .collect(java.util.stream.Collectors.joining("/"));
        var item = graph.get(accountId, "me/drive/root:/" + path);
        var target = item.has("remoteItem") ? item.path("remoteItem") : item;
        if (!target.has("folder") || target.path("id").asText().isBlank()
                || target.path("parentReference").path("driveId").asText().isBlank()) {
            throw new BadRequestException("The selected item is not an accessible OneDrive folder");
        }
        saveSource(accountId, "PHOTOS", target.path("id").asText(), target.path("parentReference").path("driveId").asText(),
                item.path("name").asText(request.path()));
        return accounts();
    }

    private void saveSource(UUID accountId, String kind, String upstreamId, String driveId, String name) {
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
                manager.persist(entity);
            } else {
                existing.getFirst().name = name;
                existing.getFirst().driveId = driveId;
            }
            return null;
        });
    }

    @PUT
    @Path("/sources/{sourceId}")
    public List<AccountView> select(@PathParam("sourceId") UUID sourceId, SourceSelection request) {
        if (request == null || request.theme() == null || !List.of("emerald", "rose", "sky", "amber").contains(request.theme())) {
            throw new BadRequestException("Choose a supported calendar theme");
        }
        long revision = store.inTransaction(manager -> {
            var source = java.util.Optional
                    .ofNullable(manager.find(DashboardSource.class, sourceId, LockModeType.PESSIMISTIC_WRITE))
                    .orElseThrow(jakarta.ws.rs.NotFoundException::new);
            source.selected = request.selected();
            source.theme = request.theme();
            manager.createQuery("update MicrosoftAccount set requested=true,retryAfter=null where id=?1")
                    .setParameter(1, source.accountId).executeUpdate();
            return DashboardStore.advanceRevision(manager);
        });
        changes.publish("ALL", revision);
        return accounts();
    }

    @DELETE
    @Path("/{accountId}")
    public Response disconnect(@PathParam("accountId") UUID accountId) {
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