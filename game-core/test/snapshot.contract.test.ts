import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createSnapshotMessageFilterState,
  createSnapshotNormalizationState,
  filterSnapshotMessage,
  normalizeServerMessageResult,
} from '../src/snapshot';
import type { ServerMessage, SnapshotDeltaMessage, SnapshotMessage } from '@gelehka/shared';

interface SnapshotFixture {
  protocolVersion: number;
  messages: {
    initialFullSnapshot: SnapshotMessage;
    initialFullDelta: SnapshotDeltaMessage;
    updatedIncrementalDelta: SnapshotDeltaMessage;
    updatedFullSnapshot: SnapshotMessage;
  };
}

async function readSnapshotFixture(): Promise<SnapshotFixture> {
  const filePath = new URL(
    '../../testdata/server-contract/snapshot/messages.json',
    import.meta.url
  );
  return JSON.parse(await readFile(filePath, 'utf8')) as SnapshotFixture;
}

describe('snapshot contract fixtures', () => {
  it('normalizes the frozen snapshot message sequence into the expected full view', async () => {
    const fixture = await readSnapshotFixture();
    const state = createSnapshotNormalizationState();

    expect(fixture.protocolVersion).toBe(7);

    expect(normalizeServerMessageResult(fixture.messages.initialFullSnapshot, state)).toMatchObject(
      {
        kind: 'message',
        snapshotBaseApplied: true,
        message: fixture.messages.initialFullSnapshot,
      }
    );

    expect(normalizeServerMessageResult(fixture.messages.updatedIncrementalDelta, state)).toEqual({
      kind: 'message',
      snapshotBaseApplied: false,
      message: fixture.messages.updatedFullSnapshot,
    });
  });

  it('treats the frozen full delta as a new baseline before applying the incremental delta', async () => {
    const fixture = await readSnapshotFixture();
    const state = createSnapshotNormalizationState();

    expect(normalizeServerMessageResult(fixture.messages.initialFullDelta, state)).toEqual({
      kind: 'message',
      snapshotBaseApplied: true,
      message: fixture.messages.initialFullSnapshot,
    });

    expect(normalizeServerMessageResult(fixture.messages.updatedIncrementalDelta, state)).toEqual({
      kind: 'message',
      snapshotBaseApplied: false,
      message: fixture.messages.updatedFullSnapshot,
    });
  });

  it('keeps the snapshot filter aligned with the frozen full-delta sequence', async () => {
    const fixture = await readSnapshotFixture();
    const state = createSnapshotMessageFilterState();

    const accepted: ServerMessage[] = [];

    for (const message of [
      fixture.messages.initialFullDelta,
      fixture.messages.updatedIncrementalDelta,
    ] as SnapshotDeltaMessage[]) {
      const filtered = filterSnapshotMessage(message, state);
      expect(filtered).not.toBeNull();
      accepted.push(filtered as ServerMessage);
    }

    expect(accepted).toEqual([
      fixture.messages.initialFullDelta,
      fixture.messages.updatedIncrementalDelta,
    ]);
  });
});
