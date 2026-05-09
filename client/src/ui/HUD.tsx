import classNames from 'classnames';
import { useEffect, useState } from 'react';
import {
  PLAYER_DASH_COOLDOWN,
  PLAYER_FIREBALL_COOLDOWN,
  PLAYER_GRENADE_COOLDOWN,
  PLAYER_LANDMINE_COOLDOWN,
  PLAYER_NUMB_COOLDOWN,
  PLAYER_PULL_COOLDOWN,
  PLAYER_VENOM_COOLDOWN,
  PLAYER_WAVE_COOLDOWN,
} from '@/game-core';
import { weaponDefinitions } from '@/shared/definitions';
import { Volume2, VolumeX } from 'lucide-react';
import { phaserGame } from '../game/instance';
import { gameConnection } from '../network/gameConnection';
import { Leaderboard } from './Leaderboard';
import { NicknameModal } from './NicknameModal';
import { useGameStore } from './store';

interface CooldownMeterProps {
  label: string;
  ready: boolean;
  remainingMs: number;
  progress: number;
  widthClassName: string;
  valueReadyClassName: string;
  valueCooldownClassName: string;
  trackClassName: string;
  fillReadyClassName: string;
  fillCooldownClassName: string;
  glowClassName?: string;
}

function CooldownMeter({
  label,
  ready,
  remainingMs,
  progress,
  widthClassName,
  valueReadyClassName,
  valueCooldownClassName,
  trackClassName,
  fillReadyClassName,
  fillCooldownClassName,
  glowClassName,
}: CooldownMeterProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] opacity-[0.92]">
        <span>{label}</span>
        <span
          className={classNames({
            [valueReadyClassName]: ready,
            [valueCooldownClassName]: !ready,
          })}
        >
          {ready ? 'READY' : `${(remainingMs / 1000).toFixed(1)}s`}
        </span>
      </div>
      <div className={classNames(widthClassName, trackClassName, 'mb-2 h-2.5 overflow-hidden rounded-full border')}>
        <div
          className={classNames(
            'h-full',
            {
              [fillReadyClassName]: ready,
              [fillCooldownClassName]: !ready,
              'transition-[width,box-shadow] duration-75 ease-linear': ready,
            },
            ready && glowClassName
          )}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}

