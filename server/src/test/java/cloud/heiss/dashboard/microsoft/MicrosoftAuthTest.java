package cloud.heiss.dashboard.microsoft;

import cloud.heiss.dashboard.config.DashboardConfig;
import cloud.heiss.dashboard.security.TokenCipher;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import jakarta.ws.rs.BadRequestException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Verifies Microsoft authorization uses the GET callback while retaining state and PKCE protection. */
class MicrosoftAuthTest {

    @Test
    void authorizationUsesQueryResponseModeAndPkce() {
        var config = mock(DashboardConfig.class, RETURNS_DEEP_STUBS);
        when(config.microsoft().clientId()).thenReturn(Optional.of("11111111-1111-1111-1111-111111111111"));
        when(config.microsoft().clientSecret()).thenReturn(Optional.of("fixture-secret"));
        when(config.microsoft().redirectUri()).thenReturn("https://dashboard.heiss.cloud/accounts/callback");
        var auth = new MicrosoftAuth();
        auth.config = config;
        auth.cipher = mock(TokenCipher.class);

        var url = URI.create(auth.connectUrl("admin"));
        String parameters = URLDecoder.decode(url.getRawQuery(), StandardCharsets.UTF_8);
        assertTrue(parameters.contains("response_mode=query"));
        assertTrue(parameters.contains("response_type=code"));
        assertTrue(parameters.contains("redirect_uri=https://dashboard.heiss.cloud/accounts/callback"));
        assertTrue(parameters.contains("code_challenge_method=S256"));
        assertTrue(parameters.matches("(?s).*\\bcode_challenge=[^&]+.*"));
        assertTrue(parameters.matches("(?s).*\\bstate=[^&]+.*"));
        assertThrows(BadRequestException.class, () -> auth.complete("admin", "invalid-state", "fixture-code"));
    }
}