import { afterEach, describe, expect, it } from 'vitest';
import { pack, unpack } from 'msgpackr';
import { WebSocket, type RawData } from 'ws';
import {
  CLIENT_MESSAGE_TYPES,
  INSTANCE_IDS,
  SESSION_RESUME_REJECT_REASONS,
  SERVER_MESSAGE_TYPES,
  type ClientMessage,
  type ServerMessage,
  type ResumeRejectedMessage,
  type SnapshotDeltaMessage,
  type WelcomeMessage,
} from '@gelehka/shared';
import {
  createJoinMessage,
  createResumeSessionMessage,
  createSnapshotResyncMessage,
} from '@gelehka/shared/protocol';
import {
  createSnapshotNormalizationState,
  normalizeServerMessageResult,
} from '@gelehka/game-core/snapshot';
import { InstanceManager } from '../src/game/InstanceManager';
import { ClientErrorLogStore } from '../src/monitoring/clientErrorLogStore';
import { createHttpServer } from '../src/network/HttpServer';
import { WebSocketHandler } from '../src/network/WebSocketHandler';

interface TestHarness {
  httpServer: ReturnType<typeof createHttpServer>;
  instances: InstanceManager;
  wsHandler: WebSocketHandler;
  port: number;
}

let activeHarness: TestHarness | null = null;
let activeClients: WebSocket[] = [];

afterEach(async () => {
  await Promise.all(activeClients.map((client) => closeClient(client)));
  activeClients = [];

  if (activeHarness) {
    await activeHarness.wsHandler.stop();
    await closeHttpServer(activeHarness.httpServer);
    activeHarness = null;
  }
});

