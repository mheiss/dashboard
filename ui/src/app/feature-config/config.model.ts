/**
 * The general application configuration
 */
export interface AppConfig {
  /**
   * The URL of the Basic UI sitemap to embed.
   */
  sitemapUrl: string;

  /**
   * The URL of the EVCC UI to embed.
   */
  evccUrl: string;

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
