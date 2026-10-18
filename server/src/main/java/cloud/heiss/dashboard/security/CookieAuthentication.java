package cloud.heiss.dashboard.security;

import java.time.Duration;
import java.util.Set;

import org.eclipse.microprofile.config.ConfigProvider;

import io.quarkus.security.identity.IdentityProviderManager;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.request.AuthenticationRequest;
import io.quarkus.security.identity.request.TrustedAuthenticationRequest;
import io.quarkus.vertx.http.runtime.security.ChallengeData;
import io.quarkus.vertx.http.runtime.security.HttpAuthenticationMechanism;
import io.quarkus.vertx.http.runtime.security.HttpSecurityUtils;
import io.quarkus.vertx.http.runtime.security.PersistentLoginManager;
import io.smallrye.mutiny.Uni;
import io.vertx.core.http.Cookie;
import io.vertx.ext.web.RoutingContext;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class CookieAuthentication implements HttpAuthenticationMechanism {

    private final org.eclipse.microprofile.config.Config config = ConfigProvider.getConfig();
    private final String cookieName = value("cookie-name", String.class, "quarkus-credential");
    private final String cookiePath = value("cookie-path", String.class, "/");
    private final String cookieDomain = value("cookie-domain", String.class, null);
    private final PersistentLoginManager cookies = new PersistentLoginManager(
            config.getValue("quarkus.http.auth.session.encryption-key", String.class), cookieName,
            value("timeout", Duration.class, Duration.ofHours(12)).toMillis(),
            value("new-cookie-interval", Duration.class, Duration.ofMinutes(1)).toMillis(),
            value("http-only-cookie", Boolean.class, true),
            value("cookie-same-site", String.class, "lax").toUpperCase(java.util.Locale.ROOT), cookiePath,
            value("cookie-max-age", Duration.class, Duration.ofSeconds(-1)).toSeconds(), cookieDomain);

    private <T> T value(String name, Class<T> type, T fallback) {
        return config.getOptionalValue("quarkus.http.auth.form." + name, type).orElse(fallback);
    }

    @Override
    public Uni<SecurityIdentity> authenticate(RoutingContext context, IdentityProviderManager providers) {
        var restored = cookies.restore(context);
        if (restored == null) {
            return Uni.createFrom().nullItem();
        }
        return providers
                .authenticate(HttpSecurityUtils
                        .setRoutingContextAttribute(new TrustedAuthenticationRequest(restored.getPrincipal()), context))
                .invoke(identity -> cookies.save(identity, context, restored, context.request().isSSL()));
    }

    @Override
    public Uni<ChallengeData> getChallenge(RoutingContext context) {
        return Uni.createFrom().item(new ChallengeData(401));
    }

    @Override
    public Set<Class<? extends AuthenticationRequest>> getCredentialTypes() {
        return Set.of(TrustedAuthenticationRequest.class);
    }

    public void login(SecurityIdentity identity, RoutingContext context) {
        cookies.save(identity, context, null, context.request().isSSL());
    }

    public void logout(RoutingContext context) {
        Cookie cookie = Cookie.cookie(cookieName, "").setPath(cookiePath).setMaxAge(0).setHttpOnly(true)
                .setSecure(context.request().isSSL());
        if (cookieDomain != null) {
            cookie.setDomain(cookieDomain);
        }
        context.response().addCookie(cookie);
    }
}