import { create } from 'zustand';

export interface TouchMoveState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const EMPTY_MOVE: TouchMoveState = {
  up: false,
  down: false,
  left: false,
  right: false,
};

interface TouchInputStore {
  enabled: boolean;
  joystickActive: boolean;
  move: TouchMoveState;
  attackPressed: boolean;
  wavePressed: boolean;
  numbPressed: boolean;
  fireballPressed: boolean;
  grenadePressed: boolean;
  landminePressed: boolean;
  setEnabled: (enabled: boolean) => void;
  setJoystickActive: (active: boolean) => void;
  setMove: (move: TouchMoveState) => void;
  setAttackPressed: (attackPressed: boolean) => void;
  setWavePressed: (wavePressed: boolean) => void;
  setNumbPressed: (numbPressed: boolean) => void;
  setFireballPressed: (fireballPressed: boolean) => void;
  setGrenadePressed: (grenadePressed: boolean) => void;
  setLandminePressed: (landminePressed: boolean) => void;
  resetTouchInput: () => void;
}

export const useTouchInputStore = create<TouchInputStore>((set) => ({
  enabled: false,
  joystickActive: false,
  move: EMPTY_MOVE,
  attackPressed: false,
  wavePressed: false,
  numbPressed: false,
  fireballPressed: false,
  grenadePressed: false,
  landminePressed: false,
  setEnabled: (enabled) => set({ enabled }),
  setJoystickActive: (joystickActive) => set({ joystickActive }),
  setMove: (move) => set({ move }),
  setAttackPressed: (attackPressed) => set({ attackPressed }),
  setWavePressed: (wavePressed) => set({ wavePressed }),
  setNumbPressed: (numbPressed) => set({ numbPressed }),
  setFireballPressed: (fireballPressed) => set({ fireballPressed }),
  setGrenadePressed: (grenadePressed) => set({ grenadePressed }),
  setLandminePressed: (landminePressed) => set({ landminePressed }),
  resetTouchInput: () =>
    set({
      joystickActive: false,
      move: EMPTY_MOVE,
      attackPressed: false,
      wavePressed: false,
      numbPressed: false,
      fireballPressed: false,
      grenadePressed: false,
      landminePressed: false,
    }),
}));
