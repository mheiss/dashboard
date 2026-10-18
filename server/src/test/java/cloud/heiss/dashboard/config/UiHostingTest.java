package cloud.heiss.dashboard.config;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.equalTo;

import java.util.List;

import org.junit.jupiter.api.Test;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;

/** Verifies root-hosted SPA deep links do not mask public configuration or protected backend endpoints. */
@QuarkusTest
@TestProfile(UiHostingProfile.class)
class UiHostingTest {

    @Test
    void servesRootAndDeepLinksWithRootBaseHref() {
        for (String path : List.of("/", "/login", "/setup", "/home")) {
            given().when().get(path).then().statusCode(200).contentType("text/html").body(containsString("<base href=\"/\">"));
        }
    }

    @Test
    void publicConfigurationRemainsAnApiResponse() {
        given().when().get("/api/config").then().statusCode(200).contentType("application/json")
                .body("cameras.entry", equalTo("Eingang")).body("size()", equalTo(3));
    }

    @Test
    void sessionEndpointStillRequiresAuthentication() {
        given().when().get("/api/session").then().statusCode(401);
    }

    @Test
    void apiNamespaceDoesNotFallBackToTheSpa() {
        given().when().get("/api/missing").then().statusCode(404);
        given().when().get("/api").then().statusCode(404);
    }
}