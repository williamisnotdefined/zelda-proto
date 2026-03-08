import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const currentInstanceId = useMobileGameStore((state) => state.currentInstanceId);
  const storedNickname = useMobileGameStore((state) => state.nickname);
  const [nicknameInput, setNicknameInput] = useState(storedNickname || 'Hero');
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);

  useEffect(() => {
    mobileGameController.start();
    return () => mobileGameController.stop();
  }, []);

  const nicknameError = validateNickname(nicknameInput);

  const statusLabel = useMemo(() => {
    if (connectionError) {
      return connectionError;
    }

    switch (connectionState) {
      case 'CONNECTED':
        return localPlayerId
          ? `Connected with ${playerCount} players in ${currentInstanceId ?? 'world'}.`
          : 'Connected. Waiting for welcome...';
      case 'CONNECTING':
        return 'Connecting to the game server...';
      case 'ERROR':
        return 'Connection failed.';
      default:
        return 'Ready to start the mobile session.';
    }
  }, [connectionError, connectionState, currentInstanceId, localPlayerId, playerCount]);

  const canConnect = !nicknameError && connectionState !== 'CONNECTING';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Text style={styles.kicker}>Expo + Skia runtime</Text>
        <Text style={styles.title}>Legends of Gelehk mobile</Text>
        <Text style={styles.copy}>
          Cliente nativo com rede, input touch, snapshots e renderizacao 2D no mesmo protocolo do
          web.
        </Text>
      </View>

      <Hud />
      <FxOverlay />

      <View style={styles.card}>
        <Text style={styles.label}>Nickname</Text>
        <TextInput
          value={nicknameInput}
          onChangeText={setNicknameInput}
          placeholder="Your name"
          placeholderTextColor="#7f9485"
          autoCapitalize="none"
          style={styles.input}
        />
        <Text style={[styles.helperText, nicknameError ? styles.errorText : null]}>
          {nicknameError ?? statusLabel}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>Env: {runtimeConfig.environment}</Text>
          <Text style={styles.metaText}>WS: {runtimeConfig.wsUrl || 'set EXPO_PUBLIC_WS_URL'}</Text>
          <Text style={styles.metaText}>Instance: {currentInstanceId ?? '-'}</Text>
        </View>

        <Pressable
          disabled={!canConnect}
          onPress={() => mobileGameController.connectWithNickname(nicknameInput)}
          style={({ pressed }) => [
            styles.primaryButton,
            !canConnect ? styles.primaryButtonDisabled : null,
            pressed && canConnect ? styles.primaryButtonPressed : null,
          ]}
        >
          <Text style={styles.primaryButtonText}>Connect to server</Text>
        </Pressable>
      </View>

      <GameViewport />

      <Minimap />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Touch controls</Text>
        <Text style={styles.copySmall}>
          Joystick and attack already feed the same input message format used by the server.
        </Text>
        <TouchControls />
      </View>

      <LeaderboardPanel
        open={leaderboardOpen}
        onToggle={() => setLeaderboardOpen((value) => !value)}
      />
      <ChatPanel />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#08110d',
  },
  content: {
    padding: 18,
    gap: 14,
  },
  heroCard: {
    gap: 8,
  },
  kicker: {
    color: '#97b39d',
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#f4f8f2',
    fontSize: 28,
    fontWeight: '800',
  },
  copy: {
    color: '#bed0c0',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#10221a',
    borderWidth: 1,
    borderColor: '#294434',
    gap: 10,
  },
  cardTitle: {
    color: '#f4f8f2',
    fontSize: 18,
    fontWeight: '700',
  },
  copySmall: {
    color: '#bed0c0',
    fontSize: 13,
    lineHeight: 18,
  },
  label: {
    color: '#dbe8da',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderRadius: 12,
    backgroundColor: '#0b1712',
    borderWidth: 1,
    borderColor: '#2e4a38',
    color: '#f4f8f2',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  helperText: {
    color: '#d6e2d4',
    fontSize: 12,
    lineHeight: 17,
  },
  errorText: {
    color: '#f07d7d',
  },
  metaRow: {
    gap: 4,
  },
  metaText: {
    color: '#95a89a',
    fontSize: 12,
  },
  primaryButton: {
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
    backgroundColor: '#d8b44d',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: '#2d2406',
    fontSize: 14,
    fontWeight: '800',
  },
});
