import type { InputState, PendingInput, RuntimeInputState } from '@gelehka/game-core';
import { interpolateToward, reconcilePredictedPosition } from '@gelehka/game-core';
import { WORLD_SPAWN_SAFE_ZONE_RADIUS } from '@gelehka/shared/constants';
import type { ConnectionState } from '../network/MobileNetworkManager';
import type {
  AoeIndicator,
  BossSnapshot,
  DropSnapshot,
  EnemySnapshot,
  HazardSnapshot,
  IceZone,
  InstanceId,
  PlayerSnapshot,
  PortalSnapshot,
  ServerChatMessage,
  SnapshotMessage,
  WelcomeMessage,
} from '@gelehka/shared';
import { create } from 'zustand';

const PLAYER_PREDICT_SPEED = 150;
const REMOTE_LERP_BASE = 0.3;
const LOCAL_LERP_BASE = 0.48;
const SNAP_DISTANCE = 200;
const MAX_RENDER_DT_MS = 50;
const SAFE_ZONE_VISUAL_DURATION_MS = 3000;

type AnimatedEntity = {
  renderX: number;
  renderY: number;
  targetX: number;
  targetY: number;
  animationTimeMs: number;
};

export interface RenderPlayer extends PlayerSnapshot, AnimatedEntity {
  isLocal: boolean;
}

export interface RenderEnemy extends EnemySnapshot, AnimatedEntity {}
export interface RenderBoss extends Omit<BossSnapshot, 'targetX' | 'targetY'>, AnimatedEntity {}
export interface RenderHazard extends HazardSnapshot, AnimatedEntity {}
export interface RenderDrop extends DropSnapshot, AnimatedEntity {}
export interface RenderPortal extends PortalSnapshot, AnimatedEntity {}

export interface SafeZoneFx {
  x: number;
  y: number;
  radius: number;
  expiresAtMs: number;
}

export interface ToastyFx {
  text: string;
  expiresAtMs: number;
}

export interface PerformanceStats {
  fps: number;
  frameTimeMs: number;
  visibleTiles: number;
  visibleDecor: number;
  visibleEntities: number;
}

interface MobileGameStore {
  nickname: string;
  localPlayerId: string | null;
  currentInstanceId: InstanceId | null;
  mapWidth: number;
  mapHeight: number;
  connected: boolean;
  connectionState: ConnectionState;
  connectionError: string | null;
  safeZoneFx: SafeZoneFx | null;
  toastyFx: ToastyFx | null;
  performance: PerformanceStats;
  lastConnectionAttempt: number | null;
  playerCount: number;
  allPlayers: PlayerSnapshot[];
  enemies: RenderEnemy[];
  bosses: RenderBoss[];
  drops: RenderDrop[];
  portals: RenderPortal[];
  hazards: RenderHazard[];
  iceZones: IceZone[];
  aoeIndicators: AoeIndicator[];
  renderPlayers: RenderPlayer[];
  chatMessages: ServerChatMessage[];
  predictedLocalPlayer: PlayerSnapshot | null;
  pendingInputs: PendingInput[];
  nextInputSeq: number;
  lastSentInputState: RuntimeInputState | null;
  setNickname: (nickname: string) => void;
  setConnectionState: (state: ConnectionState) => void;
  setConnectionError: (error: string | null) => void;
  setLastConnectionAttempt: (time: number) => void;
  showSafeZoneFx: (x: number, y: number, radius?: number, durationMs?: number) => void;
  clearSafeZoneFx: () => void;
  showToastyFx: (text?: string, durationMs?: number) => void;
  setPerformance: (stats: Partial<PerformanceStats>) => void;
  resetSession: () => void;
  handleWelcome: (message: WelcomeMessage) => void;
  handleSnapshot: (message: SnapshotMessage, timeNowMs: number) => void;
  addChatMessage: (message: ServerChatMessage) => void;
  setLeaderboardPlayers: (players: PlayerSnapshot[]) => void;
  setPredictedLocalPlayer: (player: PlayerSnapshot | null) => void;
  setPendingInputs: (pendingInputs: PendingInput[]) => void;
  pushPendingInput: (entry: PendingInput) => void;
  consumeNextInputSeq: () => number;
  setLastSentInputState: (input: RuntimeInputState | null) => void;
  tickPresentation: (dtMs: number) => void;
}

