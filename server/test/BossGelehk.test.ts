import { describe, expect, it, vi } from 'vitest';
import { BossGelehk } from '../src/entities/BossGelehk';
import { Player } from '../src/entities/Player';

describe('BossGelehk', () => {
  it('telegraphs the phase 3 wave before it expands', () => {
    const boss = new BossGelehk('boss', 0, 0);
    const player = new Player('player', 20, 0, 'Link');
    const players = new Map([[player.id, player]]);

    boss.active = true;
    boss.hp = Math.floor(boss.maxHp * 0.2);

    boss.update(1000, players, vi.fn(), vi.fn());
    boss.update(16, players, vi.fn(), vi.fn());
    boss.update(16, players, vi.fn(), vi.fn());

    expect(boss.getWaveIndicator()).toMatchObject({
      state: 'windup',
    });
  });

  it('spawns purple field clusters along the expanding phase 3 wave', () => {
    const boss = new BossGelehk('boss', 0, 0);
    const player = new Player('player', 20, 0, 'Link');
    const players = new Map([[player.id, player]]);
    const spawnPurpleField = vi.fn();

    boss.active = true;
    boss.hp = Math.floor(boss.maxHp * 0.2);

    boss.update(1000, players, vi.fn(), spawnPurpleField);
    boss.update(16, players, vi.fn(), spawnPurpleField);
    boss.update(16, players, vi.fn(), spawnPurpleField);
    boss.update(500, players, vi.fn(), spawnPurpleField);
    boss.update(1600, players, vi.fn(), spawnPurpleField);

    expect(boss.getWaveIndicator()).toMatchObject({
      state: 'expanding',
    });
    expect(spawnPurpleField).toHaveBeenCalled();
    expect(spawnPurpleField).toHaveBeenCalledTimes(6);
  });

  it('does not restart the phase 3 wave before the current one ends', () => {
    const boss = new BossGelehk('boss', 0, 0);
    const player = new Player('player', 20, 0, 'Link');
    const players = new Map([[player.id, player]]);

    boss.active = true;
    boss.hp = Math.floor(boss.maxHp * 0.2);

    boss.update(1000, players, vi.fn(), vi.fn());
    boss.update(16, players, vi.fn(), vi.fn());
    boss.update(16, players, vi.fn(), vi.fn());
    boss.update(500, players, vi.fn(), vi.fn());
    boss.update(1700, players, vi.fn(), vi.fn());

    expect(boss.getWaveIndicator()).toMatchObject({
      state: 'expanding',
    });

    boss.update(16, players, vi.fn(), vi.fn());

    expect(boss.getWaveIndicator()).toMatchObject({
      state: 'expanding',
    });
  });
});
