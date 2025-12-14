/**
 * Returns a websocket URL depending on the current protocol
 */
export function getWebSocketUrl(path: string): string {
  const url = new URL(globalThis.location.href);
  const isHttps = url.protocol === 'https:';
  const wsProtocol = isHttps ? 'wss:' : 'ws:';
  return wsProtocol + url.host + path;
}
