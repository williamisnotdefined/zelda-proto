import type { IncomingMessage } from 'node:http';

const TRUST_PROXY_VALUES = new Set(['1', 'true', 'yes']);

function getFirstHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (entry.trim()) {
        return entry.trim();
      }
    }
  }

  return null;
}

function shouldTrustProxy(): boolean {
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase();
  return raw ? TRUST_PROXY_VALUES.has(raw) : false;
}

function parseHostname(host: string | null): string | null {
  if (!host) {
    return null;
  }

  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

function parseAllowedOrigins(): Set<string> {
  const raw = process.env.WS_ALLOWED_ORIGINS?.trim();
  if (!raw) {
    return new Set();
  }

  return new Set(
    raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

export function getRequestIp(req: IncomingMessage): string {
  const forwarded = getFirstHeaderValue(req.headers['x-forwarded-for']);
  if (shouldTrustProxy() && forwarded) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket.remoteAddress ?? 'unknown';
}

export function isAllowedWebSocketOrigin(req: IncomingMessage): boolean {
  const origin = getFirstHeaderValue(req.headers.origin);
  if (!origin) {
    return true;
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    return false;
  }

  const explicitOrigins = parseAllowedOrigins();
  if (explicitOrigins.size > 0) {
    return explicitOrigins.has(originUrl.origin);
  }

  const requestHostname = parseHostname(getFirstHeaderValue(req.headers.host));
  if (requestHostname && originUrl.hostname === requestHostname) {
    return true;
  }

  return process.env.NODE_ENV !== 'production' && isLoopbackHostname(originUrl.hostname);
}
