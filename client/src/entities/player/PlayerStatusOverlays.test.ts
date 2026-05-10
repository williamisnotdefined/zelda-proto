import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {},
}));

import { PlayerStatusOverlays } from './PlayerStatusOverlays';

class FakeDomElement {
  x = 0;
  y = 0;
  visible = false;
  destroyed = false;

  setDepth(): this {
    return this;
  }

  setAlpha(): this {
    return this;
  }

  setOrigin(): this {
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

function createScene() {
  const elements: FakeDomElement[] = [];
  return {
    elements,
    scene: {
      add: {
        dom: vi.fn(() => {
          const element = new FakeDomElement();
          elements.push(element);
          return element;
        }),
      },
    },
  };
}

describe('PlayerStatusOverlays', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates DOM overlays only when a status becomes active', () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        style: {},
        draggable: false,
      })),
    });
    const { scene, elements } = createScene();
    const overlays = new PlayerStatusOverlays(scene as never, 10, 20);

    expect(scene.add.dom).not.toHaveBeenCalled();

    overlays.sync(10, 20, {});
    expect(scene.add.dom).not.toHaveBeenCalled();

    overlays.sync(10, 20, { burning: { ticksRemaining: 2 } });
    expect(scene.add.dom).toHaveBeenCalledTimes(1);
    expect(elements[0].visible).toBe(true);

    overlays.sync(10, 20, { burning: { ticksRemaining: 1 } });
    expect(scene.add.dom).toHaveBeenCalledTimes(1);

    overlays.sync(10, 20, {});
    expect(elements[0].visible).toBe(false);

    overlays.destroy();
    expect(elements[0].destroyed).toBe(true);
  });
});