export function HUD() {
  const localPlayer = useGameStore((s) => s.localPlayer);
  const connected = useGameStore((s) => s.connected);
  const playerCount = useGameStore((s) => s.playerCount);
  const waveCooldownEndsAt = useGameStore((s) => s.waveCooldownEndsAt);
  const numbCooldownEndsAt = useGameStore((s) => s.numbCooldownEndsAt);
  const pullCooldownEndsAt = useGameStore((s) => s.pullCooldownEndsAt);
  const venomCooldownEndsAt = useGameStore((s) => s.venomCooldownEndsAt);
  const dashCooldownEndsAt = useGameStore((s) => s.dashCooldownEndsAt);
  const fireballCooldownEndsAt = useGameStore((s) => s.fireballCooldownEndsAt);
  const grenadeCooldownEndsAt = useGameStore((s) => s.grenadeCooldownEndsAt);
  const landmineCooldownEndsAt = useGameStore((s) => s.landmineCooldownEndsAt);
  const connectionError = useGameStore((s) => s.connectionError);
  const lastConnectionAttempt = useGameStore((s) => s.lastConnectionAttempt);
  const setConnectionError = useGameStore((s) => s.setConnectionError);
  const [musicMuted, setMusicMuted] = useState(false);
  const [cooldownNowMs, setCooldownNowMs] = useState(() => Date.now());

  useEffect(() => {
    const muted = phaserGame?.sound.mute ?? false;
    setMusicMuted(muted);
  }, []);

  useEffect(() => {
    if (
      !waveCooldownEndsAt &&
      !numbCooldownEndsAt &&
      !pullCooldownEndsAt &&
      !venomCooldownEndsAt &&
      !dashCooldownEndsAt &&
      !fireballCooldownEndsAt &&
      !grenadeCooldownEndsAt &&
      !landmineCooldownEndsAt
    ) {
      setCooldownNowMs(Date.now());
      return;
    }

    setCooldownNowMs(Date.now());
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setCooldownNowMs(now);
      if (
        now >= (waveCooldownEndsAt ?? 0) &&
        now >= (numbCooldownEndsAt ?? 0) &&
        now >= (pullCooldownEndsAt ?? 0) &&
        now >= (venomCooldownEndsAt ?? 0) &&
        now >= (dashCooldownEndsAt ?? 0) &&
        now >= (fireballCooldownEndsAt ?? 0) &&
        now >= (grenadeCooldownEndsAt ?? 0) &&
        now >= (landmineCooldownEndsAt ?? 0)
      ) {
        window.clearInterval(intervalId);
      }
    }, 50);

    return () => window.clearInterval(intervalId);
  }, [
    dashCooldownEndsAt,
    fireballCooldownEndsAt,
    grenadeCooldownEndsAt,
    landmineCooldownEndsAt,
    numbCooldownEndsAt,
    pullCooldownEndsAt,
    venomCooldownEndsAt,
    waveCooldownEndsAt,
  ]);

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

  const waveCooldownRemainingMs = Math.max(0, (waveCooldownEndsAt ?? 0) - cooldownNowMs);
  const waveReady = !waveCooldownEndsAt || waveCooldownRemainingMs <= 0;
  const waveCooldownProgress = waveReady ? 1 : 1 - waveCooldownRemainingMs / PLAYER_WAVE_COOLDOWN;
  const numbCooldownRemainingMs = Math.max(0, (numbCooldownEndsAt ?? 0) - cooldownNowMs);
  const numbReady = !numbCooldownEndsAt || numbCooldownRemainingMs <= 0;
  const numbCooldownProgress = numbReady ? 1 : 1 - numbCooldownRemainingMs / PLAYER_NUMB_COOLDOWN;
  const pullCooldownRemainingMs = Math.max(0, (pullCooldownEndsAt ?? 0) - cooldownNowMs);
  const pullReady = !pullCooldownEndsAt || pullCooldownRemainingMs <= 0;
  const pullCooldownProgress = pullReady ? 1 : 1 - pullCooldownRemainingMs / PLAYER_PULL_COOLDOWN;
  const venomCooldownRemainingMs = Math.max(0, (venomCooldownEndsAt ?? 0) - cooldownNowMs);
  const venomReady = !venomCooldownEndsAt || venomCooldownRemainingMs <= 0;
  const venomCooldownProgress = venomReady ? 1 : 1 - venomCooldownRemainingMs / PLAYER_VENOM_COOLDOWN;
  const dashCooldownRemainingMs = Math.max(0, (dashCooldownEndsAt ?? 0) - cooldownNowMs);
  const dashReady = !dashCooldownEndsAt || dashCooldownRemainingMs <= 0;
  const dashCooldownProgress = dashReady ? 1 : 1 - dashCooldownRemainingMs / PLAYER_DASH_COOLDOWN;
  const fireballCooldownRemainingMs = Math.max(0, (fireballCooldownEndsAt ?? 0) - cooldownNowMs);
  const fireballReady = !fireballCooldownEndsAt || fireballCooldownRemainingMs <= 0;
  const fireballCooldownProgress = fireballReady
    ? 1
    : 1 - fireballCooldownRemainingMs / PLAYER_FIREBALL_COOLDOWN;
  const grenadeCooldownRemainingMs = Math.max(0, (grenadeCooldownEndsAt ?? 0) - cooldownNowMs);
  const grenadeReady = !grenadeCooldownEndsAt || grenadeCooldownRemainingMs <= 0;
  const grenadeCooldownProgress = grenadeReady
    ? 1
    : 1 - grenadeCooldownRemainingMs / PLAYER_GRENADE_COOLDOWN;
  const landmineCooldownRemainingMs = Math.max(0, (landmineCooldownEndsAt ?? 0) - cooldownNowMs);
  const landmineReady = !landmineCooldownEndsAt || landmineCooldownRemainingMs <= 0;
  const landmineCooldownProgress = landmineReady
    ? 1
    : 1 - landmineCooldownRemainingMs / PLAYER_LANDMINE_COOLDOWN;
  const equippedWeaponDefinition = localPlayer
    ? weaponDefinitions[localPlayer.equippedWeapon]
    : null;
  const hpRatio = localPlayer ? localPlayer.hp / localPlayer.maxHp : 0;

  const weaponAbilityMeters = [
    {
      label: 'Dash',
      ready: dashReady,
      remainingMs: dashCooldownRemainingMs,
      progress: dashCooldownProgress,
      widthClassName: 'w-[200px]',
      valueReadyClassName: 'text-[#8df7ff]',
      valueCooldownClassName: 'text-[#d3fbff]',
      trackClassName:
        'bg-[rgba(14,24,34,0.92)] border-[rgba(114,224,255,0.28)] shadow-[inset_0_0_12px_rgba(117,226,255,0.1)]',
      fillReadyClassName: 'bg-[linear-gradient(90deg,#66d9ff_0%,#b8f5ff_100%)]',
      fillCooldownClassName: 'bg-[linear-gradient(90deg,#2f7db8_0%,#5ad7ff_100%)]',
      glowClassName: 'shadow-[0_0_12px_rgba(127,238,255,0.45)]',
    },
    {
      label: 'Grenade (Q)',
      ready: grenadeReady,
      remainingMs: grenadeCooldownRemainingMs,
      progress: grenadeCooldownProgress,
      widthClassName: 'w-[200px]',
      valueReadyClassName: 'text-[#c3ef8c]',
      valueCooldownClassName: 'text-[#ebffd0]',
      trackClassName:
        'bg-[rgba(18,31,14,0.92)] border-[rgba(177,232,108,0.28)] shadow-[inset_0_0_12px_rgba(132,209,81,0.1)]',
      fillReadyClassName: 'bg-[linear-gradient(90deg,#8acb4d_0%,#d9f7a1_100%)]',
      fillCooldownClassName: 'bg-[linear-gradient(90deg,#4e7b2a_0%,#91c654_100%)]',
      glowClassName: 'shadow-[0_0_12px_rgba(178,234,119,0.45)]',
    },
    {
      label: 'Landmine (W)',
      ready: landmineReady,
      remainingMs: landmineCooldownRemainingMs,
      progress: landmineCooldownProgress,
      widthClassName: 'w-[200px]',
      valueReadyClassName: 'text-[#f6e38e]',
      valueCooldownClassName: 'text-[#fff1bf]',
      trackClassName:
        'bg-[rgba(34,28,10,0.92)] border-[rgba(235,213,121,0.28)] shadow-[inset_0_0_12px_rgba(232,204,96,0.1)]',
      fillReadyClassName: 'bg-[linear-gradient(90deg,#d5c25b_0%,#fff2a6_100%)]',
      fillCooldownClassName: 'bg-[linear-gradient(90deg,#8f7b1f_0%,#d0b13a_100%)]',
      glowClassName: 'shadow-[0_0_12px_rgba(255,232,139,0.45)]',
    },
    {
      label: 'Fireball (E)',
      ready: fireballReady,
      remainingMs: fireballCooldownRemainingMs,
      progress: fireballCooldownProgress,
      widthClassName: 'w-[200px]',
      valueReadyClassName: 'text-[#ffbd84]',
      valueCooldownClassName: 'text-[#ffe3c8]',
      trackClassName:
        'bg-[rgba(38,20,10,0.92)] border-[rgba(255,170,100,0.28)] shadow-[inset_0_0_12px_rgba(255,149,72,0.1)]',
      fillReadyClassName: 'bg-[linear-gradient(90deg,#ff9838_0%,#ffd084_100%)]',
      fillCooldownClassName: 'bg-[linear-gradient(90deg,#c7561d_0%,#ff8e3c_100%)]',
      glowClassName: 'shadow-[0_0_12px_rgba(255,164,88,0.5)]',
    },
  ];

  const waveAbilityMeters = [
    {
      label: 'Wave (1)',
      ready: waveReady,
      remainingMs: waveCooldownRemainingMs,
      progress: waveCooldownProgress,
      widthClassName: 'w-[180px]',
      valueReadyClassName: 'text-[#ffb7ff]',
      valueCooldownClassName: 'text-[#ffd9ff]',
      trackClassName:
        'bg-[rgba(26,16,36,0.92)] border-[rgba(255,164,245,0.28)] shadow-[inset_0_0_12px_rgba(255,135,240,0.1)]',
      fillReadyClassName: 'bg-[linear-gradient(90deg,#f68cff_0%,#ffb7ff_100%)]',
      fillCooldownClassName: 'bg-[linear-gradient(90deg,#8b43d9_0%,#d668ff_100%)]',
      glowClassName: 'shadow-[0_0_12px_rgba(255,166,245,0.5)]',
    },
    {
      label: 'Numb (2)',
      ready: numbReady,
      remainingMs: numbCooldownRemainingMs,
      progress: numbCooldownProgress,
      widthClassName: 'w-[180px]',
      valueReadyClassName: 'text-[#d7dde4]',
      valueCooldownClassName: 'text-[#f2f5f8]',
      trackClassName:
        'bg-[rgba(19,22,27,0.92)] border-[rgba(178,186,196,0.28)] shadow-[inset_0_0_12px_rgba(150,160,173,0.1)]',
      fillReadyClassName: 'bg-[linear-gradient(90deg,#aab3bc_0%,#e1e6eb_100%)]',
      fillCooldownClassName: 'bg-[linear-gradient(90deg,#5f6974_0%,#98a2ad_100%)]',
      glowClassName: 'shadow-[0_0_12px_rgba(207,216,225,0.45)]',
    },
    {
      label: 'Pull (3)',
      ready: pullReady,
      remainingMs: pullCooldownRemainingMs,
      progress: pullCooldownProgress,
      widthClassName: 'w-[180px]',
      valueReadyClassName: 'text-[#ff9f9f]',
      valueCooldownClassName: 'text-[#ffd3d3]',
      trackClassName:
        'bg-[rgba(40,14,14,0.92)] border-[rgba(255,118,118,0.28)] shadow-[inset_0_0_12px_rgba(255,110,110,0.1)]',
      fillReadyClassName: 'bg-[linear-gradient(90deg,#ff5f5f_0%,#ff9f9f_100%)]',
      fillCooldownClassName: 'bg-[linear-gradient(90deg,#b82f2f_0%,#ff6767_100%)]',
      glowClassName: 'shadow-[0_0_12px_rgba(255,120,120,0.45)]',
    },
    {
      label: 'Venom (4)',
      ready: venomReady,
      remainingMs: venomCooldownRemainingMs,
      progress: venomCooldownProgress,
      widthClassName: 'w-[180px]',
      valueReadyClassName: 'text-[#9df6a4]',
      valueCooldownClassName: 'text-[#d4ffd8]',
      trackClassName:
        'bg-[rgba(12,32,15,0.92)] border-[rgba(112,234,122,0.28)] shadow-[inset_0_0_12px_rgba(90,210,100,0.1)]',
      fillReadyClassName: 'bg-[linear-gradient(90deg,#4fd26a_0%,#a3f7ae_100%)]',
      fillCooldownClassName: 'bg-[linear-gradient(90deg,#287a39_0%,#5fd375_100%)]',
      glowClassName: 'shadow-[0_0_12px_rgba(122,241,133,0.45)]',
    },
  ];

  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-white">
      <NicknameModal />

      <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
        <button
          onClick={toggleMusicMute}
          aria-label={musicMuted ? 'Ativar musica' : 'Mutar musica'}
          title={musicMuted ? 'Ativar musica' : 'Mutar musica'}
          className="pointer-events-auto inline-flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-[3px] border border-[#666] bg-[rgba(0,0,0,0.55)] text-white"
        >
          {musicMuted ? <VolumeX size={16} strokeWidth={2} /> : <Volume2 size={16} strokeWidth={2} />}
        </button>

        <div className="text-right text-[11px] opacity-70">
          {connected ? (
            `Online (${playerCount} players)`
          ) : connectionError ? (
            <div className="text-[#ff6666] opacity-100">
              <div>❌ {connectionError}</div>
              <button
                onClick={handleRetry}
                className="pointer-events-auto mt-1 cursor-pointer rounded-[3px] border border-[#666] bg-[#444] px-2 py-1 text-[10px] text-white"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <div>
              Connecting...
              {lastConnectionAttempt && (
                <div className="mt-0.5 text-[9px]">
                  Last attempt: {new Date(lastConnectionAttempt).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {localPlayer && (
        <div className="absolute top-4 left-4">
          {equippedWeaponDefinition && (
            <div className="mb-3 flex w-[200px] flex-col gap-2 rounded-lg border border-[rgba(255,255,255,0.14)] bg-[rgba(10,12,18,0.78)] px-3 py-2.5 shadow-[0_8px_24px_rgba(0,0,0,0.24)]">
              <div className="text-[10px] tracking-[0.08em] opacity-70">ARMA</div>
              <div className="flex items-center gap-2.5">
                <img
                  src={equippedWeaponDefinition.iconSrc}
                  alt={equippedWeaponDefinition.label}
                  draggable={false}
                  className="h-12 w-[68px] object-contain [filter:drop-shadow(0_0_10px_rgba(255,190,116,0.22))] [image-rendering:pixelated]"
                />
                <div>
                  <div className="text-[13px] font-bold">{equippedWeaponDefinition.label}</div>
                  <div className="text-[10px] opacity-60">Equipada</div>
                </div>
              </div>
            </div>
          )}

          <div className="mb-1 text-xs">HP</div>
          <div className="h-4 w-[200px] overflow-hidden rounded-[3px] bg-[#333]">
            <div
              className={classNames('h-full transition-[width] duration-100', {
                'bg-[#44ff44]': hpRatio > 0.5,
                'bg-[#ffaa00]': hpRatio <= 0.5 && hpRatio > 0.25,
                'bg-[#ff4444]': hpRatio <= 0.25,
              })}
              style={{ width: `${hpRatio * 100}%` }}
            />
          </div>
          <div className="mt-0.5 text-[11px] opacity-80">
            {localPlayer.hp} / {localPlayer.maxHp}
          </div>

          <div className="mt-2.5">
            {weaponAbilityMeters.map((ability) => (
              <CooldownMeter key={ability.label} {...ability} />
            ))}

            <div className="mt-3.5 mb-2.5 flex items-center gap-2">
              <div className="text-[10px] tracking-[0.18em] opacity-70">WAVES</div>
              <div className="h-px flex-1 bg-[linear-gradient(90deg,rgba(255,164,245,0.45)_0%,rgba(255,164,245,0)_100%)]" />
            </div>

            <div className="rounded-[10px] border border-[rgba(212,151,255,0.16)] bg-[rgba(24,16,34,0.72)] px-2.5 pt-2.5 pb-2 shadow-[inset_0_0_18px_rgba(162,100,255,0.08)]">
              {waveAbilityMeters.map((ability) => (
                <CooldownMeter key={ability.label} {...ability} />
              ))}
            </div>
          </div>
        </div>
      )}

      {localPlayer?.state === 'dead' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
          <div className="text-[32px] font-bold text-[#ff4444]">YOU DIED</div>
          <div className="mt-2 text-sm opacity-70">Respawning...</div>
        </div>
      )}

      <div className="absolute right-2 bottom-2 text-[10px] opacity-40">
        Arrow keys: move | Double tap arrows: dash | Q: grenade | W: landmine | E: fireball |
        1: wave | 2: numb | 3: pull | 4: venom | Space: attack | Tab: players
      </div>

      <Leaderboard />
    </div>
  );
}
