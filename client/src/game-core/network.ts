export interface LocationLike {
  host: string;
  protocol: string;
}

export interface WebSocketUrlOptions {
  explicitUrl?: string | null;
  path?: string;
  location?: LocationLike | null;
}

export function resolveWebSocketUrl({
  explicitUrl,
  path = '/ws',
  location,
}: WebSocketUrlOptions = {}): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const trimmedUrl = explicitUrl?.trim();
  if (trimmedUrl) {
    return trimmedUrl;
  }

  if (!location) {
    return `ws://localhost${normalizedPath}`;
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${location.host}${normalizedPath}`;
}
