package cloud.heiss.dashboard.security;

import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.entity.DashboardUser;

import io.quarkus.elytron.security.common.BcryptUtil;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.NewCookie;
import jakarta.ws.rs.core.Response;
import java.util.Map;

/** Bootstraps the local administrator and exposes admin session information and cookie-based logout. */
@Path("/session")
@ApplicationScoped
@Produces(MediaType.APPLICATION_JSON)
public class SessionResource {

    @Inject
    DashboardConfig config;
    @Inject
    EntityManager entities;
    @Inject
    SecurityIdentity identity;

    @Transactional
    void initialize(@Observes StartupEvent event) {
        bootstrap("admin", config.adminPassword().orElse(""), "admin");
    }

    private void bootstrap(String username, String password, String roles) {
        if (password.isBlank()) {
            return;
        }
        if (password.length() < 12) {
            throw new IllegalStateException("Dashboard bootstrap passwords must have at least 12 characters");
        }
        var found = entities.createQuery("from DashboardUser where username = :name", DashboardUser.class)
                .setParameter("name", username).getResultList();
        if (found.isEmpty()) {
            var user = new DashboardUser();
            user.username = username;
            user.password = BcryptUtil.bcryptHash(password);
            user.roles = roles;
            entities.persist(user);
        }
    }

    @GET
    @RolesAllowed("admin")
    public Map<String, Object> current() {
        return Map.of("username", identity.getPrincipal().getName(), "admin", identity.hasRole("admin"));
    }

    @POST
    @Path("/logout")
    @RolesAllowed("admin")
    public Response logout() {
        return Response.noContent().cookie(new NewCookie.Builder("quarkus-credential").path("/").maxAge(0).httpOnly(true).build())
                .build();
    }
}