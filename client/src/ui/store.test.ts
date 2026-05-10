import { afterEach, describe, expect, it } from 'vitest';
import type { GameStore, PlayerData } from './store';
import { useGameStore } from './store';

function createPlayer(overrides: Partial<PlayerData> = {}): PlayerData {
  return {
    id: 'player-1',
    nickname: 'Link',
    x: 10,
    y: 20,
    hp: 100,
    maxHp: 100,
    state: 'idle',
    direction: 'down',
    ...overrides,
  };
}

describe('useGameStore', () => {
  afterEach(() => {
    useGameStore.setState({
      localPlayer: null,
      localPlayerHud: null,
    } as Partial<GameStore>);
  });

  it('keeps the HUD slice stable when only local player position changes', () => {
    const { setLocalPlayer } = useGameStore.getState();

    setLocalPlayer(createPlayer());
    const firstHud = useGameStore.getState().localPlayerHud;

    setLocalPlayer(createPlayer({ x: 120, y: 240, direction: 'right' }));

    expect(useGameStore.getState().localPlayerHud).toBe(firstHud);
    expect(useGameStore.getState().localPlayer?.x).toBe(120);
  });

  it('updates the HUD slice when HP or state changes', () => {
    const { setLocalPlayer } = useGameStore.getState();

    setLocalPlayer(createPlayer());
    const firstHud = useGameStore.getState().localPlayerHud;

    setLocalPlayer(createPlayer({ hp: 40, state: 'dead' }));

    expect(useGameStore.getState().localPlayerHud).not.toBe(firstHud);
    expect(useGameStore.getState().localPlayerHud).toEqual({
      hp: 40,
      maxHp: 100,
      state: 'dead',
    });
  });
});
