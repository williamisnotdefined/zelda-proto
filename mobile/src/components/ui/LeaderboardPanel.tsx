import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMobileGameStore } from '../../store/gameStore';

interface Props {
  open: boolean;
  onToggle: () => void;
}

export function LeaderboardPanel({ open, onToggle }: Props) {
  const allPlayers = useMobileGameStore((state) => state.allPlayers);
  const localPlayerId = useMobileGameStore((state) => state.localPlayerId);

  const sorted = useMemo(
    () => [...allPlayers].sort((a, b) => b.playerKills - a.playerKills),
    [allPlayers]
  );

  return (
    <View style={styles.container}>
      <Pressable onPress={onToggle} style={styles.toggle}>
        <Text style={styles.toggleText}>{open ? 'Hide leaderboard' : 'Show leaderboard'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <Text style={styles.title}>Players</Text>
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {sorted.map((player) => {
              const isLocal = player.id === localPlayerId;
              return (
                <View key={player.id} style={[styles.row, isLocal ? styles.rowLocal : null]}>
                  <Text style={[styles.name, isLocal ? styles.nameLocal : null]} numberOfLines={1}>
                    {isLocal ? '▶ ' : ''}
                    {player.nickname}
                  </Text>
                  <Text style={styles.score}>{player.playerKills}</Text>
                  <Text style={styles.score}>{player.monsterKills}</Text>
                  <Text style={styles.score}>{player.deaths}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  toggle: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#13241c',
    borderWidth: 1,
    borderColor: '#2b4637',
  },
  toggleText: {
    color: '#dbe7d7',
    fontSize: 12,
    fontWeight: '700',
  },
  panel: {
    maxHeight: 180,
    borderRadius: 16,
    backgroundColor: '#10221a',
    borderWidth: 1,
    borderColor: '#294434',
    padding: 12,
    gap: 8,
  },
  title: {
    color: '#f3f8f2',
    fontWeight: '700',
    fontSize: 16,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  rowLocal: {
    backgroundColor: 'rgba(244, 214, 101, 0.08)',
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  name: {
    flex: 1,
    color: '#d6e2d4',
    fontSize: 12,
  },
  nameLocal: {
    color: '#ffe688',
  },
  score: {
    width: 36,
    textAlign: 'right',
    color: '#d6e2d4',
    fontSize: 12,
  },
});
