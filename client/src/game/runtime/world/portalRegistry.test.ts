import { describe, expect, it } from 'vitest';
import { PORTAL_KINDS } from '@gelehka/shared';
import { getPortalMinimapColor, getPortalVisualConfig, portalRegistry } from './portalRegistry';

describe('portalRegistry', () => {
  it('covers every shared portal kind', () => {
    expect(Object.keys(portalRegistry).sort()).toEqual(Object.values(PORTAL_KINDS).sort());
  });

  it('reuses the same config source for visuals and minimap color', () => {
    const config = getPortalVisualConfig(PORTAL_KINDS.PHASE3_TO_PHASE4);

    expect(config.gifPath).toContain('Earth_Portal');
    expect(config.sizePx).toBeGreaterThan(RETURN_PORTAL_SIZE_FALLBACK);
    expect(getPortalMinimapColor(PORTAL_KINDS.PHASE3_TO_PHASE4)).toBe(config.minimapColor);
  });
});

const RETURN_PORTAL_SIZE_FALLBACK = 36;
