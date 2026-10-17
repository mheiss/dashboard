package cloud.heiss.dashboard.openhab;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/**
 * Verifies configured camera routing and state-transition rules independently of upstream transport.
 */
class OpenhabItemsTest {

    /**
     * Builds a two-camera item model with a selectable doorbell target.
     *
     * @param doorbellCamera the camera key used by doorbell events
     * @return the configured model with no initial states
     * @throws Exception if the fixture configuration cannot be parsed
     */
    private OpenhabItems items(String doorbellCamera) throws Exception {
        return new OpenhabItems(new ObjectMapper().readTree("""
                {"openhab":{"items":{"security":"Armed","pin":"Pin","doorbell":"Bell"},
                "doorbellCamera":"%s"},"protect":{"cameras":{"front":"Front","back":"Back"}}}
                """.formatted(doorbellCamera)));
    }

    /**
     * Checks repeated doorbell actions, motion transition deduplication, and smart-motion camera selection.
     *
     * @throws Exception if fixture setup fails
     */
    @Test
    void dispatchesDoorbellAndMotionToConfiguredCameras() throws Exception {
        var items = items("front");
        assertEquals(new CameraAction("front", "doorbell"), items.update("Bell", "ON"));
        assertEquals(new CameraAction("front", "doorbell"), items.update("Bell", "ON"));
        items.initialize("Back_Camera_Motion", "OFF");
        assertEquals(new CameraAction("back", "motion"), items.update("Back_Camera_Motion", "ON"));
        assertNull(items.update("Back_Camera_Motion", "ON"));
        items.update("Back_Camera_Motion", "OFF");
        assertEquals(new CameraAction("back", "motion"), items.update("Back_Camera_Motion", "ON"));
        items.initialize("Front_Camera_SmartMotion", "OFF");
        assertEquals(new CameraAction("front", "smart"), items.update("Front_Camera_SmartMotion", "ON"));
    }

    /**
     * Ensures initial ON states, unknown items, and an unconfigured doorbell camera do not cause navigation.
     *
     * @throws Exception if fixture setup fails
     */
    @Test
    void initializationAndUnconfiguredItemsDoNotTriggerActions() throws Exception {
        var items = items("unknown");
        items.initialize("Front_Camera_Motion", "ON");
        assertNull(items.update("Front_Camera_Motion", "ON"));
        assertNull(items.update("Back_Camera_Motion", "ON"));
        assertNull(items.update("Unknown_Camera_Motion", "ON"));
        assertNull(items.update("Bell", "ON"));
        assertFalse(items.itemNames().contains("Pin"));
    }

    /**
     * Confirms that an initial REST state cannot overwrite a newer live security update.
     *
     * @throws Exception if fixture setup fails
     */
    @Test
    void keepsSecurityStateAndDoesNotOverwriteLiveUpdatesDuringInitialization() throws Exception {
        var items = items("front");
        assertFalse(items.armed());
        items.update("Armed", "ON");
        items.initialize("Armed", "OFF");
        assertTrue(items.armed());
        items.update("Armed", "OFF");
        assertFalse(items.armed());
    }
}