import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { setPhaserGame } from './game/instance';
import { logError } from './monitoring/errorLogger';
import { gameConnection } from './network/gameConnection';
import { HUD } from './ui/HUD';

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
      gameConnection.dispose();
      gameRef.current?.destroy(true);
      setPhaserGame(null);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
      }}
    >
      <div id="game-container" style={{ width: '100%', height: '100%' }} />
      <HUD />
    </div>
  );
}
