package cloud.heiss.dashboard.security;

import cloud.heiss.dashboard.api.SessionApi;
import cloud.heiss.dashboard.api.model.LoginRequest;
import cloud.heiss.dashboard.api.model.Session;
import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.entity.DashboardUser;
import io.quarkus.elytron.security.common.BcryptUtil;
import io.quarkus.runtime.StartupEvent;
import io.quarkus.security.AuthenticationFailedException;
import io.quarkus.security.credential.PasswordCredential;
import io.quarkus.security.identity.IdentityProviderManager;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.request.UsernamePasswordAuthenticationRequest;
import io.vertx.ext.web.RoutingContext;
import jakarta.annotation.security.PermitAll;
import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.NotAuthorizedException;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

/**
 * Bootstraps the local administrator and exposes admin session information and
 * cookie-based logout.
 */
@Path("/")
@ApplicationScoped
public class SessionResource implements SessionApi {

    @Inject
    DashboardConfig config;
    @Inject
    EntityManager entities;
    @Inject
    SecurityIdentity identity;
    @Inject
    IdentityProviderManager providers;
    @Inject
    CookieAuthentication cookies;
    @Inject
    RoutingContext context;

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

    @Override
    @RolesAllowed("admin")
    public Response getSession() {
        context.response().putHeader("Cache-Control", "no-store");
        return Response.ok(new Session(identity.getPrincipal().getName(), identity.hasRole("admin"))).build();
    }

    @Override
    @PermitAll
    public Response login(LoginRequest request) {
        context.response().putHeader("Cache-Control", "no-store");
        if (request == null || request.getUsername() == null || request.getUsername().isBlank()
                || request.getUsername().length() > 256 || request.getPassword() == null || request.getPassword().isEmpty()
                || request.getPassword().length() > 1024) {
            throw new BadRequestException("Username and password are required");
        }
        SecurityIdentity authenticated;
        try {
            authenticated = providers.authenticateBlocking(new UsernamePasswordAuthenticationRequest(request.getUsername(),
                    new PasswordCredential(request.getPassword().toCharArray())));
        } catch (AuthenticationFailedException failure) {
            throw new NotAuthorizedException("Invalid credentials");
        }
        if (!authenticated.hasRole("admin")) {
            throw new ForbiddenException();
        }
        cookies.login(authenticated, context);
        return Response.ok(new Session(authenticated.getPrincipal().getName(), true)).build();
    }

    @Override
    @RolesAllowed("admin")
    public Response logout() {
        cookies.logout(context);
        return Response.noContent().build();
    }
}