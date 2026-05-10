import type { PortalKind } from '@/shared';
import { PORTAL_KINDS } from '@/shared';

const RETURN_PORTAL_SIZE_PX = 36;
const ADVANCE_PORTAL_SIZE_PX = 80;

type PortalVisualGroup = 'advance' | 'return';

export interface PortalVisualConfig {
  textureKey: string;
  animationKey: string;
  sizePx: number;
  minimapColor: number;
  group: PortalVisualGroup;
}

export const portalRegistry: Record<PortalKind, PortalVisualConfig> = {
  [PORTAL_KINDS.PHASE1_TO_PHASE2]: {
    textureKey: 'portal_advance',
    animationKey: 'portal_advance_loop',
    sizePx: ADVANCE_PORTAL_SIZE_PX,
    minimapColor: 0xc98a3a,
    group: 'advance',
  },
  [PORTAL_KINDS.PHASE2_TO_PHASE1]: {
    textureKey: 'portal_return',
    animationKey: 'portal_return_loop',
    sizePx: RETURN_PORTAL_SIZE_PX,
    minimapColor: 0x4aa3ff,
    group: 'return',
  },
  [PORTAL_KINDS.PHASE2_TO_PHASE3]: {
    textureKey: 'portal_advance',
    animationKey: 'portal_advance_loop',
    sizePx: ADVANCE_PORTAL_SIZE_PX,
    minimapColor: 0xc98a3a,
    group: 'advance',
  },
  [PORTAL_KINDS.PHASE3_TO_PHASE2]: {
    textureKey: 'portal_return',
    animationKey: 'portal_return_loop',
    sizePx: RETURN_PORTAL_SIZE_PX,
    minimapColor: 0x4aa3ff,
    group: 'return',
  },
  [PORTAL_KINDS.PHASE3_TO_PHASE4]: {
    textureKey: 'portal_earth',
    animationKey: 'portal_earth_loop',
    sizePx: ADVANCE_PORTAL_SIZE_PX,
    minimapColor: 0xc98a3a,
    group: 'advance',
  },
  [PORTAL_KINDS.PHASE4_TO_PHASE3]: {
    textureKey: 'portal_return',
    animationKey: 'portal_return_loop',
    sizePx: RETURN_PORTAL_SIZE_PX,
    minimapColor: 0x4aa3ff,
    group: 'return',
  },
};

export function getPortalVisualConfig(kind: PortalKind): PortalVisualConfig {
  return portalRegistry[kind];
}

export function getPortalMinimapColor(kind: PortalKind): number {
  return portalRegistry[kind].minimapColor;
}
