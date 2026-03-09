import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer, Server, ServerResponse } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function getCacheControl(urlPath: string, ext: string): string {
  if (urlPath === '/sw.js' || urlPath === '/manifest.webmanifest' || ext === '.html') {
    return 'no-cache, no-store, must-revalidate';
  }

  if (urlPath.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }

  return 'public, max-age=3600';
}

export function createHttpServer(): Server {
  return createServer((req, res) => {
    void handleRequest(req.url ?? '/', res);
  });
}

async function handleRequest(urlPath: string, res: ServerResponse): Promise<void> {
  try {
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

async function safeStat(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}
