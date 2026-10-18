package cloud.heiss.dashboard.security;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Instant;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager;
import io.smallrye.jwt.build.Jwt;
import io.vertx.core.Vertx;
import io.vertx.core.http.HttpServer;
import io.vertx.core.json.JsonObject;

public class OidcTestResource implements QuarkusTestResourceLifecycleManager {

    private static KeyPair keys;
    private static String issuer;
    private Vertx vertx;
    private HttpServer server;

    @Override
    public Map<String, String> start() {
        try {
            var generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            keys = generator.generateKeyPair();
            var publicKey = (RSAPublicKey) keys.getPublic();
            var jwk = Map.of("kty", "RSA", "kid", "dashboard-test", "alg", "RS256", "use", "sig", "n",
                    unsigned(publicKey.getModulus()), "e", unsigned(publicKey.getPublicExponent()));
            vertx = Vertx.vertx();
            server = vertx.createHttpServer().requestHandler(request -> {
                var response = request.response().putHeader("Content-Type", "application/json");
                if (request.path().endsWith("/.well-known/openid-configuration")) {
                    response.end(new JsonObject().put("issuer", issuer).put("jwks_uri", issuer + "/certs")
                            .put("authorization_endpoint", issuer + "/auth").put("token_endpoint", issuer + "/token")
                            .put("response_types_supported", java.util.List.of("code"))
                            .put("subject_types_supported", java.util.List.of("public"))
                            .put("id_token_signing_alg_values_supported", java.util.List.of("RS256")).encode());
                } else if (request.path().endsWith("/certs")) {
                    response.end(new JsonObject().put("keys", java.util.List.of(jwk)).encode());
                } else {
                    response.setStatusCode(404).end();
                }
            }).listen(0, "localhost").toCompletionStage().toCompletableFuture().get(10, TimeUnit.SECONDS);
            issuer = "http://localhost:" + server.actualPort() + "/realms/dashboard";
            return Map.of("quarkus.oidc.auth-server-url", issuer);
        } catch (Exception failure) {
            throw new IllegalStateException("Cannot start OIDC fixture", failure);
        }
    }

    private static String unsigned(BigInteger value) {
        byte[] bytes = value.toByteArray();
        return Base64.getUrlEncoder().withoutPadding()
                .encodeToString(bytes[0] == 0 ? Arrays.copyOfRange(bytes, 1, bytes.length) : bytes);
    }

    public static String adminToken() {
        return token(Map.of("resource_access", Map.of("dashboard", Map.of("roles", java.util.List.of("admin")))));
    }

    public static String token(Map<String, Object> claims) {
        return token(claims, issuer, "dashboard", Instant.now().plusSeconds(300));
    }

    public static String token(Map<String, Object> claims, String audience, Instant expires) {
        return token(claims, issuer, audience, expires);
    }

    public static String token(Map<String, Object> claims, String tokenIssuer, String audience, Instant expires) {
        return Jwt.claims(claims).issuer(tokenIssuer).subject("fixture-user").audience(audience)
                .claim("preferred_username", "fixture-admin").issuedAt(Instant.now().minusSeconds(600).getEpochSecond())
                .expiresAt(expires.getEpochSecond()).jws().keyId("dashboard-test").sign(keys.getPrivate());
    }

    @Override
    public void stop() {
        if (vertx != null) {
            vertx.close().toCompletionStage().toCompletableFuture().join();
        }
    }
}