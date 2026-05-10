import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldHandleLeaderboardTab } from './Leaderboard';

function createKeyboardEvent(key: string, target: EventTarget | null = null): KeyboardEvent {
  return {
    key,
    target,
  } as KeyboardEvent;
}

class FakeHTMLElement {
  isContentEditable = false;

  constructor(readonly tagName: string) {}
}

describe('shouldHandleLeaderboardTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('handles Tab outside editable elements', () => {
    expect(shouldHandleLeaderboardTab(createKeyboardEvent('Tab'))).toBe(true);
  });

  it('ignores non-Tab keys', () => {
    expect(shouldHandleLeaderboardTab(createKeyboardEvent('Enter'))).toBe(false);
  });

  it('does not steal Tab from form controls', () => {
    vi.stubGlobal('HTMLElement', FakeHTMLElement);
    const input = new FakeHTMLElement('INPUT') as unknown as EventTarget;
    const textarea = new FakeHTMLElement('TEXTAREA') as unknown as EventTarget;
    const select = new FakeHTMLElement('SELECT') as unknown as EventTarget;

    expect(shouldHandleLeaderboardTab(createKeyboardEvent('Tab', input))).toBe(false);
    expect(shouldHandleLeaderboardTab(createKeyboardEvent('Tab', textarea))).toBe(false);
    expect(shouldHandleLeaderboardTab(createKeyboardEvent('Tab', select))).toBe(false);
  });
});
