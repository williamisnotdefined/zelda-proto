import { connect } from '../network/socket';
import { Chat } from './Chat';
import { Leaderboard } from './Leaderboard';
import { NicknameModal } from './NicknameModal';
import { useGameStore } from './store';

export function HUD() {
  const localPlayer = useGameStore((s) => s.localPlayer);
  const boss = useGameStore((s) => s.boss);
  const connected = useGameStore((s) => s.connected);
  const playerCount = useGameStore((s) => s.playerCount);
  const connectionError = useGameStore((s) => s.connectionError);
  const lastConnectionAttempt = useGameStore((s) => s.lastConnectionAttempt);

  const handleRetry = () => {
    useGameStore.getState().setConnectionError(null);
    connect();
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        fontFamily: 'monospace',
        color: '#fff',
      }}
    >
      {/* Nickname modal */}
      <NicknameModal />

      {/* Connection status */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          fontSize: '11px',
          opacity: 0.7,
        }}
      >
        {connected ? (
          `Online (${playerCount} players)`
        ) : connectionError ? (
          <div style={{ color: '#ff6666', opacity: 1 }}>
            <div>❌ {connectionError}</div>
            <button
              onClick={handleRetry}
              style={{
                marginTop: 4,
                padding: '4px 8px',
                fontSize: '10px',
                cursor: 'pointer',
                pointerEvents: 'auto',
                background: '#444',
                border: '1px solid #666',
                color: '#fff',
                borderRadius: 3,
              }}
            >
              Retry Connection
            </button>
          </div>
        ) : (
          <div>
            Connecting...
            {lastConnectionAttempt && (
              <div style={{ fontSize: '9px', marginTop: 2 }}>
                Last attempt: {new Date(lastConnectionAttempt).toLocaleTimeString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Player HP */}
      {localPlayer && (
        <div style={{ position: 'absolute', bottom: 16, left: 16 }}>
          <div style={{ fontSize: '12px', marginBottom: 4 }}>HP</div>
          <div
            style={{
              width: 200,
              height: 16,
              background: '#333',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(localPlayer.hp / localPlayer.maxHp) * 100}%`,
                height: '100%',
                background:
                  localPlayer.hp / localPlayer.maxHp > 0.5
                    ? '#44ff44'
                    : localPlayer.hp / localPlayer.maxHp > 0.25
                      ? '#ffaa00'
                      : '#ff4444',
                transition: 'width 0.1s',
              }}
            />
          </div>
          <div style={{ fontSize: '11px', marginTop: 2, opacity: 0.8 }}>
            {localPlayer.hp} / {localPlayer.maxHp}
          </div>
        </div>
      )}

      {/* Death overlay */}
      {localPlayer?.state === 'dead' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: '32px', color: '#ff4444', fontWeight: 'bold' }}>YOU DIED</div>
          <div style={{ fontSize: '14px', marginTop: 8, opacity: 0.7 }}>Respawning...</div>
        </div>
      )}

      {/* Boss HP bar */}
      {boss && boss.state !== 'dead' && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#aaaaff', marginBottom: 4 }}>
            GELEHK {boss.phase > 1 ? `(Phase ${boss.phase})` : ''}
          </div>
          <div
            style={{
              width: 300,
              height: 12,
              background: '#333',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${(boss.hp / boss.maxHp) * 100}%`,
                height: '100%',
                background: boss.phase === 3 ? '#ff4444' : boss.phase === 2 ? '#8844ff' : '#6666ff',
                transition: 'width 0.1s',
              }}
            />
          </div>
          <div style={{ fontSize: '10px', marginTop: 2, opacity: 0.7 }}>
            {boss.hp} / {boss.maxHp}
          </div>
        </div>
      )}

      {/* Controls hint */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          fontSize: '10px',
          opacity: 0.4,
        }}
      >
        Arrow keys: move | Space: attack | Tab: players
      </div>

      {/* Chat */}
      <Chat />

      {/* Leaderboard */}
      <Leaderboard />
    </div>
  );
}
