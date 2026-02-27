import { useEffect, useState } from 'react';
import { useGameStore } from './store';

export function Leaderboard() {
  const [visible, setVisible] = useState(false);
  const allPlayers = useGameStore((s) => s.allPlayers);
  const localPlayerId = useGameStore((s) => s.localPlayerId);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        setVisible(true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'Tab') setVisible(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  if (!visible) return null;

  const sorted = [...allPlayers].sort((a, b) => b.playerKills - a.playerKills);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        fontFamily: 'monospace',
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.78)',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 6,
          minWidth: 460,
          padding: '16px 0 12px',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            fontSize: '13px',
            fontWeight: 'bold',
            color: '#aaddff',
            marginBottom: 10,
            letterSpacing: 2,
          }}
        >
          PLAYERS
        </div>

        {/* Header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 110px 70px',
            padding: '0 16px 6px',
            borderBottom: '1px solid rgba(255,255,255,0.15)',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.5)',
            textTransform: 'uppercase',
          }}
        >
          <span>Nickname</span>
          <span style={{ textAlign: 'center' }}>Players Killed</span>
          <span style={{ textAlign: 'center' }}>Monsters Killed</span>
          <span style={{ textAlign: 'center' }}>Deaths</span>
        </div>

        {/* Rows */}
        {sorted.map((p) => {
          const isLocal = p.id === localPlayerId;
          return (
            <div
              key={p.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 110px 70px',
                padding: '5px 16px',
                fontSize: '12px',
                color: isLocal ? '#ffee88' : '#fff',
                background: isLocal ? 'rgba(255,230,80,0.07)' : 'transparent',
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {isLocal ? '▶ ' : ''}
                {p.nickname}
              </span>
              <span style={{ textAlign: 'center', color: '#ff9999' }}>{p.playerKills}</span>
              <span style={{ textAlign: 'center', color: '#88ff88' }}>{p.monsterKills}</span>
              <span style={{ textAlign: 'center', color: '#aaaaaa' }}>{p.deaths}</span>
            </div>
          );
        })}

        <div
          style={{
            textAlign: 'center',
            fontSize: '9px',
            color: 'rgba(255,255,255,0.25)',
            marginTop: 10,
          }}
        >
          Hold TAB to view
        </div>
      </div>
    </div>
  );
}
