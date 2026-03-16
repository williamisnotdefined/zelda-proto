import { describe, expect, it } from 'vitest';
import { CLIENT_MESSAGE_TYPES, PROTOCOL_VERSION, SNAPSHOT_RESYNC_REASONS } from '@gelehka/shared';
import { validateClientMessage } from '../src/network/MessageValidation';

describe('validateClientMessage', () => {
  it('canonicalizes valid join and chat payloads', () => {
    expect(
      validateClientMessage(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: CLIENT_MESSAGE_TYPES.JOIN,
          nickname: '  Zelda  ',
        },
        false
      )
    ).toEqual({
      ok: true,
      message: {
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.JOIN,
        nickname: 'Zelda',
      },
    });

    expect(
      validateClientMessage(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: CLIENT_MESSAGE_TYPES.CHAT,
          text: '  hello  ',
        },
        true
      )
    ).toEqual({
      ok: true,
      message: {
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.CHAT,
        text: 'hello',
      },
    });
  });

  it('rejects invalid payloads and protocol mismatches', () => {
    expect(validateClientMessage(null, false)).toEqual({ ok: false, reason: 'invalid_message' });

    expect(
      validateClientMessage(
        {
          protocolVersion: PROTOCOL_VERSION + 1,
          type: CLIENT_MESSAGE_TYPES.JOIN,
          nickname: 'Link',
        },
        false
      )
    ).toEqual({ ok: false, reason: 'protocol_mismatch' });

    expect(
      validateClientMessage(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: CLIENT_MESSAGE_TYPES.JOIN,
          nickname: 'Link!',
        },
        false
      )
    ).toEqual({ ok: false, reason: 'invalid_message' });
  });

  it('enforces session rules after payload validation', () => {
    expect(
      validateClientMessage(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: CLIENT_MESSAGE_TYPES.INPUT,
          seq: 1,
          up: false,
          down: false,
          left: false,
          right: true,
          attack: false,
        },
        false
      )
    ).toEqual({ ok: false, reason: 'join_required' });

    expect(
      validateClientMessage(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC,
          reason: SNAPSHOT_RESYNC_REASONS.MANUAL,
          lastTick: 12,
          instanceId: null,
        },
        false
      )
    ).toEqual({ ok: false, reason: 'join_required' });

    expect(
      validateClientMessage(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: CLIENT_MESSAGE_TYPES.JOIN,
          nickname: 'Link',
        },
        true
      )
    ).toEqual({ ok: false, reason: 'already_joined' });

    expect(
      validateClientMessage(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC,
          reason: SNAPSHOT_RESYNC_REASONS.TICK_GAP,
          lastTick: 21,
          instanceId: null,
        },
        true
      )
    ).toEqual({
      ok: true,
      message: {
        protocolVersion: PROTOCOL_VERSION,
        type: CLIENT_MESSAGE_TYPES.SNAPSHOT_RESYNC,
        reason: SNAPSHOT_RESYNC_REASONS.TICK_GAP,
        lastTick: 21,
        instanceId: null,
      },
    });
  });
});