describe('WebSocketHandler integration', () => {
  it('rejects invalid resume tokens', async () => {
    const { port } = await createHarness();
    const client = await connectClient(port);

    const rejectedPromise = waitForMessage(client, isResumeRejectedMessage);
    sendPacked(client, createResumeSessionMessage('missing_token_123'));

    await expect(rejectedPromise).resolves.toMatchObject({
      reason: SESSION_RESUME_REJECT_REASONS.INVALID_SESSION,
    });
  });

  it('rejects resume attempts while the original session is still connected', async () => {
    const { port } = await createHarness();
    const firstClient = await connectClient(port);

    const firstWelcomePromise = waitForMessage(firstClient, isWelcomeMessage);
    sendPacked(firstClient, createJoinMessage('Link'));
    const firstWelcome = await firstWelcomePromise;

    const secondClient = await connectClient(port);
    const rejectedPromise = waitForMessage(secondClient, isResumeRejectedMessage);
    sendPacked(secondClient, createResumeSessionMessage(firstWelcome.sessionToken));

    await expect(rejectedPromise).resolves.toMatchObject({
      reason: SESSION_RESUME_REJECT_REASONS.SESSION_IN_USE,
    });
  });

  it('forces a full snapshot after a websocket resync request', async () => {
    const { instances, port, wsHandler } = await createHarness();
    const client = await connectClient(port);

    const welcomePromise = waitForMessage(client, isWelcomeMessage);
    sendPacked(client, createJoinMessage('Link'));
    await welcomePromise;

    const baselinePromise = waitForMessage(client, isSnapshotDeltaMessage);
    wsHandler.broadcastSnapshots(instances);
    const baseline = await baselinePromise;
    expect(baseline.full).toBe(true);

    const normalizationState = createSnapshotNormalizationState();
    expect(normalizeServerMessageResult(baseline, normalizationState)).toMatchObject({
      kind: 'message',
      snapshotBaseApplied: true,
    });

    const skippedDeltaPromise = waitForMessage(client, isSnapshotDeltaMessage);
    wsHandler.broadcastSnapshots(instances);
    const skippedDelta = await skippedDeltaPromise;
    expect(skippedDelta.full).toBe(false);

    const gapDeltaPromise = waitForMessage(client, isSnapshotDeltaMessage);
    wsHandler.broadcastSnapshots(instances);
    const gapDelta = await gapDeltaPromise;
    const resyncResult = normalizeServerMessageResult(gapDelta, normalizationState);
    expect(resyncResult).toMatchObject({
      kind: 'resync',
      reason: 'tick_gap',
      lastTick: baseline.tick,
    });

    if (resyncResult.kind !== 'resync') {
      throw new Error('Expected a snapshot resync request');
    }

    sendPacked(
      client,
      createSnapshotResyncMessage(resyncResult.reason, {
        lastTick: resyncResult.lastTick,
        instanceId: resyncResult.instanceId,
      })
    );

    await delay(10);

    const recoveredPromise = waitForMessage(client, isSnapshotDeltaMessage);
    wsHandler.broadcastSnapshots(instances);
    const recovered = await recoveredPromise;
    expect(recovered.full).toBe(true);
    expect(recovered.tick).toBeGreaterThan(gapDelta.tick);
  });

  it('resumes the same player session and forces a full baseline after reconnect', async () => {
    const { instances, port, wsHandler } = await createHarness();
    const firstClient = await connectClient(port);

    const firstWelcomePromise = waitForMessage(firstClient, isWelcomeMessage);
    sendPacked(firstClient, createJoinMessage('Zelda'));
    const firstWelcome = await firstWelcomePromise;

    const initialSnapshotPromise = waitForMessage(firstClient, isSnapshotDeltaMessage);
    wsHandler.broadcastSnapshots(instances);
    const initialSnapshot = await initialSnapshotPromise;
    expect(initialSnapshot.full).toBe(true);

    const originalPlayer = instances.getPlayerById(firstWelcome.id);
    expect(originalPlayer).not.toBeNull();

    await closeClient(firstClient);
    activeClients = activeClients.filter((client) => client !== firstClient);

    expect(instances.getPlayerById(firstWelcome.id)).toBe(originalPlayer);

    const resumedClient = await connectClient(port);
    const resumedWelcomePromise = waitForMessage(resumedClient, isWelcomeMessage);
    sendPacked(resumedClient, createResumeSessionMessage(firstWelcome.sessionToken));

    const resumedWelcome = await resumedWelcomePromise;
    expect(resumedWelcome).toMatchObject({
      id: firstWelcome.id,
      sessionToken: firstWelcome.sessionToken,
      resumed: true,
    });
    expect(instances.getPlayerById(resumedWelcome.id)).toBe(originalPlayer);

    const resumedSnapshotPromise = waitForMessage(resumedClient, isSnapshotDeltaMessage);
    wsHandler.broadcastSnapshots(instances);
    const resumedSnapshot = await resumedSnapshotPromise;
    expect(resumedSnapshot.full).toBe(true);
  });

  it('forces a fresh full baseline after an instance transfer', async () => {
    const previousDevStartPhase = process.env.DEV_START_PHASE;
    process.env.DEV_START_PHASE = INSTANCE_IDS.PHASE2;

    try {
      const { instances, port, wsHandler } = await createHarness();
      const client = await connectClient(port);

      const welcomePromise = waitForMessage(client, isWelcomeMessage);
      sendPacked(client, createJoinMessage('Link'));
      const welcome = await welcomePromise;

      const baselinePromise = waitForMessage(client, isSnapshotDeltaMessage);
      wsHandler.broadcastSnapshots(instances);
      const baseline = await baselinePromise;
      expect(baseline).toMatchObject({
        full: true,
        instanceId: INSTANCE_IDS.PHASE2,
      });

      const player = instances.getPlayerById(welcome.id);
      const portal = Array.from(instances.phase2World.portals.values())[0];

      expect(player).not.toBeNull();
      expect(portal).toBeDefined();

      if (!player || !portal) {
        throw new Error('Expected a phase2 player and initial return portal');
      }

      player.x = portal.x;
      player.y = portal.y;
      instances.update(0);

      expect(instances.getInstanceForPlayer(welcome.id)).toBe(INSTANCE_IDS.PHASE1);

      const transferredSnapshotPromise = waitForMessage(client, isSnapshotDeltaMessage);
      wsHandler.broadcastSnapshots(instances);
      const transferredSnapshot = await transferredSnapshotPromise;
      expect(transferredSnapshot).toMatchObject({
        full: true,
        instanceId: INSTANCE_IDS.PHASE1,
      });
      expect(transferredSnapshot.tick).toBeGreaterThan(baseline.tick);
    } finally {
      if (previousDevStartPhase === undefined) {
        delete process.env.DEV_START_PHASE;
      } else {
        process.env.DEV_START_PHASE = previousDevStartPhase;
      }
    }
  });
});

