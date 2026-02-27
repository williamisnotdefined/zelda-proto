import { GameLoop } from './game/GameLoop.js';
import { createHttpServer } from './network/HttpServer.js';
import { WebSocketHandler } from './network/WebSocketHandler.js';

const isDev = process.env.NODE_ENV !== 'production';
const PORT = Number(process.env.PORT) || (isDev ? 3002 : 3001);

const httpServer = createHttpServer();
const wsHandler = new WebSocketHandler(httpServer);

const gameLoop = new GameLoop((world) => {
  wsHandler.broadcastSnapshots(world);
});

wsHandler.start(gameLoop.world);
gameLoop.start();
httpServer.listen(PORT);
