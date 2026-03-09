import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMobileInputStore } from '../../store/inputStore';

const JOYSTICK_RADIUS = 42;
const JOYSTICK_DEADZONE = 0.15;

function clampVector(x: number, y: number) {
  const distance = Math.hypot(x, y);
  if (distance <= JOYSTICK_RADIUS || distance === 0) {
    return { x, y };
  }

  const scale = JOYSTICK_RADIUS / distance;
  return {
    x: x * scale,
    y: y * scale,
  };
}

export function TouchControls() {
  const setMove = useMobileInputStore((state) => state.setMove);
  const setAttackPressed = useMobileInputStore((state) => state.setAttackPressed);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const centerRef = useRef({ x: JOYSTICK_RADIUS, y: JOYSTICK_RADIUS });

  const updateMove = (rawX: number, rawY: number) => {
    const next = clampVector(rawX, rawY);
    setKnob(next);

    const normalizedX = next.x / JOYSTICK_RADIUS;
    const normalizedY = next.y / JOYSTICK_RADIUS;
    const magnitude = Math.hypot(normalizedX, normalizedY);

    if (magnitude < JOYSTICK_DEADZONE) {
      setMove({ up: false, down: false, left: false, right: false });
      return;
    }

    setMove({
      up: normalizedY < -JOYSTICK_DEADZONE,
      down: normalizedY > JOYSTICK_DEADZONE,
      left: normalizedX < -JOYSTICK_DEADZONE,
      right: normalizedX > JOYSTICK_DEADZONE,
    });
  };

  const resetMove = () => {
    setKnob({ x: 0, y: 0 });
    setMove({ up: false, down: false, left: false, right: false });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          centerRef.current = { x: JOYSTICK_RADIUS, y: JOYSTICK_RADIUS };
          updateMove(locationX - centerRef.current.x, locationY - centerRef.current.y);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          updateMove(locationX - centerRef.current.x, locationY - centerRef.current.y);
        },
        onPanResponderRelease: resetMove,
        onPanResponderTerminate: resetMove,
      }),
    [setMove]
  );
  const attackButtonPlatformStyle =
    Platform.OS === 'web' ? styles.attackButtonWebShadow : styles.attackButtonNativeShadow;

  return (
    <View style={styles.container}>
      <View style={styles.joystickBase} {...panResponder.panHandlers}>
        <View
          style={[
            styles.joystickKnob,
            {
              transform: [{ translateX: knob.x }, { translateY: knob.y }],
            },
          ]}
        />
      </View>

      <Pressable
        onPressIn={() => setAttackPressed(true)}
        onPressOut={() => setAttackPressed(false)}
        style={({ pressed }) => [
          styles.attackButton,
          attackButtonPlatformStyle,
          pressed ? styles.attackButtonPressed : null,
        ]}
      >
        <Text style={styles.attackLabel}>ATK</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
    gap: 16,
  },
  joystickBase: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 2,
    borderColor: 'rgba(232, 245, 236, 0.24)',
    backgroundColor: 'rgba(12, 27, 20, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  joystickKnob: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(234, 243, 229, 0.3)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
  attackButton: {
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: '#bb7b21',
    borderWidth: 2,
    borderColor: '#f8d48c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attackButtonNativeShadow: {
    elevation: 6,
  },
  attackButtonWebShadow: {
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.24)',
  },
  attackButtonPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.92,
  },
  attackLabel: {
    color: '#fff5df',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
