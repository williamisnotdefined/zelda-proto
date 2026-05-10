import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    Geom: {
      Rectangle: class Rectangle {
        x = 0;
        y = 0;
        width = 0;
        height = 0;

        setTo(x: number, y: number, width: number, height: number): this {
          this.x = x;
          this.y = y;
          this.width = width;
          this.height = height;
          return this;
        }

        get left(): number {
          return this.x;
        }

        get right(): number {
          return this.x + this.width;
        }

        get top(): number {
          return this.y;
        }

        get bottom(): number {
          return this.y + this.height;
        }
      },
    },
  },
}));

const entityMocks = vi.hoisted(() => ({
  drops: [] as Array<{ id: string; kind: string; destroyed: boolean }>,
  portals: [] as Array<{ kind: string; destroyed: boolean }>,
  hazards: [] as Array<{ kind: string; destroyed: boolean }>,
}));

vi.mock('../../../entities/DropEntity', () => ({
  DropEntity: class DropEntity {
    sprite: { x: number; y: number };
    destroyed = false;

    constructor(_scene: unknown, readonly id: string, x: number, y: number, readonly kind: string) {
      this.sprite = { x, y };
      entityMocks.drops.push(this);
    }

    updatePosition(x: number, y: number): void {
      this.sprite.x = x;
      this.sprite.y = y;
    }

    update(): void {}

    destroy(): void {
      this.destroyed = true;
    }
  },
}));

vi.mock('../../../entities/PortalEntity', () => ({
  PortalEntity: class PortalEntity {
    destroyed = false;

    constructor(
      _scene: unknown,
      public x: number,
      public y: number,
      public kind: string
    ) {
      entityMocks.portals.push(this);
    }

    updatePosition(x: number, y: number): void {
      this.x = x;
      this.y = y;
    }

    updateKind(kind: string): void {
      this.kind = kind;
    }

    update(): void {}

    destroy(): void {
      this.destroyed = true;
    }
  },
}));

vi.mock('./hazardRegistry', () => {
  class HazardEntity {
    destroyed = false;
    x: number;
    y: number;

    constructor(readonly kind: string, snapshot: { x: number; y: number }) {
      this.x = snapshot.x;
      this.y = snapshot.y;
      entityMocks.hazards.push(this);
    }

    syncSnapshot(snapshot: { x: number; y: number }): void {
      this.x = snapshot.x;
      this.y = snapshot.y;
    }

    update(): void {}

    destroy(): void {
      this.destroyed = true;
    }
  }

  return {
    hazardRegistry: {
      fire_field: {
        create: (_scene: unknown, snapshot: { x: number; y: number }) =>
          new HazardEntity('fire_field', snapshot),
      },
      blue_flame: {
        create: (_scene: unknown, snapshot: { x: number; y: number }) =>
          new HazardEntity('blue_flame', snapshot),
      },
    },
  };
});

import { DROP_KINDS, HAZARD_KINDS, PORTAL_KINDS } from '@/shared';
import { StaticEntityRuntime } from './StaticEntityRuntime';

function createScene(worldView = { x: 0, y: 0, width: 100, height: 100 }) {
  return {
    cameras: {
      main: {
        worldView,
      },
    },
  };
}

describe('StaticEntityRuntime', () => {
  beforeEach(() => {
    entityMocks.drops.length = 0;
    entityMocks.portals.length = 0;
    entityMocks.hazards.length = 0;
  });

  it('keeps snapshot counts while creating only entities inside cull ranges', () => {
    const worldView = { x: 0, y: 0, width: 100, height: 100 };
    const runtime = new StaticEntityRuntime(createScene(worldView) as never);

    runtime.syncDrops([
      { id: 'drop-near', x: 40, y: 40, kind: DROP_KINDS.FOOD_SMALL },
      { id: 'drop-far', x: 2400, y: 40, kind: DROP_KINDS.FOOD_SMALL },
    ]);
    runtime.syncPortals([
      { id: 'portal-near', x: 40, y: 40, kind: PORTAL_KINDS.PHASE1_TO_PHASE2 },
      { id: 'portal-far', x: 2400, y: 40, kind: PORTAL_KINDS.PHASE2_TO_PHASE1 },
    ]);
    runtime.syncHazards([
      { id: 'hazard-near', x: 40, y: 40, kind: HAZARD_KINDS.FIRE_FIELD, ttlMs: 1000 },
      { id: 'hazard-far', x: 2400, y: 40, kind: HAZARD_KINDS.FIRE_FIELD, ttlMs: 1000 },
    ]);

    expect(runtime.getDropCount()).toBe(2);
    expect(runtime.getPortalCount()).toBe(2);
    expect(runtime.getHazardCount()).toBe(2);
    expect(runtime.getPortalEntities().size).toBe(0);

    runtime.update(16);

    expect(entityMocks.drops).toHaveLength(1);
    expect(entityMocks.portals).toHaveLength(1);
    expect(entityMocks.hazards).toHaveLength(1);
    expect(runtime.getPortalEntities().size).toBe(1);

    const firstDrop = entityMocks.drops[0];
    const firstPortal = entityMocks.portals[0];
    const firstHazard = entityMocks.hazards[0];

    worldView.x = 2300;
    runtime.update(16);

    expect(firstDrop.destroyed).toBe(true);
    expect(firstPortal.destroyed).toBe(true);
    expect(firstHazard.destroyed).toBe(true);
    expect(entityMocks.drops).toHaveLength(2);
    expect(entityMocks.portals).toHaveLength(2);
    expect(entityMocks.hazards).toHaveLength(2);
  });

  it('recreates an active hazard when its kind changes', () => {
    const runtime = new StaticEntityRuntime(createScene() as never);

    runtime.syncHazards([
      { id: 'hazard-1', x: 40, y: 40, kind: HAZARD_KINDS.FIRE_FIELD, ttlMs: 1000 },
    ]);
    runtime.update(16);

    const firstHazard = entityMocks.hazards[0];

    runtime.syncHazards([
      { id: 'hazard-1', x: 40, y: 40, kind: HAZARD_KINDS.BLUE_FLAME, ttlMs: 1000 },
    ]);
    runtime.update(16);

    expect(firstHazard.destroyed).toBe(true);
    expect(entityMocks.hazards).toHaveLength(2);
    expect(entityMocks.hazards[1].kind).toBe(HAZARD_KINDS.BLUE_FLAME);
  });
});
