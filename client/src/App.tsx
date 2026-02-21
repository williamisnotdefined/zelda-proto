import { useEffect, useRef } from 'react';
import { createGame } from './game/Game';
import { HUD } from './ui/HUD';

export function App() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!gameRef.current) {
      gameRef.current = createGame('game-container');
    }

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: 800, height: 600 }}>
      <div id="game-container" style={{ width: 800, height: 600 }} />
      <HUD />
    </div>
  );
}
