import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { WebSocket, WebSocketServer } from 'ws';
import { GameLoop } from './game/GameLoop.js';
import { MAP_HEIGHT, MAP_WIDTH } from './game/World.js';
import { ClientMessage, ServerMessage } from './network/MessageTypes.js';

const PORT = Number(process.env.PORT) || 3001;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const CLIENT_DIST = resolve(__dirname, '../../client/dist');

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

const httpServer = createServer((req, res) => {
  let filePath = join(CLIENT_DIST, req.url === '/' ? 'index.html' : req.url!);

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(CLIENT_DIST, 'index.html');
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
});

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
const clients = new Map<string, WebSocket>();

const gameLoop = new GameLoop((world) => {
  const snapshot = world.getSnapshot();
  const msg = JSON.stringify(snapshot);
  for (const ws of clients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
});

wss.on('connection', (ws) => {
  const playerId = nanoid(12);
  let hasJoined = false;

  // Store the WebSocket but don't create player until join message
  clients.set(playerId, ws);

  console.log(`Connection ${playerId} established, waiting for join...`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;

      if (msg.type === 'join' && !hasJoined) {
        // Sanitize nickname: max 16 chars, alphanumeric + spaces only
        const nickname =
          msg.nickname
            .replace(/[^a-zA-Z0-9 ]/g, '')
            .slice(0, 16)
            .trim() || 'Player';

        gameLoop.world.addPlayer(playerId, nickname);
        hasJoined = true;

        const welcome: ServerMessage = {
          type: 'welcome',
          id: playerId,
          mapWidth: MAP_WIDTH,
          mapHeight: MAP_HEIGHT,
        };
        ws.send(JSON.stringify(welcome));

        console.log(`Player ${nickname} (${playerId}) joined (${clients.size} online)`);
      } else if (msg.type === 'input' && hasJoined) {
        gameLoop.world.handleInput(playerId, msg);
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    clients.delete(playerId);
    if (hasJoined) {
      gameLoop.world.removePlayer(playerId);
    }
    console.log(`Player ${playerId} disconnected (${clients.size} online)`);
  });
});

gameLoop.start();
httpServer.listen(PORT, () => {
  console.log(`Legends of Gelehk server running on http://localhost:${PORT}`);
});
