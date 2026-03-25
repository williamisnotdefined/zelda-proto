import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { pack } from 'msgpackr';
import type { SnapshotMessage, SnapshotDeltaMessage } from '@gelehka/shared';
import {
  diffSnapshot,
  toSnapshotMessage,
  type DiffSnapshotOptions,
  type SnapshotBundle,
} from '../src/network/SnapshotSerializer';

interface SnapshotFixture {
  protocolVersion: number;
  inputs: {
    initialBundle: SnapshotBundle;
    updatedBundle: SnapshotBundle;
    viewer: {
      initial: DiffSnapshotOptions;
      updated: DiffSnapshotOptions;
    };
  };
  messages: {
    initialFullSnapshot: SnapshotMessage;
    initialFullDelta: SnapshotDeltaMessage;
    updatedIncrementalDelta: SnapshotDeltaMessage;
    updatedFullSnapshot: SnapshotMessage;
  };
  wire: {
    initialFullSnapshotBase64: string;
    initialFullDeltaBase64: string;
    updatedIncrementalDeltaBase64: string;
    updatedFullSnapshotBase64: string;
  };
}

async function readSnapshotFixture(): Promise<SnapshotFixture> {
  const filePath = new URL(
    '../../testdata/server-contract/snapshot/messages.json',
    import.meta.url
  );
  return JSON.parse(await readFile(filePath, 'utf8')) as SnapshotFixture;
}

describe('SnapshotSerializer contract fixtures', () => {
  it('keeps the full snapshot and delta goldens aligned with the current serializer', async () => {
    const fixture = await readSnapshotFixture();

    const initialFullSnapshot = toSnapshotMessage(fixture.inputs.initialBundle);
    expect(initialFullSnapshot).toEqual(fixture.messages.initialFullSnapshot);
    expect(Buffer.from(pack(initialFullSnapshot)).toString('base64')).toBe(
      fixture.wire.initialFullSnapshotBase64
    );

    const fullDelta = diffSnapshot(
      null,
      fixture.inputs.initialBundle,
      fixture.messages.initialFullDelta.tick,
      false,
      fixture.inputs.viewer.initial
    );
    expect(fullDelta.message).toEqual(fixture.messages.initialFullDelta);
    expect(Buffer.from(pack(fullDelta.message)).toString('base64')).toBe(
      fixture.wire.initialFullDeltaBase64
    );

    const incrementalDelta = diffSnapshot(
      fullDelta.nextState,
      fixture.inputs.updatedBundle,
      fixture.messages.updatedIncrementalDelta.tick,
      false,
      fixture.inputs.viewer.updated
    );
    expect(incrementalDelta.message).toEqual(fixture.messages.updatedIncrementalDelta);
    expect(Buffer.from(pack(incrementalDelta.message)).toString('base64')).toBe(
      fixture.wire.updatedIncrementalDeltaBase64
    );

    const updatedFullSnapshot = toSnapshotMessage(fixture.inputs.updatedBundle);
    expect(updatedFullSnapshot).toEqual(fixture.messages.updatedFullSnapshot);
    expect(Buffer.from(pack(updatedFullSnapshot)).toString('base64')).toBe(
      fixture.wire.updatedFullSnapshotBase64
    );
  });
});
