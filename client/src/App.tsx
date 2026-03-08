import { useEffect, useRef } from 'react';
import { createGame } from './game/Game';
import { setPhaserGame } from './game/instance';
import { HUD } from './ui/HUD';
import { TouchControls } from './ui/TouchControls';

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
