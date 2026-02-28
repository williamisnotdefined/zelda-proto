export interface State {
  enter(): void;
  update(dt: number): void;
  exit(): void;
}

export class StateMachine {
  private currentState?: State;

  set(state: State): void {
    this.currentState?.exit();
    this.currentState = state;
    this.currentState.enter();
  }

  update(dt: number): void {
    this.currentState?.update(dt);
  }
}
