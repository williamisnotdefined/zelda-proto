import { afterEach, describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { getRequestIp, isAllowedWebSocketOrigin } from '../src/network/requestPolicy';

const ORIGINAL_TRUST_PROXY = process.env.TRUST_PROXY;
const ORIGINAL_WS_ALLOWED_ORIGINS = process.env.WS_ALLOWED_ORIGINS;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

function createRequest(
  headers: Record<string, string>,
  remoteAddress = '10.0.0.9'
): IncomingMessage {
  return {
    headers,
    socket: {
      remoteAddress,
    },
  } as IncomingMessage;
}

afterEach(() => {
  if (ORIGINAL_TRUST_PROXY === undefined) {
    delete process.env.TRUST_PROXY;
  } else {
    process.env.TRUST_PROXY = ORIGINAL_TRUST_PROXY;
  }

  if (ORIGINAL_WS_ALLOWED_ORIGINS === undefined) {
    delete process.env.WS_ALLOWED_ORIGINS;
  } else {
    process.env.WS_ALLOWED_ORIGINS = ORIGINAL_WS_ALLOWED_ORIGINS;
  }

  if (ORIGINAL_NODE_ENV === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  }
});

describe('requestPolicy', () => {
  it('uses remoteAddress unless proxy trust is enabled', () => {
    process.env.TRUST_PROXY = '0';

    expect(
      getRequestIp(
        createRequest({
          'x-forwarded-for': '203.0.113.2, 198.51.100.4',
        })
      )
    ).toBe('10.0.0.9');

    process.env.TRUST_PROXY = 'true';

    expect(
      getRequestIp(
        createRequest({
          'x-forwarded-for': '203.0.113.2, 198.51.100.4',
        })
      )
    ).toBe('203.0.113.2');
  });

  it('allows same-host websocket origins without an explicit allowlist', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.WS_ALLOWED_ORIGINS;

    expect(
      isAllowedWebSocketOrigin(
        createRequest({
          host: 'localhost:3002',
          origin: 'http://localhost:5173',
        })
      )
    ).toBe(true);

    expect(
      isAllowedWebSocketOrigin(
        createRequest({
          host: '192.168.1.15:3002',
          origin: 'http://192.168.1.15:5173',
        })
      )
    ).toBe(true);
  });

  it('rejects mismatched origins unless they are explicitly allowlisted', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.WS_ALLOWED_ORIGINS;

    expect(
      isAllowedWebSocketOrigin(
        createRequest({
          host: 'game.example.com:3001',
          origin: 'https://evil.example.com',
        })
      )
    ).toBe(false);

    process.env.WS_ALLOWED_ORIGINS = 'https://cdn.example.com, https://app.example.com';

    expect(
      isAllowedWebSocketOrigin(
        createRequest({
          host: 'game.example.com:3001',
          origin: 'https://app.example.com',
        })
      )
    ).toBe(true);
  });
});
