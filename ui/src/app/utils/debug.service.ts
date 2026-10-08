import { Injectable } from '@angular/core';

/**
 * Debug service for centralized logging.
 *
 */
@Injectable({
  providedIn: 'root',
})
export class DebugService {
  /**
   * Log a message to the console
   * @param message The message to log
   * @param params Optional parameters to log
   */
  log(message: string, ...params: any[]): void {
    const formattedMessage = this.formatMessage(message, ...params);
    console.log(formattedMessage);
  }

  /**
   * Messages are formatted manually as the Fully Android App does not support string interpolation in console logs.
   */
  private formatMessage(message: string, ...params: any[]): string {
    let result = message;
    for (const param of params) {
      result = result.replace('%s', String(param));
    }
    return result;
  }
}
