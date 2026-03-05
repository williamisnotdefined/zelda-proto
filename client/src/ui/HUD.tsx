import { useEffect, useState } from 'react';
import { useTouchInputStore } from '../game/input/touchInputStore';
import { phaserGame } from '../game/instance';
import { connect } from '../network/socket';
import { Chat } from './Chat';
import { Leaderboard } from './Leaderboard';
import { NicknameModal } from './NicknameModal';
import { useGameStore } from './store';

export function HUD() {
  const localPlayer = useGameStore((s) => s.localPlayer);
  const connected = useGameStore((s) => s.connected);
  const playerCount = useGameStore((s) => s.playerCount);
  const connectionError = useGameStore((s) => s.connectionError);
  const lastConnectionAttempt = useGameStore((s) => s.lastConnectionAttempt);
  const touchEnabled = useTouchInputStore((s) => s.enabled);
  const [musicMuted, setMusicMuted] = useState(false);

  useEffect(() => {
    const muted = phaserGame?.sound.mute ?? false;
    setMusicMuted(muted);
  }, []);

  const handleRetry = () => {
    useGameStore.getState().setConnectionError(null);
    connect();
  };

  const toggleMusicMute = () => {
    const soundManager = phaserGame?.sound;
    if (!soundManager) return;
    soundManager.mute = !soundManager.mute;
    setMusicMuted(soundManager.mute);
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

      {/* Top-right status + music button */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 6,
        }}
      >
        <button
          onClick={toggleMusicMute}
          style={{
            pointerEvents: 'auto',
            padding: '4px 8px',
            fontSize: '11px',
            cursor: 'pointer',
            background: 'rgba(0, 0, 0, 0.55)',
            border: '1px solid #666',
            color: '#fff',
            borderRadius: 3,
          }}
        >
          {musicMuted ? 'Unmute Music' : 'Mute Music'}
        </button>

        <div style={{ fontSize: '11px', opacity: 0.7, textAlign: 'right' }}>
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
      </div>

      {/* Player HP */}
      {localPlayer && (
        <div style={{ position: 'absolute', top: 16, left: 16 }}>
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

      {/* Controls hint */}
      {!touchEnabled && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            fontSize: '10px',
            opacity: 0.4,
          }}
        >
          Arrow keys / WASD: move | Space: attack | Tab: players
        </div>
      )}

      {/* Chat */}
      <Chat />

      {/* Leaderboard */}
      <Leaderboard />
    </div>
  );
}
