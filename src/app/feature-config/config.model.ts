/**
 * The general application configuration
 */
export interface AppConfig {
  graphUrl: string;
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
