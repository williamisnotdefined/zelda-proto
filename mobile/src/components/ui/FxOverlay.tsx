import { Image, StyleSheet, Text, View } from 'react-native';
import toastyImage from '../../../../client/public/assets/sprites/eastereggs/toasty.png';
import { useMobileGameStore } from '../../store/gameStore';

export function FxOverlay() {
  const toastyFx = useMobileGameStore((state) => state.toastyFx);

  if (!toastyFx) {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <View style={styles.banner}>
        <Image source={toastyImage} style={styles.image} resizeMode="contain" />
        <Text style={styles.text}>{toastyFx.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 160, 44, 0.92)',
    borderWidth: 1,
    borderColor: '#ffe0a8',
  },
  text: {
    color: '#321b00',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  image: {
    width: 42,
    height: 42,
  },
});
