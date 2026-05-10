import { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { useGameStore } from './store';

export function shouldHandleLeaderboardTab(event: KeyboardEvent): boolean {
  if (event.key !== 'Tab') {
    return false;
  }

  const target = event.target;
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) {
    return true;
  }

  return !(
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export function Leaderboard() {
  const [visible, setVisible] = useState(false);
  const allPlayers = useGameStore((s) => s.allPlayers);
  const localPlayerId = useGameStore((s) => s.localPlayerId);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (shouldHandleLeaderboardTab(e)) {
        e.preventDefault();
        setVisible(true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (shouldHandleLeaderboardTab(e)) setVisible(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  const sorted = useMemo(
    () => [...allPlayers].sort((a, b) => b.playerKills - a.playerKills),
    [allPlayers]
  );

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono">
      <div className="min-w-[460px] rounded-md border border-white/20 bg-[rgba(0,0,0,0.78)] px-0 pt-4 pb-3">
        <div className="mb-2.5 text-center text-[13px] font-bold tracking-[0.125rem] text-[#aaddff]">
          PLAYERS
        </div>

        {/* Header */}
        <div className="grid grid-cols-[1fr_100px_110px_70px] border-b border-white/15 px-4 pb-1.5 text-[10px] text-white/50 uppercase">
          <span>Nickname</span>
          <span className="text-center">Players Killed</span>
          <span className="text-center">Monsters Killed</span>
          <span className="text-center">Deaths</span>
        </div>

        {/* Rows */}
        {sorted.map((p) => {
          const isLocal = p.id === localPlayerId;
          return (
            <div
              key={p.id}
              className={classNames('grid grid-cols-[1fr_100px_110px_70px] px-4 py-[5px] text-xs', {
                'bg-[rgba(255,230,80,0.07)] text-[#ffee88]': isLocal,
                'bg-transparent text-white': !isLocal,
              })}
            >
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                {isLocal ? '▶ ' : ''}
                {p.nickname}
              </span>
              <span className="text-center text-[#ff9999]">{p.playerKills}</span>
              <span className="text-center text-[#88ff88]">{p.monsterKills}</span>
              <span className="text-center text-[#aaaaaa]">{p.deaths}</span>
            </div>
          );
        })}

        <div className="mt-2.5 text-center text-[9px] text-white/25">
          Hold TAB to view
        </div>
      </div>
    </div>
  );
}
