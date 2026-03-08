import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { mobileGameController } from '../../runtime/MobileGameController';
import { useMobileGameStore } from '../../store/gameStore';

export function Hud() {
  const predictedLocalPlayer = useMobileGameStore((state) => state.predictedLocalPlayer);
  const connectionState = useMobileGameStore((state) => state.connectionState);
  const playerCount = useMobileGameStore((state) => state.playerCount);
  const performance = useMobileGameStore((state) => state.performance);
  const [muted, setMuted] = useState(mobileGameController.getMuted());

  const hpRatio =
    predictedLocalPlayer && predictedLocalPlayer.maxHp > 0
      ? predictedLocalPlayer.hp / predictedLocalPlayer.maxHp
      : 0;

  return (
    <View style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.label}>Status</Text>
        <Text style={styles.value}>{connectionState}</Text>
        <Text style={styles.meta}>Players online: {playerCount}</Text>
        <Text style={styles.meta}>
          FPS: {performance.fps} / {performance.frameTimeMs.toFixed(0)}ms
        </Text>
      </View>

      <View style={styles.panelLarge}>
        <View style={styles.hpHeader}>
          <Text style={styles.label}>HP</Text>
          <Text style={styles.meta}>
            {predictedLocalPlayer
              ? `${predictedLocalPlayer.hp}/${predictedLocalPlayer.maxHp}`
              : '--'}
          </Text>
        </View>
        <View style={styles.hpTrack}>
          <View
            style={[
              styles.hpFill,
              {
                width: `${Math.max(0, Math.min(100, hpRatio * 100))}%`,
                backgroundColor: hpRatio > 0.5 ? '#51db75' : hpRatio > 0.25 ? '#f2b04b' : '#df6666',
              },
            ]}
          />
        </View>
        <Text style={styles.meta}>
          Draw: {performance.visibleTiles} tiles, {performance.visibleDecor} decor,{' '}
          {performance.visibleEntities} entities
        </Text>
      </View>

      <Pressable onPress={() => mobileGameController.disconnect()} style={styles.disconnectButton}>
        <Text style={styles.disconnectText}>Disconnect</Text>
      </Pressable>

      <Pressable
        onPress={() => {
          const nextMuted = !muted;
          setMuted(nextMuted);
          mobileGameController.setMuted(nextMuted);
        }}
        style={styles.muteButton}
      >
        <Text style={styles.disconnectText}>{muted ? 'Unmute' : 'Mute'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panel: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(8, 17, 13, 0.8)',
    borderWidth: 1,
    borderColor: '#294434',
  },
  panelLarge: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(8, 17, 13, 0.8)',
    borderWidth: 1,
    borderColor: '#294434',
    gap: 8,
  },
  label: {
    color: '#97b39d',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  value: {
    color: '#f3f8f2',
    fontWeight: '700',
  },
  meta: {
    color: '#bed0c0',
    fontSize: 12,
  },
  hpHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hpTrack: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#223329',
  },
  hpFill: {
    height: '100%',
    borderRadius: 999,
  },
  disconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#4c2a2a',
    borderWidth: 1,
    borderColor: '#7f4646',
  },
  muteButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#2a374c',
    borderWidth: 1,
    borderColor: '#536a8d',
  },
  disconnectText: {
    color: '#ffd8d8',
    fontWeight: '700',
    fontSize: 12,
  },
});
