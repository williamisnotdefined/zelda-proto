const SESSION_TOKEN_STORAGE_KEY = 'gelehk.session-token';
const NICKNAME_STORAGE_KEY = 'gelehk.nickname';

export interface StoredConnectionContext {
  nickname: string | null;
  sessionToken: string | null;
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function getStoredValue(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function setStoredValue(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    return;
  }
}

function removeStoredValue(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    return;
  }
}

export function readStoredConnectionContext(): StoredConnectionContext {
  const storage = getSessionStorage();
  if (!storage) {
    return {
      nickname: null,
      sessionToken: null,
    };
  }

  return {
    nickname: getStoredValue(storage, NICKNAME_STORAGE_KEY),
    sessionToken: getStoredValue(storage, SESSION_TOKEN_STORAGE_KEY),
  };
}

export function persistNickname(nickname: string): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  setStoredValue(storage, NICKNAME_STORAGE_KEY, nickname);
}

export function clearStoredNickname(): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  removeStoredValue(storage, NICKNAME_STORAGE_KEY);
}

export function persistSessionToken(sessionToken: string): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  setStoredValue(storage, SESSION_TOKEN_STORAGE_KEY, sessionToken);
}

export function clearStoredSessionToken(): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  removeStoredValue(storage, SESSION_TOKEN_STORAGE_KEY);
}

export function clearStoredConnectionContext(): void {
  clearStoredNickname();
  clearStoredSessionToken();
}
