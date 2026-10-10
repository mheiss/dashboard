package cloud.heiss.dashboard.config;

import java.util.Optional;

/** Microsoft OAuth client credentials, redirect URI, and optional public webhook URL. */
public interface MicrosoftConfig {

    Optional<String> clientId();

    Optional<String> clientSecret();

    String redirectUri();

    Optional<String> webhookUrl();
}