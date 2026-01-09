/**
 * API that the dashboard is using from fully.
 *
 * See https://www.fully-kiosk.com/en/#websiteintegration
 */
export interface Fully {
  turnScreenOn(): string;
}

declare global {
  export var fully: Fully;
}
