import { useEffect, useRef } from 'react';
import { createGame } from './game/Game';
import { setPhaserGame } from './game/instance';
import { HUD } from './ui/HUD';

export function App() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!gameRef.current) {
      gameRef.current = createGame('game-container');
      setPhaserGame(gameRef.current);
    }

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <div id="game-container" style={{ width: '100%', height: '100%' }} />
      <HUD />
    </div>
  );
}
