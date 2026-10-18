package cloud.heiss.dashboard.openhab;

import java.util.HashMap;
import java.util.Map;
import java.util.Set;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * Maps configured openHAB items to security state and camera actions.
 * Synchronized state access lets initial REST reads and live events share one model without overwriting newer updates.
 */
public class OpenhabItems {

    private final String security;
    private final String pin;
    private final String doorbell;
    private final String doorbellCamera;
    private final Map<String, CameraAction> cameras = new HashMap<>();
    private final Map<String, String> states = new HashMap<>();
    private final Set<String> itemNames;

    /**
     * Derives item mappings from the dashboard's openHAB settings and configured camera keys.
     *
     * @param settings the dashboard's public JSON configuration
     */
    public OpenhabItems(JsonNode settings) {
        JsonNode openhab = settings.path("openhab");
        security = openhab.path("items").path("security").asText();
        pin = openhab.path("items").path("pin").asText();
        doorbell = openhab.path("items").path("doorbell").asText();
        doorbellCamera = openhab.path("doorbellCamera").asText();
        settings.path("protect").path("cameras").fieldNames().forEachRemaining(camera -> {
            if (!camera.isEmpty()) {
                String prefix = Character.toUpperCase(camera.charAt(0)) + camera.substring(1) + "_Camera_";
                cameras.put(prefix + "Motion", new CameraAction(camera, "motion"));
                cameras.put(prefix + "SmartMotion", new CameraAction(camera, "smart"));
            }
        });
        var names = new java.util.HashSet<>(cameras.keySet());
        if (!security.isEmpty()) {
            names.add(security);
        }
        if (!doorbell.isEmpty()) {
            names.add(doorbell);
        }
        itemNames = Set.copyOf(names);
    }

    /**
     * Returns the item whose state indicates whether security is armed.
     *
     * @return the configured item name, or an empty string when unset
     */
    public String securityItem() {
        return security;
    }

    /**
     * Returns the command item used to submit security PINs.
     *
     * @return the configured item name, or an empty string when unset
     */
    public String pinItem() {
        return pin;
    }

    /**
     * Returns the immutable set of state items tracked by this model, excluding the PIN command item.
     *
     * @return motion, smart-motion, doorbell, and security item names
     */
    public Set<String> itemNames() {
        return itemNames;
    }

    /**
     * Seeds an item from its initial REST state without replacing an already received live state or producing an action.
     *
     * @param item the item name
     * @param value its initial openHAB state
     */
    public synchronized void initialize(String item, String value) {
        states.putIfAbsent(item, value);
    }

    /**
     * Tests whether the security item's known state is {@code ON}.
     *
     * @return whether security is armed; false also covers an unknown state
     */
    public synchronized boolean armed() {
        return "ON".equals(states.get(security));
    }

    /**
     * Reports security state while distinguishing an uninitialized item from a disarmed one.
     *
     * @return the armed flag, or null until a security state has been received
     */
    public synchronized Boolean securityState() {
        return states.containsKey(security) ? armed() : null;
    }

    /**
     * Stores a tracked live state and decides whether clients should display a camera.
     * Motion requires a known non-ON state followed by ON; every doorbell ON update can produce an action.
     *
     * @param item the updated item name
     * @param value its new openHAB state
     * @return a camera action, or null when the update does not trigger a configured camera
     */
    public synchronized CameraAction update(String item, String value) {
        if (!itemNames.contains(item)) {
            return null;
        }
        String previous = states.put(item, value);
        if (!"ON".equals(value)) {
            return null;
        }
        if (item.equals(doorbell)) {
            return cameras.values().stream().anyMatch(camera -> camera.camera().equals(doorbellCamera))
                    ? new CameraAction(doorbellCamera, "doorbell")
                    : null;
        }
        return previous != null && !"ON".equals(previous) ? cameras.get(item) : null;
    }
}