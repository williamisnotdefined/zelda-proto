import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { mobileGameController } from '../../runtime/MobileGameController';
import { useMobileGameStore } from '../../store/gameStore';

export function Hud() {
  const predictedLocalPlayer = useMobileGameStore((state) => state.predictedLocalPlayer);
  const connectionState = useMobileGameStore((state) => state.connectionState);
  const playerCount = useMobileGameStore((state) => state.playerCount);
  const connectionError = useMobileGameStore((state) => state.connectionError);
  const lastConnectionAttempt = useMobileGameStore((state) => state.lastConnectionAttempt);
  const [muted, setMuted] = useState(mobileGameController.getMuted());

  const hpRatio =
    predictedLocalPlayer && predictedLocalPlayer.maxHp > 0
      ? predictedLocalPlayer.hp / predictedLocalPlayer.maxHp
      : 0;
  const boxNoneProps = Platform.OS === 'web' ? undefined : { pointerEvents: 'box-none' as const };
  const noneProps = Platform.OS === 'web' ? undefined : { pointerEvents: 'none' as const };

  return (
    <View style={styles.root} {...boxNoneProps}>
      <View style={styles.topLeft} {...boxNoneProps}>
        {predictedLocalPlayer ? (
          <View style={styles.hpWrap}>
            <Text style={styles.hpLabel}>HP</Text>
            <View style={styles.hpTrack}>
              <View
                style={[
                  styles.hpFill,
                  {
                    width: `${Math.max(0, Math.min(100, hpRatio * 100))}%`,
                    backgroundColor:
                      hpRatio > 0.5 ? '#44ff44' : hpRatio > 0.25 ? '#ffaa00' : '#ff4444',
                  },
                ]}
              />
            </View>
            <Text style={styles.hpMeta}>
              {predictedLocalPlayer.hp} / {predictedLocalPlayer.maxHp}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.topRight} {...boxNoneProps}>
        <View style={styles.buttonColumn}>
          <Pressable
            onPress={() => {
              const nextMuted = !muted;
              setMuted(nextMuted);
              mobileGameController.setMuted(nextMuted);
            }}
            style={styles.iconButton}
          >
            <Text style={styles.iconText}>{muted ? 'SFX OFF' : 'SFX ON'}</Text>
          </Pressable>
          <Pressable onPress={() => mobileGameController.disconnect()} style={styles.iconButton}>
            <Text style={styles.iconText}>QUIT</Text>
          </Pressable>
        </View>

        <View style={styles.statusBlock}>
          {connectionState === 'CONNECTED' ? (
            <Text style={styles.statusText}>Online ({playerCount} players)</Text>
          ) : connectionError ? (
            <Text style={[styles.statusText, styles.statusError]}>X {connectionError}</Text>
          ) : (
            <View>
              <Text style={styles.statusText}>Connecting...</Text>
              {lastConnectionAttempt ? (
                <Text style={styles.statusHint}>
                  Last attempt: {new Date(lastConnectionAttempt).toLocaleTimeString()}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </View>

      {predictedLocalPlayer?.state === 'dead' ? (
        <View style={styles.deathOverlay} {...noneProps}>
          <Text style={styles.deathTitle}>YOU DIED</Text>
          <Text style={styles.deathSubtitle}>Respawning...</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  topLeft: {
    position: 'absolute',
    top: 16,
    left: 16,
  },
  topRight: {
    position: 'absolute',
    top: 8,
    right: 8,
    alignItems: 'flex-end',
    gap: 6,
  },
  buttonColumn: {
    alignItems: 'flex-end',
    gap: 6,
  },
  iconButton: {
    minWidth: 62,
    height: 30,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: '#666',
  },
  iconText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  statusBlock: {
    maxWidth: 180,
    alignItems: 'flex-end',
  },
  statusText: {
    color: '#ffffff',
    fontSize: 11,
    opacity: 0.75,
    textAlign: 'right',
  },
  statusError: {
    color: '#ff6666',
    opacity: 1,
  },
  statusHint: {
    color: '#ffffff',
    fontSize: 9,
    opacity: 0.45,
    marginTop: 2,
    textAlign: 'right',
  },
  hpWrap: {
    width: 200,
  },
  hpLabel: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 4,
  },
  hpTrack: {
    width: '100%',
    height: 16,
    backgroundColor: '#333',
    borderRadius: 3,
    overflow: 'hidden',
  },
  hpFill: {
    height: '100%',
  },
  hpMeta: {
    color: '#fff',
    fontSize: 11,
    opacity: 0.8,
    marginTop: 2,
  },
  deathOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  deathTitle: {
    color: '#ff4444',
    fontSize: 32,
    fontWeight: '800',
  },
  deathSubtitle: {
    color: '#ffffff',
    fontSize: 14,
    opacity: 0.7,
    marginTop: 8,
  },
});
