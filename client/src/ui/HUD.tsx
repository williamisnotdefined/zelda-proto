import { useEffect, useState } from 'react';
import { PLAYER_DASH_COOLDOWN, PLAYER_WAVE_COOLDOWN } from '@/game-core';
import { Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import { useTouchInputStore } from '../game/input/touchInputStore';
import { phaserGame } from '../game/instance';
import { gameConnection } from '../network/gameConnection';
import {
  confirmPwaUpdate,
  dismissPwaUpdatePrompt,
  subscribePwaUpdatePrompt,
} from '../pwa/updatePrompt';
import { Chat } from './Chat';
import { Leaderboard } from './Leaderboard';
import { NicknameModal } from './NicknameModal';
import { useGameStore } from './store';

export function HUD() {
  const localPlayer = useGameStore((s) => s.localPlayer);
  const connected = useGameStore((s) => s.connected);
  const playerCount = useGameStore((s) => s.playerCount);
  const waveCooldownEndsAt = useGameStore((s) => s.waveCooldownEndsAt);
  const dashCooldownEndsAt = useGameStore((s) => s.dashCooldownEndsAt);
  const connectionError = useGameStore((s) => s.connectionError);
  const lastConnectionAttempt = useGameStore((s) => s.lastConnectionAttempt);
  const setConnectionError = useGameStore((s) => s.setConnectionError);
  const touchEnabled = useTouchInputStore((s) => s.enabled);
  const [musicMuted, setMusicMuted] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pwaUpdateAvailable, setPwaUpdateAvailable] = useState(false);
  const [cooldownNowMs, setCooldownNowMs] = useState(() => Date.now());

  useEffect(() => {
    const muted = phaserGame?.sound.mute ?? false;
    setMusicMuted(muted);
  }, []);

  useEffect(() => {
    return subscribePwaUpdatePrompt(setPwaUpdateAvailable);
  }, []);

  useEffect(() => {
    if (!waveCooldownEndsAt && !dashCooldownEndsAt) {
      setCooldownNowMs(Date.now());
      return;
    }

    setCooldownNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setCooldownNowMs(now);
      if (now >= (waveCooldownEndsAt ?? 0) && now >= (dashCooldownEndsAt ?? 0)) {
        window.clearInterval(intervalId);
      }
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [dashCooldownEndsAt, waveCooldownEndsAt]);

  useEffect(() => {
    const element = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    const canRequest =
      typeof element.requestFullscreen === 'function' ||
      typeof element.webkitRequestFullscreen === 'function';
    const canExit =
      typeof document.exitFullscreen === 'function' ||
      typeof doc.webkitExitFullscreen === 'function';
    setFullscreenSupported(canRequest && canExit);

    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement || doc.webkitFullscreenElement));
    };

    syncFullscreen();
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen as EventListener);

    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen as EventListener);
    };
  }, []);

  const handleRetry = () => {
    setConnectionError(null);
    gameConnection.connect();
  };

  const toggleMusicMute = () => {
    const soundManager = phaserGame?.sound;
    if (!soundManager) return;
    soundManager.mute = !soundManager.mute;
    setMusicMuted(soundManager.mute);
  };

  const toggleFullscreen = async () => {
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    try {
      if (document.fullscreenElement || doc.webkitFullscreenElement) {
        if (typeof document.exitFullscreen === 'function') {
          await document.exitFullscreen();
        } else {
          await doc.webkitExitFullscreen?.();
        }
        return;
      }

      if (typeof root.requestFullscreen === 'function') {
        await root.requestFullscreen();
      } else {
        await root.webkitRequestFullscreen?.();
      }
    } catch {
      // User gesture restrictions can reject fullscreen attempts.
    }
  };

  const handleUpdateNow = async () => {
    await confirmPwaUpdate();
  };

  const handleUpdateLater = () => {
    dismissPwaUpdatePrompt();
  };

  const waveCooldownRemainingMs = Math.max(0, (waveCooldownEndsAt ?? 0) - cooldownNowMs);
  const waveReady = !waveCooldownEndsAt || waveCooldownRemainingMs <= 0;
  const waveCooldownProgress = waveReady ? 1 : 1 - waveCooldownRemainingMs / PLAYER_WAVE_COOLDOWN;
  const dashCooldownRemainingMs = Math.max(0, (dashCooldownEndsAt ?? 0) - cooldownNowMs);
  const dashReady = !dashCooldownEndsAt || dashCooldownRemainingMs <= 0;
  const dashCooldownProgress = dashReady ? 1 : 1 - dashCooldownRemainingMs / PLAYER_DASH_COOLDOWN;

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
          aria-label={musicMuted ? 'Ativar musica' : 'Mutar musica'}
          title={musicMuted ? 'Ativar musica' : 'Mutar musica'}
          style={{
            pointerEvents: 'auto',
            width: 30,
            height: 30,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: 'rgba(0, 0, 0, 0.55)',
            border: '1px solid #666',
            color: '#fff',
            borderRadius: 3,
          }}
        >
          {musicMuted ? (
            <VolumeX size={16} strokeWidth={2} />
          ) : (
            <Volume2 size={16} strokeWidth={2} />
          )}
        </button>

        {touchEnabled && fullscreenSupported && (
          <button
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
            title={isFullscreen ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
            style={{
              pointerEvents: 'auto',
              width: 30,
              height: 30,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              background: 'rgba(0, 0, 0, 0.55)',
              border: '1px solid #666',
              color: '#fff',
              borderRadius: 3,
            }}
          >
            {isFullscreen ? (
              <Minimize2 size={16} strokeWidth={2} />
            ) : (
              <Maximize2 size={16} strokeWidth={2} />
            )}
          </button>
        )}

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
          <div style={{ marginTop: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                marginBottom: 4,
                opacity: 0.92,
              }}
            >
              <span>Dash</span>
              <span
                style={{
                  color: dashReady ? '#8df7ff' : '#d3fbff',
                }}
              >
                {dashReady ? 'READY' : `${(dashCooldownRemainingMs / 1000).toFixed(1)}s`}
              </span>
            </div>
            <div
              style={{
                width: 200,
                height: 10,
                background: 'rgba(14, 24, 34, 0.92)',
                border: '1px solid rgba(114, 224, 255, 0.28)',
                borderRadius: 999,
                overflow: 'hidden',
                boxShadow: 'inset 0 0 12px rgba(117, 226, 255, 0.1)',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  width: `${dashCooldownProgress * 100}%`,
                  height: '100%',
                  background: dashReady
                    ? 'linear-gradient(90deg, #66d9ff 0%, #b8f5ff 100%)'
                    : 'linear-gradient(90deg, #2f7db8 0%, #5ad7ff 100%)',
                  boxShadow: dashReady ? '0 0 12px rgba(127, 238, 255, 0.45)' : 'none',
                  transition: dashReady ? 'width 0.08s linear, box-shadow 0.08s linear' : 'none',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '11px',
                marginBottom: 4,
                opacity: 0.92,
              }}
            >
              <span>Wave</span>
              <span
                style={{
                  color: waveReady ? '#ffb7ff' : '#ffd9ff',
                }}
              >
                {waveReady ? 'READY' : `${(waveCooldownRemainingMs / 1000).toFixed(1)}s`}
              </span>
            </div>
            <div
              style={{
                width: 200,
                height: 10,
                background: 'rgba(26, 16, 36, 0.92)',
                border: '1px solid rgba(255, 164, 245, 0.28)',
                borderRadius: 999,
                overflow: 'hidden',
                boxShadow: 'inset 0 0 12px rgba(255, 135, 240, 0.1)',
              }}
            >
              <div
                style={{
                  width: `${waveCooldownProgress * 100}%`,
                  height: '100%',
                  background: waveReady
                    ? 'linear-gradient(90deg, #f68cff 0%, #ffb7ff 100%)'
                    : 'linear-gradient(90deg, #8b43d9 0%, #d668ff 100%)',
                  boxShadow: waveReady ? '0 0 12px rgba(255, 166, 245, 0.5)' : 'none',
                  transition: waveReady ? 'width 0.08s linear, box-shadow 0.08s linear' : 'none',
                }}
              />
            </div>
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
          Arrow keys / WASD: move | Double tap arrows / WASD: dash | R: wave | Space: attack | Tab: players
        </div>
      )}

      {pwaUpdateAvailable && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: touchEnabled ? 'calc(env(safe-area-inset-bottom, 0px) + 188px)' : 16,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            background: 'rgba(10, 10, 10, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 8,
            padding: '10px 12px',
            minWidth: 260,
            maxWidth: 'min(420px, calc(100vw - 24px))',
            boxShadow: '0 8px 26px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            zIndex: 60,
          }}
        >
          <div style={{ fontSize: '12px', lineHeight: 1.2, opacity: 0.95 }}>
            Nova versao do jogo disponivel.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleUpdateLater}
              style={{
                padding: '5px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid #666',
                color: '#fff',
                borderRadius: 4,
              }}
            >
              Depois
            </button>
            <button
              onClick={handleUpdateNow}
              style={{
                padding: '5px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                background: 'rgba(74, 163, 255, 0.25)',
                border: '1px solid rgba(95, 179, 255, 0.9)',
                color: '#fff',
                borderRadius: 4,
              }}
            >
              Atualizar
            </button>
          </div>
        </div>
      )}

      {/* Chat */}
      {!touchEnabled && <Chat />}

      {/* Leaderboard */}
      <Leaderboard />
    </div>
  );
}
