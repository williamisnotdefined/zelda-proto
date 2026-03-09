import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { setPhaserGame } from './game/instance';
import { logError } from './monitoring/errorLogger';
import { disconnect } from './network/socket';
import { HUD } from './ui/HUD';
import { TouchControls } from './ui/TouchControls';

export function App() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (gameRef.current) {
        return;
      }

      try {
        const { createGame } = await import('./game/Game');
        if (cancelled || gameRef.current) {
          return;
        }

        gameRef.current = createGame('game-container');
        setPhaserGame(gameRef.current);
      } catch (error) {
        logError({
          category: 'game',
          type: 'app.game-bootstrap-failed',
          message: 'Failed to bootstrap Phaser game',
          error,
          context: {
            cancelled,
          },
        });
        throw error;
      }
    })();

    return () => {
      cancelled = true;
      disconnect();
      gameRef.current?.destroy(true);
      setPhaserGame(null);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;

    const updateViewportHeight = () => {
      const visualHeight = window.visualViewport?.height;
      const height = visualHeight ?? window.innerHeight;
      root.style.setProperty('--app-height', `${Math.round(height)}px`);
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    window.addEventListener('orientationchange', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      root.style.removeProperty('--app-height');
    };
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: 'var(--app-height, 100dvh)',
        minHeight: '100svh',
        touchAction: 'none',
      }}
    >
      <div id="game-container" style={{ width: '100%', height: '100%' }} />
      <HUD />
      <TouchControls />
    </div>
  );
}
