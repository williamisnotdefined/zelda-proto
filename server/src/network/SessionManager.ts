import { nanoid } from 'nanoid';

export const DEFAULT_SESSION_RESUME_TTL_MS = 20_000;

export type ResumeSessionFailureReason = 'invalid_session' | 'session_in_use';

interface SessionRecord {
  token: string;
  playerId: string;
  nickname: string;
  connected: boolean;
  disconnectedAt: number | null;
  expiryTimer: ReturnType<typeof setTimeout> | null;
}

type ResumeSessionResult =
  | { ok: true; session: Pick<SessionRecord, 'token' | 'playerId' | 'nickname'> }
  | { ok: false; reason: ResumeSessionFailureReason };

export class SessionManager {
  private readonly sessionsByToken = new Map<string, SessionRecord>();
  private readonly sessionTokenByPlayerId = new Map<string, string>();

  constructor(
    private readonly options: {
      resumeTtlMs?: number;
      onSessionExpired?: (playerId: string) => void;
    } = {}
  ) {}

  createSession(playerId: string, nickname: string): { token: string } {
    const existingToken = this.sessionTokenByPlayerId.get(playerId);
    if (existingToken) {
      const existing = this.sessionsByToken.get(existingToken);
      if (existing) {
        existing.nickname = nickname;
        this.markConnected(playerId);
        return { token: existing.token };
      }
    }

    const token = nanoid(24);
    this.sessionsByToken.set(token, {
      token,
      playerId,
      nickname,
      connected: true,
      disconnectedAt: null,
      expiryTimer: null,
    });
    this.sessionTokenByPlayerId.set(playerId, token);
    return { token };
  }

  getSessionToken(playerId: string): string | null {
    return this.sessionTokenByPlayerId.get(playerId) ?? null;
  }

  markConnected(playerId: string): { token: string } | null {
    const session = this.getSessionByPlayerId(playerId);
    if (!session) {
      return null;
    }

    this.clearExpiryTimer(session);
    session.connected = true;
    session.disconnectedAt = null;
    return { token: session.token };
  }

  markDisconnected(playerId: string): { token: string } | null {
    const session = this.getSessionByPlayerId(playerId);
    if (!session) {
      return null;
    }

    this.clearExpiryTimer(session);
    session.connected = false;
    session.disconnectedAt = Date.now();
    session.expiryTimer = setTimeout(() => {
      const current = this.getSessionByPlayerId(playerId);
      if (!current || current.connected) {
        return;
      }

      this.deleteSession(current);
      this.options.onSessionExpired?.(playerId);
    }, this.getResumeTtlMs());
    return { token: session.token };
  }

  tryResume(sessionToken: string): ResumeSessionResult {
    const session = this.sessionsByToken.get(sessionToken);
    if (!session) {
      return { ok: false, reason: 'invalid_session' };
    }

    if (this.isExpired(session)) {
      this.deleteSession(session);
      this.options.onSessionExpired?.(session.playerId);
      return { ok: false, reason: 'invalid_session' };
    }

    if (session.connected) {
      return { ok: false, reason: 'session_in_use' };
    }

    this.clearExpiryTimer(session);
    session.connected = true;
    session.disconnectedAt = null;
    return {
      ok: true,
      session: {
        token: session.token,
        playerId: session.playerId,
        nickname: session.nickname,
      },
    };
  }

  invalidatePlayer(playerId: string): void {
    const session = this.getSessionByPlayerId(playerId);
    if (session) {
      this.deleteSession(session);
    }
  }

  shutdown(): void {
    for (const session of this.sessionsByToken.values()) {
      this.clearExpiryTimer(session);
    }
    this.sessionsByToken.clear();
    this.sessionTokenByPlayerId.clear();
  }

  private getResumeTtlMs(): number {
    return this.options.resumeTtlMs ?? DEFAULT_SESSION_RESUME_TTL_MS;
  }

  private getSessionByPlayerId(playerId: string): SessionRecord | null {
    const token = this.sessionTokenByPlayerId.get(playerId);
    if (!token) {
      return null;
    }

    return this.sessionsByToken.get(token) ?? null;
  }

  private isExpired(session: SessionRecord): boolean {
    return (
      session.disconnectedAt !== null && Date.now() - session.disconnectedAt > this.getResumeTtlMs()
    );
  }

  private clearExpiryTimer(session: SessionRecord): void {
    if (!session.expiryTimer) {
      return;
    }

    clearTimeout(session.expiryTimer);
    session.expiryTimer = null;
  }

  private deleteSession(session: SessionRecord): void {
    this.clearExpiryTimer(session);
    this.sessionsByToken.delete(session.token);
    this.sessionTokenByPlayerId.delete(session.playerId);
  }
}
