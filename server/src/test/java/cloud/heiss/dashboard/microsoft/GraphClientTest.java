package cloud.heiss.dashboard.microsoft;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import java.net.URI;
import org.junit.jupiter.api.Test;

/** Verifies authenticated Graph origins and secure Graph-provided media redirects. */
class GraphClientTest {

    @Test
    void deltaLinksCannotExfiltrateTokens() {
        assertEquals("graph.microsoft.com", GraphClient.graphUri("me/calendars").getHost());
        assertThrows(IllegalArgumentException.class, () -> GraphClient.graphUri("https://attacker.example/v1.0/me"));
        assertThrows(IllegalArgumentException.class, () -> GraphClient.graphUri("https://graph.microsoft.com:444/v1.0/me"));
        assertThrows(IllegalArgumentException.class, () -> GraphClient.graphUri("https://user@graph.microsoft.com/v1.0/me"));
    }

    @Test
    void mediaRedirectsAcceptGraphProvidedHttpsHosts() {
        GraphClient.validateMediaRedirect(URI.create("https://public.dm.files.1drv.com/photo"));
        GraphClient.validateMediaRedirect(URI.create("https://eastus1-mediap.svc.ms/transform/thumbnail"));
        GraphClient.validateMediaRedirect(URI.create("https://westeurope1-mediap.svc.ms:443/transform/thumbnail"));
        GraphClient.validateMediaRedirect(URI.create("https://my.microsoftpersonalcontent.com/photo"));
        GraphClient.validateMediaRedirect(URI.create("https://new-media-cdn.example/photo"));
        GraphClient.validateMediaRedirect(URI.create("HTTPS://new-media-cdn.example/photo"));
    }

    @Test
    void mediaRedirectsMustBeSecureOrigins() {
        for (String redirect : new String[] { "http://my.microsoftpersonalcontent.com/photo",
                "https://my.microsoftpersonalcontent.com:444/photo", "https://user@my.microsoftpersonalcontent.com/photo",
                "/photo", "https:///photo", "file:///photo" }) {
            assertThrows(IllegalArgumentException.class, () -> GraphClient.validateMediaRedirect(URI.create(redirect)));
        }
    }

    @Test
    void rejectedRedirectReportsOnlyTheHost() {
        var exception = assertThrows(IllegalArgumentException.class,
                () -> GraphClient.validateMediaRedirect(URI.create("http://media.example/private-photo?token=secret")));
        assertEquals("Invalid Microsoft media redirect host: media.example", exception.getMessage());
    }
}