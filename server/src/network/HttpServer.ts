import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, Server } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLIENT_DIST = resolve(__dirname, '../../../client/dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

export function createHttpServer(): Server {
  return createServer((req, res) => {
    const urlPath = req.url ?? '/';
    let filePath = resolve(CLIENT_DIST, urlPath === '/' ? 'index.html' : '.' + urlPath);

    if (
      !filePath.startsWith(CLIENT_DIST) ||
      !existsSync(filePath) ||
      !statSync(filePath).isFile()
    ) {
      filePath = join(CLIENT_DIST, 'index.html');
    }

    const ext = extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    createReadStream(filePath).pipe(res);
  });
}
