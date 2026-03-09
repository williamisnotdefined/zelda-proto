import { registerSW } from 'virtual:pwa-register';
import { logError } from '../monitoring/errorLogger';

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
      logError({
        category: 'pwa',
        type: 'pwa.update-available',
        level: 'warn',
        message: 'A new PWA version is available',
        handled: true,
      });
      applyUpdate = async () => {
        await updateSW(true);
      };
      notifyListeners();
    },
    onOfflineReady() {
      console.info('PWA offline cache pronto.');
      logError({
        category: 'pwa',
        type: 'pwa.offline-ready',
        level: 'warn',
        message: 'PWA offline cache is ready',
        handled: true,
      });
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
