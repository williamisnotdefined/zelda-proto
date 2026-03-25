import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '../src/network/SessionManager';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SessionManager', () => {
  it('rejects unknown session tokens', () => {
    const sessions = new SessionManager();

    expect(sessions.tryResume('missing_token_123')).toEqual({
      ok: false,
      reason: 'invalid_session',
    });
  });

  it('rejects resumes while the original session is still connected', () => {
    const sessions = new SessionManager();
    const { token } = sessions.createSession('player-1', 'Link');

    expect(sessions.tryResume(token)).toEqual({
      ok: false,
      reason: 'session_in_use',
    });
  });

  it('expires disconnected sessions after the configured TTL', () => {
    vi.useFakeTimers();

    const onSessionExpired = vi.fn();
    const sessions = new SessionManager({
      resumeTtlMs: 1000,
      onSessionExpired,
    });
    const { token } = sessions.createSession('player-1', 'Link');

    sessions.markDisconnected('player-1');
    vi.advanceTimersByTime(1001);

    expect(sessions.tryResume(token)).toEqual({
      ok: false,
      reason: 'invalid_session',
    });
    expect(onSessionExpired).toHaveBeenCalledWith('player-1');
  });
});
