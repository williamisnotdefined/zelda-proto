import { registerSW } from 'virtual:pwa-register';

type Listener = (updateAvailable: boolean) => void;

let updateAvailable = false;
let applyUpdate: (() => Promise<void>) | null = null;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(updateAvailable);
  }
}

export function initPwaUpdatePrompt(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      updateAvailable = true;
      applyUpdate = async () => {
        await updateSW(true);
      };
      notifyListeners();
    },
    onOfflineReady() {
      console.info('PWA offline cache pronto.');
    },
  });
}

export function subscribePwaUpdatePrompt(listener: Listener): () => void {
  listeners.add(listener);
  listener(updateAvailable);
  return () => {
    listeners.delete(listener);
  };
}

export async function confirmPwaUpdate(): Promise<void> {
  if (!applyUpdate) return;
  await applyUpdate();
}

export function dismissPwaUpdatePrompt(): void {
  updateAvailable = false;
  notifyListeners();
}