function syncRenderEntities<T extends { id: string; x: number; y: number }>(
  items: T[],
  previous: Array<T & AnimatedEntity>
): Array<T & AnimatedEntity> {
  const previousById = new Map(previous.map((item) => [item.id, item]));

  return items.map((item) => {
    const existing = previousById.get(item.id);
    return {
      ...item,
      renderX: existing?.renderX ?? item.x,
      renderY: existing?.renderY ?? item.y,
      targetX: item.x,
      targetY: item.y,
      animationTimeMs: existing?.animationTimeMs ?? 0,
    };
  });
}

function syncRenderPlayers(
  players: PlayerSnapshot[],
  localPlayerId: string | null,
  predictedLocalPlayer: PlayerSnapshot | null,
  previous: RenderPlayer[]
): RenderPlayer[] {
  const previousById = new Map(previous.map((player) => [player.id, player]));

  return players.map((player) => {
    const existing = previousById.get(player.id);
    const nextSource =
      player.id === localPlayerId && predictedLocalPlayer ? predictedLocalPlayer : player;

    return {
      ...player,
      x: nextSource.x,
      y: nextSource.y,
      renderX: existing?.renderX ?? nextSource.x,
      renderY: existing?.renderY ?? nextSource.y,
      targetX: nextSource.x,
      targetY: nextSource.y,
      animationTimeMs: existing?.animationTimeMs ?? 0,
      isLocal: player.id === localPlayerId,
    };
  });
}

function shouldAnimate(
  renderX: number,
  renderY: number,
  targetX: number,
  targetY: number
): boolean {
  return Math.abs(targetX - renderX) > 0.4 || Math.abs(targetY - renderY) > 0.4;
}

