import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { IncomingMessage, createServer, Server, ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { ClientErrorLogEnvelope, ClientErrorLogStore } from '../monitoring/clientErrorLogStore.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLIENT_DIST = resolve(__dirname, '../../../client/dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.gif': 'image/gif',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const MAX_CLIENT_ERROR_BODY_BYTES = 256 * 1024;
const CLIENT_ERROR_REQUESTS_PER_MINUTE = 120;
const rateLimitByIp = new Map<string, { windowStart: number; count: number }>();

function getCacheControl(urlPath: string, ext: string): string {
  if (urlPath === '/sw.js' || urlPath === '/manifest.webmanifest' || ext === '.html') {
    return 'no-cache, no-store, must-revalidate';
  }

  if (urlPath.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }

  return 'public, max-age=3600';
}

export function createHttpServer(clientErrorLogStore: ClientErrorLogStore): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, clientErrorLogStore);
  });
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  clientErrorLogStore: ClientErrorLogStore
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/api/logs/client-errors') {
      await handleClientErrorLogRequest(req, res, clientErrorLogStore);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD, POST' });
      res.end('Method Not Allowed');
      return;
    }

    const urlPath = url.pathname;
    let filePath = resolve(CLIENT_DIST, urlPath === '/' ? 'index.html' : '.' + urlPath);

    const requestedPathAllowed = filePath.startsWith(CLIENT_DIST);
    const requestedStat = requestedPathAllowed ? await safeStat(filePath) : null;
    if (!requestedStat?.isFile()) {
      filePath = join(CLIENT_DIST, 'index.html');
    }

    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cacheControl = getCacheControl(urlPath, ext);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
    });
    const stream = createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(404);
      }
      res.end();
    });
    stream.pipe(res);
  } catch {
    res.writeHead(500);
    res.end('Internal Server Error');
  }
}

async function handleClientErrorLogRequest(
  req: IncomingMessage,
  res: ServerResponse,
  clientErrorLogStore: ClientErrorLogStore
): Promise<void> {
  const contentType = req.headers['content-type'] ?? '';
  if (!contentType.includes('application/json')) {
    writeJson(res, 415, { error: 'Unsupported Media Type' });
    return;
  }

  const ip = getRequestIp(req);
  if (isRateLimited(ip)) {
    writeJson(res, 429, { error: 'Too Many Requests' }, { 'Retry-After': '60' });
    return;
  }

  let body = '';
  let bodySize = 0;

  try {
    for await (const chunk of req) {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      bodySize += buffer.length;
      if (bodySize > MAX_CLIENT_ERROR_BODY_BYTES) {
        writeJson(res, 413, { error: 'Payload Too Large' });
        return;
      }
      body += buffer.toString('utf8');
    }
  } catch {
    writeJson(res, 500, { error: 'Failed to read request body' });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    writeJson(res, 400, { error: 'Malformed JSON payload' });
    return;
  }

  if (!isClientErrorEnvelope(parsed)) {
    writeJson(res, 400, { error: 'Invalid client error payload' });
    return;
  }

  const requestId = randomUUID();
  const receivedAt = new Date().toISOString();
  const accepted = await clientErrorLogStore.appendEnvelope(parsed, {
    requestId,
    receivedAt,
    ip,
  });

  writeJson(res, 202, {
    accepted,
    rejected: 0,
    requestId,
    serverTime: receivedAt,
  });
}

async function safeStat(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  headers: Record<string, string> = {}
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function getRequestIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req.socket.remoteAddress ?? 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const current = rateLimitByIp.get(ip);

  if (!current || current.windowStart < windowStart) {
    rateLimitByIp.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  current.count += 1;
  return current.count > CLIENT_ERROR_REQUESTS_PER_MINUTE;
}

function isClientErrorEnvelope(value: unknown): value is ClientErrorLogEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.events) &&
    candidate.events.every((event) => event && typeof event === 'object')
  );
}
