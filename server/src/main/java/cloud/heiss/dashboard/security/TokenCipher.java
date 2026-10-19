package cloud.heiss.dashboard.security;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

import cloud.heiss.dashboard.config.DashboardConfig;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

/** Encrypts and authenticates persisted Microsoft token caches using the configured dashboard key. */
@ApplicationScoped
public class TokenCipher {

    @Inject
    DashboardConfig config;
    private final SecureRandom random = new SecureRandom();

    public String encrypt(String plaintext) {
        try {
            byte[] salt = new byte[16];
            random.nextBytes(salt);
            byte[] nonce = new byte[12];
            random.nextBytes(nonce);
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(salt), new GCMParameterSpec(128, nonce));
            byte[] encrypted = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(salt.length + nonce.length + encrypted.length).put(salt)
                    .put(nonce).put(encrypted).array());
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot encrypt Microsoft credentials; check DASHBOARD_TOKEN_KEY", exception);
        }
    }

    public String decrypt(String encoded) {
        try {
            var buffer = ByteBuffer.wrap(Base64.getDecoder().decode(encoded));
            byte[] salt = new byte[16];
            buffer.get(salt);
            byte[] nonce = new byte[12];
            buffer.get(nonce);
            byte[] encrypted = new byte[buffer.remaining()];
            buffer.get(encrypted);
            var cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(salt), new GCMParameterSpec(128, nonce));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (Exception exception) {
            throw new IllegalStateException("Cannot decrypt Microsoft credentials", exception);
        }
    }

    private SecretKeySpec key(byte[] salt) throws GeneralSecurityException {
        String secret = config.tokenKey().filter(value -> !value.isBlank())
                .orElseThrow(() -> new IllegalStateException("DASHBOARD_TOKEN_KEY is required to connect Microsoft accounts"));
        var specification = new PBEKeySpec(secret.toCharArray(), salt, 600_000, 256);
        try {
            return new SecretKeySpec(
                    SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(specification).getEncoded(), "AES");
        } finally {
            specification.clearPassword();
        }
    }
}