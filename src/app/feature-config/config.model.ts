/**
 * The general application configuration
 */
export interface AppConfig {
  graphUrl: string;
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

  /**
   * The list of folders to show in the gallery.
   * Path must be starting from the root.
   */
  folders: string[];
  /**
   * The list of calendars to show.
   * This can be a personal calendar or a calendar shared with you.
   */
  calendars: CalendarConfig[];

  /**
   * The MSAL configuration
   */
  msalConfig: MsalConfig;
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

/**
 * The Microsoft Entra ID Application registered for this dashboard.
 * https://portal.azure.com/?utm_source=copilot.com#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/Overview
 */
export interface MsalConfig {
  clientId: string;
  authority: string;
  scope: AuthScope[];
}

export type AuthScope = 'User.Read' | 'Calendars.Read' | 'Files.Read';
