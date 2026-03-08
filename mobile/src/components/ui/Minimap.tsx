import { PORTAL_KINDS } from '@gelehka/shared';
import { StyleSheet, View } from 'react-native';
import { useMobileGameStore } from '../../store/gameStore';

const SIZE = 112;
const RADIUS = SIZE / 2;
const WORLD_RANGE = 1200;

export function Minimap() {
  const predictedLocalPlayer = useMobileGameStore((state) => state.predictedLocalPlayer);
  const renderPlayers = useMobileGameStore((state) => state.renderPlayers);
  const enemies = useMobileGameStore((state) => state.enemies);
  const bosses = useMobileGameStore((state) => state.bosses);
  const portals = useMobileGameStore((state) => state.portals);

  if (!predictedLocalPlayer) {
    return null;
  }

  const project = (x: number, y: number) => ({
    left: Math.max(
      0,
      Math.min(SIZE - 6, RADIUS + ((x - predictedLocalPlayer.x) / WORLD_RANGE) * RADIUS)
    ),
    top: Math.max(
      0,
      Math.min(SIZE - 6, RADIUS + ((y - predictedLocalPlayer.y) / WORLD_RANGE) * RADIUS)
    ),
  });

  return (
    <View style={styles.shell}>
      <View style={styles.circle}>
        {enemies
          .filter((e) => e.state !== 'dead')
          .map((enemy) => {
            const pos = project(enemy.renderX, enemy.renderY);
            return <View key={enemy.id} style={[styles.dot, styles.enemyDot, pos]} />;
          })}
        {bosses
          .filter((b) => b.state !== 'dead')
          .map((boss) => {
            const pos = project(boss.renderX, boss.renderY);
            return <View key={boss.id} style={[styles.dot, styles.bossDot, pos]} />;
          })}
        {renderPlayers
          .filter((p) => !p.isLocal && p.state !== 'dead')
          .map((player) => {
            const pos = project(player.renderX, player.renderY);
            return <View key={player.id} style={[styles.dot, styles.playerDot, pos]} />;
          })}
        {portals.map((portal) => {
          const pos = project(portal.renderX, portal.renderY);
          const advance =
            portal.kind === PORTAL_KINDS.PHASE1_TO_PHASE2 ||
            portal.kind === PORTAL_KINDS.PHASE2_TO_PHASE3;
          return (
            <View
              key={portal.id}
              style={[styles.dot, advance ? styles.portalAdvance : styles.portalReturn, pos]}
            />
          );
        })}
        <View style={[styles.dot, styles.localDot, { left: RADIUS - 3, top: RADIUS - 3 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'flex-end',
  },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: RADIUS,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(136,255,136,0.5)',
    overflow: 'hidden',
  },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  localDot: { backgroundColor: '#ffffff' },
  enemyDot: { backgroundColor: '#ff5959' },
  bossDot: { backgroundColor: '#b577ff', width: 8, height: 8, borderRadius: 4 },
  playerDot: { backgroundColor: '#4fff88' },
  portalAdvance: { backgroundColor: '#c98a3a' },
  portalReturn: { backgroundColor: '#4aa3ff' },
});
