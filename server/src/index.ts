import { WebSocketServer, WebSocket } from 'ws';
import { nanoid } from 'nanoid';
import { GameLoop } from './game/GameLoop.js';
import { MAP_WIDTH, MAP_HEIGHT } from './game/World.js';
import { ClientMessage, ServerMessage } from './network/MessageTypes.js';

const PORT = 3001;

const wss = new WebSocketServer({ port: PORT });
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
  clients.set(playerId, ws);
  gameLoop.world.addPlayer(playerId);

  const welcome: ServerMessage = {
    type: 'welcome',
    id: playerId,
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
  };
  ws.send(JSON.stringify(welcome));

  console.log(`Player ${playerId} connected (${clients.size} online)`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString()) as ClientMessage;
      if (msg.type === 'input') {
        gameLoop.world.handleInput(playerId, msg);
      }
    } catch {
      // ignore malformed messages
    }
  });

  ws.on('close', () => {
    clients.delete(playerId);
    gameLoop.world.removePlayer(playerId);
    console.log(`Player ${playerId} disconnected (${clients.size} online)`);
  });
});

gameLoop.start();
console.log(`Legends of Gelehk server running on ws://localhost:${PORT}`);
