package cloud.heiss.dashboard.microsoft;

import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.persistence.DashboardStore;
import cloud.heiss.dashboard.persistence.model.AccountSnapshot;
import cloud.heiss.dashboard.persistence.entity.MicrosoftAccount;
import cloud.heiss.dashboard.security.TokenCipher;

import com.microsoft.aad.msal4j.AuthorizationCodeParameters;
import com.microsoft.aad.msal4j.AuthorizationRequestUrlParameters;
import com.microsoft.aad.msal4j.ClientCredentialFactory;
import com.microsoft.aad.msal4j.ConfidentialClientApplication;
import com.microsoft.aad.msal4j.Prompt;
import com.microsoft.aad.msal4j.ResponseMode;
import com.microsoft.aad.msal4j.SilentParameters;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.BadRequestException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/** Manages delegated Microsoft OAuth with PKCE and encrypted token caches for connected accounts. */
@ApplicationScoped
public class MicrosoftAuth {

    private static final Set<String> SCOPES = Set.of("User.Read", "Calendars.Read", "Files.Read");
    private final ConcurrentHashMap<String, PendingConnection> pending = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<UUID, Object> locks = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    @Inject
    DashboardConfig config;
    @Inject
    DashboardStore store;
    @Inject
    TokenCipher cipher;

    public String connectUrl(String owner) {
        pending.entrySet().removeIf(entry -> entry.getValue().expires().isBefore(Instant.now()));
        if (pending.size() >= 100) {
            throw new BadRequestException("Too many pending account connections");
        }
        String state = randomString();
        String verifier = randomString();
        try {
            String challenge = Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
            var parameters = AuthorizationRequestUrlParameters
                    .builder(config.microsoft().redirectUri(),
                            Set.of("User.Read", "Calendars.Read", "Files.Read", "offline_access"))
                    .responseMode(ResponseMode.QUERY).state(state).codeChallenge(challenge).codeChallengeMethod("S256")
                    .prompt(Prompt.SELECT_ACCOUNT).build();
            var application = application();
            cipher.encrypt("configuration-check");
            pending.put(state, new PendingConnection(owner, verifier, Instant.now().plusSeconds(600)));
            return application.getAuthorizationRequestUrl(parameters).toString();
        } catch (BadRequestException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("Microsoft account connection is not configured", exception);
        }
    }

    public UUID complete(String owner, String state, String code) {
        PendingConnection request = state == null ? null : pending.remove(state);
        if (request == null || !request.owner().equals(owner) || request.expires().isBefore(Instant.now()) || code == null
                || code.isBlank()) {
            throw new BadRequestException("Expired or invalid account connection; start again");
        }
        try {
            var application = application();
            var result = application
                    .acquireToken(AuthorizationCodeParameters.builder(code, URI.create(config.microsoft().redirectUri()))
                            .scopes(SCOPES).codeVerifier(request.verifier()).build())
                    .get(45, TimeUnit.SECONDS);
            String microsoftId = result.account().homeAccountId();
            var existing = store.accounts().stream().filter(account -> account.microsoftId().equals(microsoftId)).findFirst();
            UUID id = existing.map(AccountSnapshot::id).orElseGet(UUID::randomUUID);
            synchronized (locks.computeIfAbsent(id, ignored -> new Object())) {
                String cache = cipher.encrypt(application.tokenCache().serialize());
                if (existing.isPresent()) {
                    store.update("update MicrosoftAccount set tokenCache=?1,name=?2,status='CONNECTED',error=null,"
                            + "requested=true,retryAfter=null where id=?3", cache, result.account().username(), id);
                } else {
                    var entity = new MicrosoftAccount();
                    entity.id = id;
                    entity.microsoftId = microsoftId;
                    entity.name = result.account().username();
                    entity.tokenCache = cache;
                    store.persist(entity);
                }
            }
            return id;
        } catch (Exception exception) {
            throw new BadRequestException("Microsoft sign-in failed; restart account connection");
        }
    }

    public String token(UUID id, boolean refresh) {
        synchronized (locks.computeIfAbsent(id, ignored -> new Object())) {
            try {
                var saved = store.account(id);
                var application = application();
                application.tokenCache().deserialize(cipher.decrypt(saved.cache()));
                var account = application.getAccounts().get(15, TimeUnit.SECONDS).stream()
                        .filter(candidate -> candidate.homeAccountId().equals(saved.microsoftId())).findFirst()
                        .orElseThrow(() -> new IllegalStateException("Account no longer present in token cache"));
                var result = application
                        .acquireTokenSilently(SilentParameters.builder(SCOPES, account).forceRefresh(refresh).build())
                        .get(45, TimeUnit.SECONDS);
                store.update("update MicrosoftAccount set tokenCache=?1 where id=?2",
                        cipher.encrypt(application.tokenCache().serialize()), id);
                return result.accessToken();
            } catch (Exception exception) {
                Throwable cause = exception;
                while (cause.getCause() != null) {
                    cause = cause.getCause();
                }
                if (cause instanceof com.microsoft.aad.msal4j.MsalInteractionRequiredException) {
                    store.update("update MicrosoftAccount set status='RECONNECT_REQUIRED',error=?1,requested=false where id=?2",
                            "Microsoft consent or sign-in is required again", id);
                }
                throw new IllegalStateException("Microsoft authentication unavailable", exception);
            }
        }
    }

    private ConfidentialClientApplication application() throws Exception {
        var microsoft = config.microsoft();
        return ConfidentialClientApplication
                .builder(microsoft.clientId().orElseThrow(),
                        ClientCredentialFactory.createFromSecret(microsoft.clientSecret().orElseThrow()))
                .authority("https://login.microsoftonline.com/consumers/").connectTimeoutForDefaultHttpClient(10000)
                .readTimeoutForDefaultHttpClient(30000).logPii(false).build();
    }

    private String randomString() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}