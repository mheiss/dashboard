package cloud.heiss.dashboard.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;

import cloud.heiss.dashboard.config.DashboardConfig;

class TokenCipherTest {

    @Test
    void acceptsPassphrasesWithoutSpecialEncodingAcrossInstances() {
        for (String secret : List.of("x", "my-secret-dev-token", "a long passphrase with spaces", "caf\u00e9 \u5bb6")) {
            String encrypted = cipher(secret).encrypt("Microsoft token cache");
            assertFalse(encrypted.contains(":"));
            assertEquals("Microsoft token cache", cipher(secret).decrypt(encrypted));
        }
    }

    @Test
    void generatesFreshSaltAndCiphertextForEachEncryption() {
        var cipher = cipher("a unique household passphrase");
        String first = cipher.encrypt("Microsoft token cache");
        String second = cipher.encrypt("Microsoft token cache");
        assertNotEquals(first, second);
        byte[] firstBytes = Base64.getDecoder().decode(first);
        byte[] secondBytes = Base64.getDecoder().decode(second);
        assertFalse(Arrays.equals(Arrays.copyOf(firstBytes, 16), Arrays.copyOf(secondBytes, 16)));
        assertEquals("Microsoft token cache", cipher.decrypt(first));
        assertEquals("Microsoft token cache", cipher.decrypt(second));
    }

    @Test
    void rejectsWrongPassphraseAndTamperedData() {
        var cipher = cipher("the original household passphrase");
        String encrypted = cipher.encrypt("Microsoft token cache");
        assertThrows(IllegalStateException.class, () -> cipher("another passphrase").decrypt(encrypted));
        byte[] bytes = Base64.getDecoder().decode(encrypted);
        for (int index : new int[] { 0, 16, bytes.length - 1 }) {
            byte[] tampered = bytes.clone();
            tampered[index] ^= 1;
            assertThrows(IllegalStateException.class, () -> cipher.decrypt(Base64.getEncoder().encodeToString(tampered)));
        }
    }

    @Test
    void rejectsMissingAndBlankSecrets() {
        assertThrows(IllegalStateException.class, () -> cipher(null).encrypt("tokens"));
        assertThrows(IllegalStateException.class, () -> cipher("").encrypt("tokens"));
        assertThrows(IllegalStateException.class, () -> cipher("   ").encrypt("tokens"));
    }

    @Test
    void rejectsLegacyTokensEvenWithTheOriginalBase64Key() throws Exception {
        byte[] key = new byte[32];
        byte[] nonce = new byte[12];
        var legacy = Cipher.getInstance("AES/GCM/NoPadding");
        legacy.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
        byte[] encrypted = legacy.doFinal("Existing Microsoft tokens".getBytes(StandardCharsets.UTF_8));
        String stored = Base64.getEncoder()
                .encodeToString(ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array());
        String secret = Base64.getEncoder().encodeToString(key);
        var cipher = cipher(secret);
        assertThrows(IllegalStateException.class, () -> cipher.decrypt(stored));
        assertEquals("New Microsoft tokens", cipher(secret).decrypt(cipher.encrypt("New Microsoft tokens")));
    }

    @Test
    void rejectsMalformedPayloads() {
        var cipher = cipher("a household passphrase");
        for (String encoded : List.of("", "!", "AA==", "v1:", "v1:!", "v1:AA==", "v2:AA==")) {
            assertThrows(IllegalStateException.class, () -> cipher.decrypt(encoded));
        }
        String encrypted = cipher.encrypt("Microsoft token cache");
        assertThrows(IllegalStateException.class, () -> cipher.decrypt("v1:" + encrypted));
    }

    private TokenCipher cipher(String secret) {
        var config = mock(DashboardConfig.class);
        when(config.tokenKey()).thenReturn(Optional.ofNullable(secret));
        var cipher = new TokenCipher();
        cipher.config = config;
        return cipher;
    }
}