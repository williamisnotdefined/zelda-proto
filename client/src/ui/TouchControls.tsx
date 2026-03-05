import { useEffect, useRef, useState } from 'react';
import { useTouchInputStore } from '../game/input/touchInputStore';

const JOYSTICK_RADIUS_PX = 46;
const JOYSTICK_DEADZONE = 0.15;
const CONTROLS_BOTTOM_OFFSET = 'calc(env(safe-area-inset-bottom, 0px) + 72px)';

interface KnobPosition {
  x: number;
  y: number;
}

const KNOB_CENTER: KnobPosition = { x: 0, y: 0 };

function detectTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const hasTouchPoints = navigator.maxTouchPoints > 0;
  const hasTouchApi = 'ontouchstart' in window;
  const hasCoarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const hasNoHover = window.matchMedia('(hover: none)').matches;

  return hasTouchPoints || hasTouchApi || hasCoarsePointer || hasNoHover;
}

export function TouchControls() {
  const enabled = useTouchInputStore((state) => state.enabled);
  const setEnabled = useTouchInputStore((state) => state.setEnabled);
  const setJoystickActive = useTouchInputStore((state) => state.setJoystickActive);
  const setMove = useTouchInputStore((state) => state.setMove);
  const setAttackPressed = useTouchInputStore((state) => state.setAttackPressed);
  const resetTouchInput = useTouchInputStore((state) => state.resetTouchInput);

  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerId = useRef<number | null>(null);
  const attackPointerId = useRef<number | null>(null);
  const [knobPosition, setKnobPosition] = useState<KnobPosition>(KNOB_CENTER);

  useEffect(() => {
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    const hoverQuery = window.matchMedia('(hover: none)');

    const applyCapability = () => {
      setEnabled(detectTouchDevice());
    };

    applyCapability();
    coarseQuery.addEventListener('change', applyCapability);
    hoverQuery.addEventListener('change', applyCapability);

    return () => {
      coarseQuery.removeEventListener('change', applyCapability);
      hoverQuery.removeEventListener('change', applyCapability);
      resetTouchInput();
      setKnobPosition(KNOB_CENTER);
    };
  }, [resetTouchInput, setEnabled]);

  const updateJoystick = (clientX: number, clientY: number) => {
    const element = joystickRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const rawX = clientX - centerX;
    const rawY = clientY - centerY;
    const distance = Math.hypot(rawX, rawY);

    let clampedX = rawX;
    let clampedY = rawY;
    if (distance > JOYSTICK_RADIUS_PX && distance > 0) {
      const scale = JOYSTICK_RADIUS_PX / distance;
      clampedX *= scale;
      clampedY *= scale;
    }

    setKnobPosition({ x: clampedX, y: clampedY });

    const normalizedX = clampedX / JOYSTICK_RADIUS_PX;
    const normalizedY = clampedY / JOYSTICK_RADIUS_PX;
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

  const releaseJoystick = (target?: EventTarget | null) => {
    if (target instanceof Element && joystickPointerId.current !== null) {
      target.releasePointerCapture(joystickPointerId.current);
    }
    joystickPointerId.current = null;
    setJoystickActive(false);
    setMove({ up: false, down: false, left: false, right: false });
    setKnobPosition(KNOB_CENTER);
  };

  const handleJoystickPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    joystickPointerId.current = event.pointerId;
    setJoystickActive(true);
    updateJoystick(event.clientX, event.clientY);
  };

  const handleJoystickPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== joystickPointerId.current) return;
    event.preventDefault();
    updateJoystick(event.clientX, event.clientY);
  };

  const handleJoystickPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== joystickPointerId.current) return;
    event.preventDefault();
    releaseJoystick(event.currentTarget);
  };

  const handleJoystickPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== joystickPointerId.current) return;
    releaseJoystick(event.currentTarget);
  };

  const releaseAttack = (target?: EventTarget | null) => {
    if (target instanceof Element && attackPointerId.current !== null) {
      target.releasePointerCapture(attackPointerId.current);
    }
    attackPointerId.current = null;
    setAttackPressed(false);
  };

  const handleAttackPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (attackPointerId.current !== null) return;
    event.preventDefault();
    attackPointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setAttackPressed(true);
  };

  const handleAttackPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== attackPointerId.current) return;
    event.preventDefault();
    releaseAttack(event.currentTarget);
  };

  const handleAttackPointerCancel = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== attackPointerId.current) return;
    releaseAttack(event.currentTarget);
  };

  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 30,
      }}
    >
      <div
        ref={joystickRef}
        onPointerDown={handleJoystickPointerDown}
        onPointerMove={handleJoystickPointerMove}
        onPointerUp={handleJoystickPointerUp}
        onPointerCancel={handleJoystickPointerCancel}
        onLostPointerCapture={() => releaseJoystick()}
        onContextMenu={(event) => event.preventDefault()}
        style={{
          position: 'absolute',
          left: 22,
          bottom: CONTROLS_BOTTOM_OFFSET,
          width: 132,
          height: 132,
          borderRadius: '50%',
          border: '2px solid rgba(255, 255, 255, 0.28)',
          background: 'rgba(20, 20, 20, 0.35)',
          boxShadow: 'inset 0 0 22px rgba(255, 255, 255, 0.08)',
          pointerEvents: 'auto',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 56,
            height: 56,
            marginLeft: -28,
            marginTop: -28,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.24)',
            border: '2px solid rgba(255, 255, 255, 0.5)',
            transform: `translate(${knobPosition.x}px, ${knobPosition.y}px)`,
            pointerEvents: 'none',
          }}
        />
      </div>

      <button
        type="button"
        onPointerDown={handleAttackPointerDown}
        onPointerUp={handleAttackPointerUp}
        onPointerCancel={handleAttackPointerCancel}
        onLostPointerCapture={() => releaseAttack()}
        onContextMenu={(event) => event.preventDefault()}
        style={{
          position: 'absolute',
          right: 28,
          bottom: CONTROLS_BOTTOM_OFFSET,
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: '2px solid rgba(255, 210, 120, 0.8)',
          background: 'rgba(216, 112, 18, 0.34)',
          color: '#fff6de',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 0.4,
          fontFamily: 'monospace',
          pointerEvents: 'auto',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        Attack
      </button>
    </div>
  );
}
