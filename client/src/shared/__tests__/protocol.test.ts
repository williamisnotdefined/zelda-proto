import { describe, expect, it } from 'vitest';
import { MAX_CHAT_LENGTH, MAX_NICKNAME_LENGTH, MAX_SESSION_TOKEN_LENGTH } from '../constants';
import {
  createChatMessage,
  createInputMessage,
  createJoinMessage,
  createResumeSessionMessage,
  createSnapshotResyncMessage,
  parseChatText,
  parseClientMessage,
  parseNickname,
  parseSessionToken,
} from '../protocol';
import {
  CLIENT_MESSAGE_TYPES,
  INSTANCE_IDS,
  PROTOCOL_VERSION,
  SNAPSHOT_RESYNC_REASONS,
} from '../types';

describe('parseNickname', () => {
  it('trims and accepts canonical nicknames', () => {
    expect(parseNickname('  Link  ')).toEqual({ ok: true, value: 'Link' });
  });

  it('rejects short, long, and invalid nicknames', () => {
    expect(parseNickname(' a ')).toEqual({ ok: false, reason: 'too_short' });
    expect(parseNickname(`A${'b'.repeat(MAX_NICKNAME_LENGTH)}`)).toEqual({
      ok: false,
      reason: 'too_long',
    });
    expect(parseNickname('Link!')).toEqual({ ok: false, reason: 'invalid_characters' });
  });
});

describe('parseChatText', () => {
  it('trims and accepts chat text', () => {
    expect(parseChatText('  hello world  ')).toEqual({ ok: true, value: 'hello world' });
  });

  it('rejects empty, long, and control-character chat text', () => {
    expect(parseChatText('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseChatText('a'.repeat(MAX_CHAT_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'too_long',
    });
    expect(parseChatText('hello\nworld')).toEqual({
      ok: false,
      reason: 'invalid_characters',
    });
  });
});

describe('parseSessionToken', () => {
  it('trims and accepts canonical session tokens', () => {
    expect(parseSessionToken('  token_123-abc  ')).toEqual({ ok: true, value: 'token_123-abc' });
  });

  it('rejects short, long, and invalid session tokens', () => {
    expect(parseSessionToken(' short ')).toEqual({ ok: false, reason: 'too_short' });
    expect(parseSessionToken(`a${'b'.repeat(MAX_SESSION_TOKEN_LENGTH)}`)).toEqual({
      ok: false,
      reason: 'too_long',
    });
    expect(parseSessionToken('token_bad!*')).toEqual({ ok: false, reason: 'invalid_characters' });
  });
});

describe('message builders', () => {
  it('creates canonical client envelopes', () => {
    expect(createJoinMessage('Link')).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: CLIENT_MESSAGE_TYPES.JOIN,
      nickname: 'Link',
    });

    expect(createChatMessage('hello')).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: CLIENT_MESSAGE_TYPES.CHAT,
      text: 'hello',
    });

    expect(createResumeSessionMessage('resume_token_123')).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: CLIENT_MESSAGE_TYPES.RESUME_SESSION,
      sessionToken: 'resume_token_123',
    });

    expect(
      createInputMessage(7, {
        up: true,
        down: false,
        left: false,
        right: true,
        attack: false,
        wave: false,
        numb: false,
        dash: false,
        fireball: false,
        grenade: false,
        landmine: false,
      })
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: CLIENT_MESSAGE_TYPES.INPUT,
      seq: 7,
      up: true,
      down: false,
      left: false,
      right: true,
      attack: false,
      wave: false,
      numb: false,
      dash: false,
      fireball: false,
      grenade: false,
      landmine: false,
    });

    expect(
      createSnapshotResyncMessage(SNAPSHOT_RESYNC_REASONS.TICK_GAP, {
        lastTick: 42,
        instanceId: INSTANCE_IDS.PHASE2,
      })
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC,
      reason: SNAPSHOT_RESYNC_REASONS.TICK_GAP,
      lastTick: 42,
      instanceId: INSTANCE_IDS.PHASE2,
    });
  });
});

describe('parseClientMessage', () => {
  it('canonicalizes valid join and chat payloads', () => {
    expect(
      parseClientMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.JOIN,
        nickname: '  Zelda  ',
      })
    ).toEqual({ ok: true, value: createJoinMessage('Zelda') });

    expect(
      parseClientMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.CHAT,
        text: '  hi  ',
      })
    ).toEqual({ ok: true, value: createChatMessage('hi') });

    expect(
      parseClientMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.RESUME_SESSION,
        sessionToken: 'resume_token_123',
      })
    ).toEqual({
      ok: true,
      value: createResumeSessionMessage('resume_token_123'),
    });

    expect(
      parseClientMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC,
        reason: SNAPSHOT_RESYNC_REASONS.INSTANCE_MISMATCH,
        lastTick: 17,
        instanceId: INSTANCE_IDS.PHASE3,
      })
    ).toEqual({
      ok: true,
      value: createSnapshotResyncMessage(SNAPSHOT_RESYNC_REASONS.INSTANCE_MISMATCH, {
        lastTick: 17,
        instanceId: INSTANCE_IDS.PHASE3,
      }),
    });
  });

  it('rejects invalid payloads and protocol mismatches', () => {
    expect(parseClientMessage(null)).toEqual({ ok: false, reason: 'invalid_message' });
    expect(
      parseClientMessage({
        protocolVersion: PROTOCOL_VERSION + 1,
        type: CLIENT_MESSAGE_TYPES.JOIN,
        nickname: 'Link',
      })
    ).toEqual({ ok: false, reason: 'protocol_mismatch' });
    expect(
      parseClientMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.JOIN,
        nickname: 'Link!',
      })
    ).toEqual({ ok: false, reason: 'invalid_message' });
    expect(
      parseClientMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.INPUT,
        seq: -1,
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
        wave: false,
        numb: false,
        dash: false,
        fireball: false,
        grenade: false,
        landmine: false,
      })
    ).toEqual({ ok: false, reason: 'invalid_message' });
    expect(
      parseClientMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.RESUME_SESSION,
        sessionToken: 'bad token',
      })
    ).toEqual({ ok: false, reason: 'invalid_message' });
    expect(
      parseClientMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC,
        reason: 'oops',
        lastTick: 0,
        instanceId: INSTANCE_IDS.PHASE1,
      })
    ).toEqual({ ok: false, reason: 'invalid_message' });
  });
});
