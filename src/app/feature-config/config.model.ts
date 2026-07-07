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
}

/**
 * The UniFi Protect camera configuration.
 */
export interface ProtectConfig {
  /**
   * The camera names to display, in the order they should appear.
   */
  cameras: string[];
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
