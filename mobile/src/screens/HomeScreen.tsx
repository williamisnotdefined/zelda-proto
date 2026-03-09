import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { TouchControls } from '../components/controls/TouchControls';
import { ChatPanel } from '../components/ui/ChatPanel';
import { FxOverlay } from '../components/ui/FxOverlay';
import { Hud } from '../components/ui/Hud';
import { LeaderboardPanel } from '../components/ui/LeaderboardPanel';
import { Minimap } from '../components/ui/Minimap';
import { runtimeConfig } from '../config/runtime';
import { GameViewport } from '../game/renderer/GameViewport';
import { mobileGameController } from '../runtime/MobileGameController';
import { useMobileGameStore } from '../store/gameStore';

function validateNickname(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 2) return 'Nickname must be at least 2 characters.';
  if (trimmed.length > 16) return 'Nickname must be 16 characters or less.';
  if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) return 'Use only letters, numbers, and spaces.';
  return null;
}

export function HomeScreen() {
  const connectionState = useMobileGameStore((state) => state.connectionState);
  const connectionError = useMobileGameStore((state) => state.connectionError);
  const playerCount = useMobileGameStore((state) => state.playerCount);
  const localPlayerId = useMobileGameStore((state) => state.localPlayerId);
  const storedNickname = useMobileGameStore((state) => state.nickname);
  const [nicknameInput, setNicknameInput] = useState(storedNickname || 'Hero');
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    mobileGameController.start();
    return () => mobileGameController.stop();
  }, []);

  const nicknameError = validateNickname(nicknameInput);

  const statusLabel = useMemo(() => {
    if (connectionError) return connectionError;
    if (connectionState === 'CONNECTED' && localPlayerId) return `Online (${playerCount} players)`;
    if (connectionState === 'CONNECTING') return 'Connecting...';
    if (connectionState === 'ERROR') return 'Connection failed.';
    return 'Enter your nickname to begin';
  }, [connectionError, connectionState, localPlayerId, playerCount]);

  const canConnect = !nicknameError && connectionState !== 'CONNECTING';
  const connected = connectionState === 'CONNECTED' && Boolean(localPlayerId);
  const boxNoneProps = Platform.OS === 'web' ? undefined : { pointerEvents: 'box-none' as const };

  return (
    <View style={styles.screen}>
      <View style={styles.gameLayer}>
        <GameViewport fullscreen />
        <Hud />
        <FxOverlay />

        <View style={styles.minimapOverlay} {...boxNoneProps}>
          <Minimap />
        </View>

        <View style={styles.bottomLeft} {...boxNoneProps}>
          <ChatPanel compact open={chatOpen} onToggle={() => setChatOpen((value) => !value)} />
        </View>

        <View style={styles.bottomRight} {...boxNoneProps}>
          <LeaderboardPanel
            open={leaderboardOpen}
            onToggle={() => setLeaderboardOpen((value) => !value)}
            compact
          />
        </View>

        <View style={styles.controlsOverlay} {...boxNoneProps}>
          <TouchControls />
        </View>
      </View>

      {!connected ? (
        <View style={styles.modalBackdrop} {...boxNoneProps}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Legends of Gelehk</Text>
            <Text style={styles.modalSubtitle}>Enter your nickname to begin</Text>

            <TextInput
              value={nicknameInput}
              onChangeText={setNicknameInput}
              placeholder="Nickname"
              placeholderTextColor="#8e96b5"
              autoCapitalize="none"
              style={styles.input}
            />

            <Text style={[styles.helperText, nicknameError ? styles.errorText : null]}>
              {nicknameError ?? statusLabel}
            </Text>

            <Text style={styles.metaLine}>Env: {runtimeConfig.environment}</Text>
            <Text style={styles.metaLine}>
              WS: {runtimeConfig.wsUrl || 'set EXPO_PUBLIC_WS_URL'}
            </Text>

            <Pressable
              disabled={!canConnect}
              onPress={() => mobileGameController.connectWithNickname(nicknameInput)}
              style={({ pressed }) => [
                styles.playButton,
                !canConnect ? styles.playButtonDisabled : null,
                pressed && canConnect ? styles.playButtonPressed : null,
              ]}
            >
              <Text style={styles.playButtonText}>Play</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000',
  },
  gameLayer: {
    flex: 1,
    position: 'relative',
  },
  bottomLeft: {
    position: 'absolute',
    left: 16,
    bottom: 182,
    width: 300,
    zIndex: 40,
  },
  bottomRight: {
    position: 'absolute',
    right: 16,
    bottom: 182,
    zIndex: 40,
  },
  minimapOverlay: {
    position: 'absolute',
    right: 18,
    bottom: 152,
    zIndex: 36,
  },
  controlsOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 20,
    zIndex: 35,
    paddingHorizontal: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    zIndex: 100,
  },
  modalCard: {
    width: 290,
    padding: 28,
    borderRadius: 12,
    backgroundColor: '#1a1a2e',
    borderWidth: 2,
    borderColor: '#4a4a6a',
    alignItems: 'center',
    gap: 14,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: '#aaa',
    fontSize: 14,
  },
  input: {
    width: '100%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 2,
    borderColor: '#4a4a6a',
    borderRadius: 6,
    backgroundColor: '#0d0d1a',
    color: '#fff',
  },
  helperText: {
    color: '#ddd',
    fontSize: 12,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff6666',
  },
  metaLine: {
    color: '#8d8d9d',
    fontSize: 11,
    textAlign: 'center',
  },
  playButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#44aa44',
  },
  playButtonDisabled: {
    opacity: 0.45,
  },
  playButtonPressed: {
    opacity: 0.92,
  },
  playButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
});
