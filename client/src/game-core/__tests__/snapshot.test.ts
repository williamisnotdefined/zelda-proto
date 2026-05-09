import { describe, expect, it } from 'vitest';
import {
  createSnapshotMessageFilterState,
  createSnapshotNormalizationState,
  filterSnapshotMessage,
  normalizeServerMessage,
  normalizeServerMessageResult,
} from '../snapshot';
import {
  INSTANCE_IDS,
  PROTOCOL_VERSION,
  SERVER_MESSAGE_TYPES,
  SNAPSHOT_RESYNC_REASONS,
  type EnemySnapshot,
  type FullSnapshotDeltaMessage,
  type IncrementalSnapshotDeltaMessage,
  type PlayerSnapshot,
  type SnapshotMessage,
} from '@/shared';

function createPlayer(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: 'player-1',
    nickname: 'Link',
    x: 100,
    y: 200,
    hp: 10,
    maxHp: 10,
    state: 'idle',
    direction: 'down',
    playerKills: 0,
    monsterKills: 0,
    deaths: 0,
    toastyCount: 0,
    lastProcessedInputSeq: 0,
    statusEffects: {},
    ...overrides,
  };
}

function createEnemy(overrides: Partial<EnemySnapshot> = {}): EnemySnapshot {
  return {
    id: 'enemy-1',
    kind: 'blob',
    x: 400,
    y: 500,
    hp: 5,
    maxHp: 5,
    state: 'idle',
    ...overrides,
  };
}

function createSnapshot(overrides: Partial<SnapshotMessage> = {}): SnapshotMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: SERVER_MESSAGE_TYPES.SNAPSHOT,
    instanceId: INSTANCE_IDS.PHASE1,
    players: [createPlayer()],
    enemies: [createEnemy()],
    bosses: [],
    iceZones: [],
    aoeIndicators: [],
    waveIndicators: [],
    drops: [],
    portals: [],
    hazards: [],
    ...overrides,
  };
}

function createFullDelta(
  overrides: Partial<FullSnapshotDeltaMessage> = {}
): FullSnapshotDeltaMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA,
    tick: 4,
    full: true,
    instanceId: INSTANCE_IDS.PHASE1,
    players: [createPlayer()],
    removedPlayerIds: [],
    enemies: [createEnemy()],
    enemyTransforms: [],
    enemyStates: [],
    bosses: [],
    drops: [],
    portals: [],
    hazards: [],
    removedEnemyIds: [],
    removedBossIds: [],
    removedDropIds: [],
    removedPortalIds: [],
    removedHazardIds: [],
    iceZones: [],
    aoeIndicators: [],
    waveIndicators: [],
    ...overrides,
  };
}

function createIncrementalDelta(
  overrides: Partial<IncrementalSnapshotDeltaMessage> = {}
): IncrementalSnapshotDeltaMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: SERVER_MESSAGE_TYPES.SNAPSHOT_DELTA,
    tick: 5,
    full: false,
    instanceId: INSTANCE_IDS.PHASE1,
    players: [createPlayer({ x: 120 })],
    removedPlayerIds: [],
    enemies: [],
    enemyTransforms: [{ id: 'enemy-1', x: 420, y: 520 }],
    enemyStates: [{ id: 'enemy-1', hp: 4, maxHp: 5, state: 'chasing' }],
    bosses: [],
    drops: [],
    portals: [],
    hazards: [],
    removedEnemyIds: [],
    removedBossIds: [],
    removedDropIds: [],
    removedPortalIds: [],
    removedHazardIds: [],
    iceZones: [],
    aoeIndicators: [],
    waveIndicators: [],
    ...overrides,
  };
}

describe('filterSnapshotMessage', () => {
  it('drops incremental deltas without a baseline', () => {
    const state = createSnapshotMessageFilterState();

    expect(filterSnapshotMessage(createIncrementalDelta(), state)).toBeNull();
  });

  it('accepts full baselines and rejects stale or cross-instance deltas', () => {
    const state = createSnapshotMessageFilterState();

    expect(filterSnapshotMessage(createSnapshot(), state)?.type).toBe(
      SERVER_MESSAGE_TYPES.SNAPSHOT
    );
    expect(filterSnapshotMessage(createIncrementalDelta({ tick: 1 }), state)).not.toBeNull();
    expect(filterSnapshotMessage(createIncrementalDelta({ tick: 1 }), state)).toBeNull();
    expect(
      filterSnapshotMessage(
        createIncrementalDelta({ tick: 2, instanceId: INSTANCE_IDS.PHASE2 }),
        state
      )
    ).toBeNull();
    expect(
      filterSnapshotMessage(createFullDelta({ tick: 7, instanceId: INSTANCE_IDS.PHASE2 }), state)
    ).not.toBeNull();
  });

  it('rejects deltas with tick gaps until a new full baseline arrives', () => {
    const state = createSnapshotMessageFilterState();

    expect(filterSnapshotMessage(createFullDelta({ tick: 3 }), state)).not.toBeNull();
    expect(filterSnapshotMessage(createIncrementalDelta({ tick: 5 }), state)).toBeNull();
    expect(filterSnapshotMessage(createIncrementalDelta({ tick: 6 }), state)).toBeNull();
    expect(filterSnapshotMessage(createFullDelta({ tick: 7 }), state)).not.toBeNull();
  });
});

