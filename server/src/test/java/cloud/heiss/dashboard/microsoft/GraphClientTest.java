package cloud.heiss.dashboard.microsoft;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import java.net.URI;
import org.junit.jupiter.api.Test;

/** Verifies that Graph endpoints and media redirects cannot send credentials to untrusted origins. */
class GraphClientTest {

    @Test
    void deltaLinksCannotExfiltrateTokens() {
        assertEquals("graph.microsoft.com", GraphClient.graphUri("me/calendars").getHost());
        assertThrows(IllegalArgumentException.class, () -> GraphClient.graphUri("https://attacker.example/v1.0/me"));
        assertThrows(IllegalArgumentException.class, () -> GraphClient.graphUri("https://graph.microsoft.com:444/v1.0/me"));
        assertThrows(IllegalArgumentException.class, () -> GraphClient.graphUri("https://user@graph.microsoft.com/v1.0/me"));
    }

    @Test
    void mediaRedirectsMustBeTrustedHttpsOrigins() {
        GraphClient.validateMediaRedirect(URI.create("https://public.dm.files.1drv.com/photo"));
        GraphClient.validateMediaRedirect(URI.create("https://eastus1-mediap.svc.ms/transform/thumbnail"));
        GraphClient.validateMediaRedirect(URI.create("https://westeurope1-mediap.svc.ms:443/transform/thumbnail"));
        assertThrows(IllegalArgumentException.class,
                () -> GraphClient.validateMediaRedirect(URI.create("http://localhost/photo")));
        assertThrows(IllegalArgumentException.class,
                () -> GraphClient.validateMediaRedirect(URI.create("https://1drv.com.attacker.example/photo")));
        for (String redirect : new String[] { "http://eastus1-mediap.svc.ms/photo",
                "https://eastus1-mediap.svc.ms.attacker.example/photo", "https://fake-svc.ms/photo",
                "https://eastus1-mediap.svc.ms:444/photo", "https://user@eastus1-mediap.svc.ms/photo",
                "https://127.0.0.1/photo" }) {
            assertThrows(IllegalArgumentException.class, () -> GraphClient.validateMediaRedirect(URI.create(redirect)));
        }
    }

    @Test
    void rejectedRedirectReportsOnlyTheHost() {
        var exception = assertThrows(IllegalArgumentException.class,
                () -> GraphClient.validateMediaRedirect(URI.create("https://attacker.example/private-photo?token=secret")));
        assertEquals("Untrusted Microsoft media redirect host: attacker.example", exception.getMessage());
    }
}