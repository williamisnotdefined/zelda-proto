import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMobileGameStore } from '../../store/gameStore';

interface Props {
  open: boolean;
  onToggle: () => void;
  compact?: boolean;
}

export function LeaderboardPanel({ open, onToggle, compact = false }: Props) {
  const allPlayers = useMobileGameStore((state) => state.allPlayers);
  const localPlayerId = useMobileGameStore((state) => state.localPlayerId);

  const sorted = useMemo(
    () => [...allPlayers].sort((a, b) => b.playerKills - a.playerKills),
    [allPlayers]
  );
  const boxNoneProps = Platform.OS === 'web' ? undefined : { pointerEvents: 'box-none' as const };

  return (
    <View style={styles.container} {...boxNoneProps}>
      <Pressable onPress={onToggle} style={[styles.toggle, compact ? styles.toggleCompact : null]}>
        <Text style={styles.toggleText}>{open ? 'Hide players' : 'Players'}</Text>
      </Pressable>

      {open ? (
        <View style={styles.overlay}>
          <View style={styles.panel}>
            <Text style={styles.title}>PLAYERS</Text>

            <View style={styles.header}>
              <Text style={[styles.headerText, styles.headerName]}>Nickname</Text>
              <Text style={styles.headerText}>PK</Text>
              <Text style={styles.headerText}>MK</Text>
              <Text style={styles.headerText}>D</Text>
            </View>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {sorted.map((player) => {
                const isLocal = player.id === localPlayerId;
                return (
                  <View key={player.id} style={[styles.row, isLocal ? styles.rowLocal : null]}>
                    <Text
                      style={[styles.name, isLocal ? styles.nameLocal : null]}
                      numberOfLines={1}
                    >
                      {isLocal ? '▶ ' : ''}
                      {player.nickname}
                    </Text>
                    <Text style={[styles.score, styles.pk]}>{player.playerKills}</Text>
                    <Text style={[styles.score, styles.mk]}>{player.monsterKills}</Text>
                    <Text style={[styles.score, styles.dk]}>{player.deaths}</Text>
                  </View>
                );
              })}
            </ScrollView>

            <Text style={styles.hint}>Hold TAB to view on web</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    gap: 6,
  },
  toggle: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  toggleCompact: {
    minWidth: 74,
    alignItems: 'center',
  },
  toggleText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  overlay: {
    width: 320,
  },
  panel: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '800',
    color: '#aaddff',
    marginBottom: 10,
    letterSpacing: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  headerText: {
    width: 42,
    textAlign: 'center',
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
  },
  headerName: {
    flex: 1,
    width: undefined,
    textAlign: 'left',
  },
  list: {
    maxHeight: 220,
  },
  listContent: {
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 5,
  },
  rowLocal: {
    backgroundColor: 'rgba(255,230,80,0.07)',
  },
  name: {
    flex: 1,
    color: '#fff',
    fontSize: 12,
  },
  nameLocal: {
    color: '#ffee88',
  },
  score: {
    width: 42,
    textAlign: 'center',
    fontSize: 12,
  },
  pk: {
    color: '#ff9999',
  },
  mk: {
    color: '#88ff88',
  },
  dk: {
    color: '#aaaaaa',
  },
  hint: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 9,
    color: 'rgba(255,255,255,0.25)',
  },
});
