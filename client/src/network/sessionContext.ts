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

  return window.sessionStorage;
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
    nickname: storage.getItem(NICKNAME_STORAGE_KEY),
    sessionToken: storage.getItem(SESSION_TOKEN_STORAGE_KEY),
  };
}

export function persistNickname(nickname: string): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  storage.setItem(NICKNAME_STORAGE_KEY, nickname);
}

export function clearStoredNickname(): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(NICKNAME_STORAGE_KEY);
}

export function persistSessionToken(sessionToken: string): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  storage.setItem(SESSION_TOKEN_STORAGE_KEY, sessionToken);
}

export function clearStoredSessionToken(): void {
  const storage = getSessionStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(SESSION_TOKEN_STORAGE_KEY);
}

export function clearStoredConnectionContext(): void {
  clearStoredNickname();
  clearStoredSessionToken();
}