async function createHarness(): Promise<TestHarness> {
  const httpServer = createHttpServer(new ClientErrorLogStore());
  const wsHandler = new WebSocketHandler(httpServer);
  const instances = new InstanceManager();

  wsHandler.start(instances);
  await listenHttpServer(httpServer);

  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected an address info result from the HTTP server');
  }

  activeHarness = {
    httpServer,
    instances,
    wsHandler,
    port: address.port,
  };
  return activeHarness;
}

function listenHttpServer(httpServer: ReturnType<typeof createHttpServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(0, '127.0.0.1', () => {
      httpServer.off('error', reject);
      resolve();
    });
  });
}

function closeHttpServer(httpServer: ReturnType<typeof createHttpServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!httpServer.listening) {
      resolve();
      return;
    }

    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function connectClient(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const cleanup = () => {
      client.off('open', handleOpen);
      client.off('error', handleError);
    };
    const handleOpen = () => {
      cleanup();
      activeClients.push(client);
      resolve(client);
    };
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    client.on('open', handleOpen);
    client.on('error', handleError);
  });
}

function closeClient(client: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (client.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    const finalize = () => {
      client.off('close', finalize);
      resolve();
    };

    client.on('close', finalize);
    if (client.readyState === WebSocket.CONNECTING) {
      client.terminate();
      return;
    }

    client.close();
    setTimeout(() => {
      if (client.readyState !== WebSocket.CLOSED) {
        client.terminate();
      }
    }, 50);
  });
}

function sendPacked(client: WebSocket, message: ClientMessage): void {
  client.send(pack(message));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForMessage<T extends ServerMessage>(
  client: WebSocket,
  predicate: (message: ServerMessage) => message is T,
  timeoutMs = 2000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for a websocket message'));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      client.off('message', handleMessage);
      client.off('error', handleError);
      client.off('close', handleClose);
    };

    const handleMessage = (raw: RawData) => {
      const message = decodeMessage(raw);
      if (!predicate(message)) {
        return;
      }

      cleanup();
      resolve(message);
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const handleClose = () => {
      cleanup();
      reject(new Error('WebSocket closed before the expected message arrived'));
    };

    client.on('message', handleMessage);
    client.on('error', handleError);
    client.on('close', handleClose);
  });
}

function decodeMessage(raw: RawData): ServerMessage {
  if (raw instanceof Buffer) {
    return unpack(raw) as ServerMessage;
  }

  if (Array.isArray(raw)) {
    return unpack(Buffer.concat(raw)) as ServerMessage;
  }

  if (raw instanceof ArrayBuffer) {
    return unpack(new Uint8Array(raw)) as ServerMessage;
  }

  throw new Error(`Unsupported websocket payload type: ${typeof raw}`);
}

function isWelcomeMessage(message: ServerMessage): message is WelcomeMessage {
  return message.type === SERVER_MESSAGE_TYPES.WELCOME;
}

function isResumeRejectedMessage(message: ServerMessage): message is ResumeRejectedMessage {
  return message.type === SERVER_MESSAGE_TYPES.RESUME_REJECTED;
}

function isSnapshotDeltaMessage(message: ServerMessage): message is SnapshotDeltaMessage {
  return message.type === SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA;
}
