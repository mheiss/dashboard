/**
 * The general application configuration
 */
export interface AppConfig {
  /**
   * The openHAB configuration.
   */
  openhab: OpenhabConfig;

  /**
   * The EVCC configuration.
   */
  evcc: EvccConfig;

  /**
   * The UniFi Protect camera configuration.
   */
  protect: ProtectConfig;
}

/**
 * The openHAB configuration.
 */
export interface OpenhabConfig {
  /**
   * The URL of the Basic UI sitemap to embed.
   */
  sitemap: string;

  /**
   * The openHAB items configuration.
   */
  items: {
    /**
     * The name of the security status item in openHAB.
     */
    security: string;

    /**
     * The name of the security pin item in openHAB.
     */
    pin: string;

    /**
     * The name of the doorbell item in openHAB.
     * When pressed, it displays the doorbell camera in UniFi Protect.
     */
    doorbell: string;
  };
  /**
   * The ID of the doorbell camera in UniFi Protect.
   */
  doorbellCamera: string;
}

/**
 * The EVCC configuration.
 */
export interface EvccConfig {
  /**
   * The URL of the EVCC UI to embed.
   */
  url: string;
}

/**
 * The UniFi Protect camera configuration.
 */
export interface ProtectConfig {
  /**
   * Camera IDs mapped to display labels, in display order.
   */
  cameras: Record<string, string>;
}

/**
 * A calendar to show.
 */
export interface CalendarConfig {
  /**
   * The id/name of the calendar
   */
  name: string;

  /**
   * The tailwind classes to apply
   */
  tailwindClasses: string;
}