export const useMobileGameStore = create<MobileGameStore>((set, get) => ({
  nickname: '',
  localPlayerId: null,
  currentInstanceId: null,
  mapWidth: 800,
  mapHeight: 600,
  connected: false,
  connectionState: 'DISCONNECTED',
  connectionError: null,
  safeZoneFx: null,
  toastyFx: null,
  performance: {
    fps: 0,
    frameTimeMs: 0,
    visibleTiles: 0,
    visibleDecor: 0,
    visibleEntities: 0,
  },
  lastConnectionAttempt: null,
  playerCount: 0,
  allPlayers: [],
  enemies: [],
  bosses: [],
  drops: [],
  portals: [],
  hazards: [],
  iceZones: [],
  aoeIndicators: [],
  renderPlayers: [],
  chatMessages: [],
  predictedLocalPlayer: null,
  pendingInputs: [],
  nextInputSeq: 0,
  lastSentInputState: null,
  setNickname: (nickname) => set({ nickname }),
  setConnectionState: (state) => set({ connectionState: state, connected: state === 'CONNECTED' }),
  setConnectionError: (error) => set({ connectionError: error }),
  setLastConnectionAttempt: (time) => set({ lastConnectionAttempt: time }),
  showSafeZoneFx: (
    x,
    y,
    radius = WORLD_SPAWN_SAFE_ZONE_RADIUS,
    durationMs = SAFE_ZONE_VISUAL_DURATION_MS
  ) => set({ safeZoneFx: { x, y, radius, expiresAtMs: Date.now() + durationMs } }),
  clearSafeZoneFx: () => set({ safeZoneFx: null }),
  showToastyFx: (text = 'TOASTY!', durationMs = 1200) =>
    set({ toastyFx: { text, expiresAtMs: Date.now() + durationMs } }),
  setPerformance: (stats) =>
    set((state) => ({
      performance: {
        ...state.performance,
        ...stats,
      },
    })),
  resetSession: () =>
    set({
      localPlayerId: null,
      currentInstanceId: null,
      allPlayers: [],
      enemies: [],
      bosses: [],
      drops: [],
      portals: [],
      hazards: [],
      iceZones: [],
      aoeIndicators: [],
      renderPlayers: [],
      chatMessages: [],
      predictedLocalPlayer: null,
      pendingInputs: [],
      nextInputSeq: 0,
      lastSentInputState: null,
      playerCount: 0,
      safeZoneFx: null,
      toastyFx: null,
      performance: {
        fps: 0,
        frameTimeMs: 0,
        visibleTiles: 0,
        visibleDecor: 0,
        visibleEntities: 0,
      },
    }),
  handleWelcome: (message) =>
    set({
      localPlayerId: message.id,
      mapWidth: message.mapWidth,
      mapHeight: message.mapHeight,
      nextInputSeq: 0,
      pendingInputs: [],
      lastSentInputState: null,
    }),
  handleSnapshot: (message, timeNowMs) => {
    const state = get();
    const localPlayer = state.localPlayerId
      ? (message.players.find((player) => player.id === state.localPlayerId) ?? null)
      : null;

    let predictedLocalPlayer = state.predictedLocalPlayer;
    let pendingInputs = state.pendingInputs;

    if (localPlayer) {
      const currentTarget = predictedLocalPlayer
        ? { x: predictedLocalPlayer.x, y: predictedLocalPlayer.y }
        : { x: localPlayer.x, y: localPlayer.y };

      const reconciled = reconcilePredictedPosition(
        timeNowMs,
        localPlayer,
        pendingInputs,
        currentTarget,
        PLAYER_PREDICT_SPEED
      );

      predictedLocalPlayer = {
        ...localPlayer,
        x: reconciled.x,
        y: reconciled.y,
      };
      pendingInputs = reconciled.filteredPending;
    } else {
      predictedLocalPlayer = null;
      pendingInputs = [];
    }

    set({
      currentInstanceId: message.instanceId,
      allPlayers: message.players,
      playerCount: message.players.length,
      enemies: syncRenderEntities(message.enemies, state.enemies),
      bosses: syncRenderEntities(message.bosses, state.bosses),
      drops: syncRenderEntities(message.drops, state.drops),
      portals: syncRenderEntities(message.portals, state.portals),
      hazards: syncRenderEntities(message.hazards, state.hazards),
      iceZones: message.iceZones,
      aoeIndicators: message.aoeIndicators,
      predictedLocalPlayer,
      pendingInputs,
      renderPlayers: syncRenderPlayers(
        message.players,
        state.localPlayerId,
        predictedLocalPlayer,
        state.renderPlayers
      ),
    });
  },
  addChatMessage: (message) =>
    set((state) => ({
      chatMessages: [...state.chatMessages.slice(-49), message],
    })),
  setLeaderboardPlayers: (players) => set({ allPlayers: players, playerCount: players.length }),
  setPredictedLocalPlayer: (player) =>
    set((state) => ({
      predictedLocalPlayer: player,
      renderPlayers: state.renderPlayers.map((renderPlayer) =>
        player && renderPlayer.id === player.id
          ? {
              ...renderPlayer,
              ...player,
              targetX: player.x,
              targetY: player.y,
            }
          : renderPlayer
      ),
    })),
  setPendingInputs: (pendingInputs) => set({ pendingInputs }),
  pushPendingInput: (entry) =>
    set((state) => ({
      pendingInputs: [...state.pendingInputs, entry].slice(-128),
    })),
  consumeNextInputSeq: () => {
    const seq = get().nextInputSeq;
    set({ nextInputSeq: seq + 1 });
    return seq;
  },
  setLastSentInputState: (lastSentInputState) => set({ lastSentInputState }),
  tickPresentation: (dtMs) =>
    set((state) => ({
      renderPlayers: state.renderPlayers.map((player) => {
        const next = interpolateToward(
          { x: player.renderX, y: player.renderY },
          { x: player.targetX, y: player.targetY },
          Math.min(dtMs, MAX_RENDER_DT_MS),
          player.isLocal ? LOCAL_LERP_BASE : REMOTE_LERP_BASE,
          SNAP_DISTANCE
        );

        return {
          ...player,
          renderX: next.x,
          renderY: next.y,
          animationTimeMs:
            shouldAnimate(player.renderX, player.renderY, player.targetX, player.targetY) ||
            player.state === 'attacking'
              ? player.animationTimeMs + dtMs
              : 0,
        };
      }),
      enemies: state.enemies.map((enemy) => {
        const next = interpolateToward(
          { x: enemy.renderX, y: enemy.renderY },
          { x: enemy.targetX, y: enemy.targetY },
          Math.min(dtMs, MAX_RENDER_DT_MS),
          REMOTE_LERP_BASE,
          SNAP_DISTANCE
        );
        return {
          ...enemy,
          renderX: next.x,
          renderY: next.y,
          animationTimeMs:
            shouldAnimate(enemy.renderX, enemy.renderY, enemy.targetX, enemy.targetY) ||
            enemy.state === 'attacking'
              ? enemy.animationTimeMs + dtMs
              : 0,
        };
      }),
      bosses: state.bosses.map((boss) => {
        const next = interpolateToward(
          { x: boss.renderX, y: boss.renderY },
          { x: boss.targetX, y: boss.targetY },
          Math.min(dtMs, MAX_RENDER_DT_MS),
          0.25,
          260
        );
        return {
          ...boss,
          renderX: next.x,
          renderY: next.y,
          animationTimeMs:
            shouldAnimate(boss.renderX, boss.renderY, boss.targetX, boss.targetY) ||
            boss.state !== 'idle'
              ? boss.animationTimeMs + dtMs
              : 0,
        };
      }),
      drops: state.drops.map((drop) => {
        const next = interpolateToward(
          { x: drop.renderX, y: drop.renderY },
          { x: drop.targetX, y: drop.targetY },
          Math.min(dtMs, MAX_RENDER_DT_MS),
          0.35,
          120
        );
        return {
          ...drop,
          renderX: next.x,
          renderY: next.y,
          animationTimeMs: drop.animationTimeMs + dtMs,
        };
      }),
      portals: state.portals.map((portal) => {
        const next = interpolateToward(
          { x: portal.renderX, y: portal.renderY },
          { x: portal.targetX, y: portal.targetY },
          Math.min(dtMs, MAX_RENDER_DT_MS),
          0.3,
          180
        );
        return {
          ...portal,
          renderX: next.x,
          renderY: next.y,
          animationTimeMs: portal.animationTimeMs + dtMs,
        };
      }),
      hazards: state.hazards.map((hazard) => {
        const next = interpolateToward(
          { x: hazard.renderX, y: hazard.renderY },
          { x: hazard.targetX, y: hazard.targetY },
          Math.min(dtMs, MAX_RENDER_DT_MS),
          0.28,
          140
        );
        return {
          ...hazard,
          renderX: next.x,
          renderY: next.y,
          animationTimeMs: hazard.animationTimeMs + dtMs,
        };
      }),
      safeZoneFx:
        state.safeZoneFx && state.safeZoneFx.expiresAtMs > Date.now() ? state.safeZoneFx : null,
      toastyFx: state.toastyFx && state.toastyFx.expiresAtMs > Date.now() ? state.toastyFx : null,
      performance: {
        ...state.performance,
        fps: dtMs > 0 ? Math.round(1000 / dtMs) : state.performance.fps,
        frameTimeMs: dtMs,
      },
    })),
}));

export type MobileRuntimeInput = InputState;
