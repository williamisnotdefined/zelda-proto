import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { pack, unpack } from 'msgpackr';
import { parseClientMessage } from '../protocol';

interface ProtocolFixtureCase {
  name: string;
  raw: unknown;
  canonical?: unknown;
  expectedFailure?: 'invalid_message' | 'protocol_mismatch';
  msgpackBase64: string;
}

interface ProtocolFixture {
  protocolVersion: number;
  cases: ProtocolFixtureCase[];
}

async function readProtocolFixture(): Promise<ProtocolFixture> {
  const filePath = new URL(
    '../../../../testdata/server-contract/protocol/messages.json',
    import.meta.url
  );
  return JSON.parse(await readFile(filePath, 'utf8')) as ProtocolFixture;
}

describe('protocol contract fixtures', () => {
  it('keeps protocol fixtures aligned with MessagePack bytes and canonical parsing', async () => {
    const fixture = await readProtocolFixture();

    expect(fixture.protocolVersion).toBe(8);

    for (const testCase of fixture.cases) {
      const bytes = Buffer.from(testCase.msgpackBase64, 'base64');

      expect(unpack(bytes)).toEqual(testCase.raw);
      expect(Buffer.from(pack(testCase.raw)).toString('base64')).toBe(testCase.msgpackBase64);

      const parsed = parseClientMessage(testCase.raw);
      const parsedFromWire = parseClientMessage(unpack(bytes));

      if (testCase.expectedFailure) {
        expect(parsed, testCase.name).toEqual({ ok: false, reason: testCase.expectedFailure });
        expect(parsedFromWire, `${testCase.name} from wire`).toEqual({
          ok: false,
          reason: testCase.expectedFailure,
        });
        continue;
      }

      expect(parsed, testCase.name).toEqual({ ok: true, value: testCase.canonical });
      expect(parsedFromWire, `${testCase.name} from wire`).toEqual({
        ok: true,
        value: testCase.canonical,
      });
    }
  });
});