describe('normalizeServerMessage', () => {
  it('applies full snapshots and incremental deltas into a full snapshot view', () => {
    const state = createSnapshotNormalizationState();

    const base = normalizeServerMessage(createSnapshot(), state);
    expect(base).not.toBeNull();

    const next = normalizeServerMessage(createIncrementalDelta(), state);
    expect(next).toMatchObject({
      type: SERVER_MESSAGE_TYPES.SNAPSHOT,
      instanceId: INSTANCE_IDS.PHASE1,
      players: [expect.objectContaining({ id: 'player-1', x: 120 })],
      enemies: [
        expect.objectContaining({ id: 'enemy-1', x: 420, y: 520, hp: 4, state: 'chasing' }),
      ],
    });
  });

  it('applies enemy status effects from state deltas', () => {
    const state = createSnapshotNormalizationState();

    normalizeServerMessage(createSnapshot(), state);
    const burning = normalizeServerMessage(
      createIncrementalDelta({
        enemyStates: [
          {
            id: 'enemy-1',
            hp: 4,
            maxHp: 5,
            state: 'chasing',
            statusEffects: { burning: { ticksRemaining: 5 } },
          },
        ],
      }),
      state
    ) as SnapshotMessage;

    expect(burning.enemies[0].statusEffects?.burning?.ticksRemaining).toBe(5);

    const cleared = normalizeServerMessage(
      createIncrementalDelta({
        tick: 6,
        enemyStates: [{ id: 'enemy-1', hp: 4, maxHp: 5, state: 'chasing', statusEffects: {} }],
      }),
      state
    ) as SnapshotMessage;

    expect(cleared.enemies[0].statusEffects?.burning).toBeUndefined();
  });

  it('keeps a normalized full snapshot view across removals and auxiliary replacements', () => {
    const state = createSnapshotNormalizationState();

    normalizeServerMessage(
      createSnapshot({
        players: [createPlayer(), createPlayer({ id: 'player-2', nickname: 'Zelda' })],
        enemies: [createEnemy(), createEnemy({ id: 'enemy-2', x: 600, y: 700 })],
        drops: [{ id: 'drop-1', x: 1, y: 2, kind: 'food_small' }],
        portals: [{ id: 'portal-1', x: 3, y: 4, kind: 'phase1_to_phase2' }],
        hazards: [{ id: 'hazard-1', x: 5, y: 6, kind: 'fire_field', ttlMs: 500 }],
        iceZones: [{ x: 10, y: 20, width: 30, height: 40 }],
        aoeIndicators: [{ ownerId: 'boss-1', x: 50, y: 60, radius: 70, timer: 80, hit: false }],
        waveIndicators: [{ ownerId: 'boss-1', x: 80, y: 90, radius: 100, state: 'expanding' }],
      }),
      state
    );

    const next = normalizeServerMessage(
      createIncrementalDelta({
        players: [createPlayer({ x: 120 })],
        removedPlayerIds: ['player-2'],
        enemies: [],
        enemyTransforms: [{ id: 'enemy-1', x: 420, y: 520 }],
        enemyStates: [{ id: 'enemy-1', hp: 4, maxHp: 5, state: 'chasing' }],
        removedEnemyIds: ['enemy-2'],
        drops: [{ id: 'drop-2', x: 7, y: 8, kind: 'food_large' }],
        removedDropIds: ['drop-1'],
        portals: [{ id: 'portal-2', x: 9, y: 10, kind: 'phase2_to_phase1' }],
        removedPortalIds: ['portal-1'],
        hazards: [{ id: 'hazard-2', x: 11, y: 12, kind: 'purple_field', ttlMs: 250 }],
        removedHazardIds: ['hazard-1'],
        iceZones: [{ x: 100, y: 200, width: 300, height: 400 }],
        aoeIndicators: [{ x: 15, y: 16, radius: 17, timer: 18, hit: true }],
        waveIndicators: [{ x: 19, y: 20, radius: 21, state: 'windup' }],
      }),
      state
    );

    expect(next).toMatchObject({
      type: SERVER_MESSAGE_TYPES.SNAPSHOT,
      players: [expect.objectContaining({ id: 'player-1', x: 120 })],
      enemies: [expect.objectContaining({ id: 'enemy-1', x: 420, y: 520, hp: 4 })],
      drops: [expect.objectContaining({ id: 'drop-2' })],
      portals: [expect.objectContaining({ id: 'portal-2' })],
      hazards: [expect.objectContaining({ id: 'hazard-2' })],
      iceZones: [{ x: 100, y: 200, width: 300, height: 400 }],
      aoeIndicators: [{ x: 15, y: 16, radius: 17, timer: 18, hit: true }],
      waveIndicators: [{ x: 19, y: 20, radius: 21, state: 'windup' }],
    });

    expect((next as SnapshotMessage).players.map((player) => player.id)).toEqual(['player-1']);
    expect((next as SnapshotMessage).enemies.map((enemy) => enemy.id)).toEqual(['enemy-1']);
    expect((next as SnapshotMessage).drops.map((drop) => drop.id)).toEqual(['drop-2']);
    expect((next as SnapshotMessage).portals.map((portal) => portal.id)).toEqual(['portal-2']);
    expect((next as SnapshotMessage).hazards.map((hazard) => hazard.id)).toEqual(['hazard-2']);
  });

  it('defaults missing wave indicators when reading older snapshots', () => {
    const state = createSnapshotNormalizationState();

    const olderSnapshot = {
      ...createSnapshot(),
      waveIndicators: undefined,
    } as unknown as SnapshotMessage;

    const normalized = normalizeServerMessage(olderSnapshot, state) as SnapshotMessage;

    expect(normalized.waveIndicators).toEqual([]);
  });

  it('rejects stale or cross-instance incremental deltas', () => {
    const state = createSnapshotNormalizationState();

    normalizeServerMessage(createFullDelta({ tick: 3 }), state);

    expect(normalizeServerMessage(createIncrementalDelta({ tick: 3 }), state)).toBeNull();
    expect(
      normalizeServerMessage(
        createIncrementalDelta({ tick: 4, instanceId: INSTANCE_IDS.PHASE2 }),
        state
      )
    ).toBeNull();
  });

  it('requests snapshot resyncs for missing baselines, tick gaps, and instance mismatches', () => {
    const missingBaseState = createSnapshotNormalizationState();

    expect(normalizeServerMessageResult(createIncrementalDelta(), missingBaseState)).toEqual({
      kind: 'resync',
      reason: SNAPSHOT_RESYNC_REASONS.MISSING_BASE,
      lastTick: -1,
      instanceId: null,
    });
    expect(
      normalizeServerMessageResult(createIncrementalDelta({ tick: 6 }), missingBaseState)
    ).toEqual({
      kind: 'drop',
      reason: 'resync_pending',
    });

    const gapState = createSnapshotNormalizationState();
    normalizeServerMessageResult(createFullDelta({ tick: 3 }), gapState);
    expect(normalizeServerMessageResult(createIncrementalDelta({ tick: 5 }), gapState)).toEqual({
      kind: 'resync',
      reason: SNAPSHOT_RESYNC_REASONS.TICK_GAP,
      lastTick: 3,
      instanceId: INSTANCE_IDS.PHASE1,
    });

    const instanceMismatchState = createSnapshotNormalizationState();
    normalizeServerMessageResult(createFullDelta({ tick: 8 }), instanceMismatchState);
    expect(
      normalizeServerMessageResult(
        createIncrementalDelta({ tick: 9, instanceId: INSTANCE_IDS.PHASE2 }),
        instanceMismatchState
      )
    ).toEqual({
      kind: 'resync',
      reason: SNAPSHOT_RESYNC_REASONS.INSTANCE_MISMATCH,
      lastTick: 8,
      instanceId: INSTANCE_IDS.PHASE1,
    });
  });

  it('clears pending resync state after a full baseline arrives', () => {
    const state = createSnapshotNormalizationState();

    normalizeServerMessageResult(createIncrementalDelta(), state);
    expect(normalizeServerMessageResult(createFullDelta({ tick: 9 }), state)).toMatchObject({
      kind: 'message',
      snapshotBaseApplied: true,
      message: expect.objectContaining({ type: SERVER_MESSAGE_TYPES.SNAPSHOT }),
    });
    expect(normalizeServerMessage(createIncrementalDelta({ tick: 10 }), state)).not.toBeNull();
  });
});
