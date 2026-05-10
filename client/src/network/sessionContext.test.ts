import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredConnectionContext,
  persistNickname,
  persistSessionToken,
  readStoredConnectionContext,
} from './sessionContext';

function stubThrowingSessionStorage(): void {
  const windowStub = {};
  Object.defineProperty(windowStub, 'sessionStorage', {
    get() {
      throw new Error('storage blocked');
    },
  });
  vi.stubGlobal('window', windowStub);
}

describe('sessionContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('falls back to an empty context when sessionStorage is unavailable', () => {
    stubThrowingSessionStorage();

    expect(readStoredConnectionContext()).toEqual({
      nickname: null,
      sessionToken: null,
    });
  });

  it('ignores writes and clears when sessionStorage is unavailable', () => {
    stubThrowingSessionStorage();

    expect(() => persistNickname('Link')).not.toThrow();
    expect(() => persistSessionToken('session_token_123')).not.toThrow();
    expect(() => clearStoredConnectionContext()).not.toThrow();
  });
});
