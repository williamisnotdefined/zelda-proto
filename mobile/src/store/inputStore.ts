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

interface MobileInputStore {
  move: TouchMoveState;
  attackPressed: boolean;
  setMove: (move: TouchMoveState) => void;
  setAttackPressed: (pressed: boolean) => void;
  reset: () => void;
}

export const useMobileInputStore = create<MobileInputStore>((set) => ({
  move: EMPTY_MOVE,
  attackPressed: false,
  setMove: (move) => set({ move }),
  setAttackPressed: (attackPressed) => set({ attackPressed }),
  reset: () => set({ move: EMPTY_MOVE, attackPressed: false }),
}));
