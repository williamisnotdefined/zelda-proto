import type { PortalKind } from '@/shared';
import { PORTAL_KINDS } from '@/shared';

const RETURN_PORTAL_GIF_PATH = '/assets/sprites/teleports/Magic_Forcefield_Blue.gif';
const ADVANCE_PORTAL_GIF_PATH = '/assets/sprites/teleports/Energy_Portal.gif';
const EARTH_PORTAL_GIF_PATH = '/assets/sprites/teleports/Earth_Portal.gif';
const RETURN_PORTAL_SIZE_PX = 36;
const ADVANCE_PORTAL_SIZE_PX = 80;

type PortalVisualGroup = 'advance' | 'return';

export interface PortalVisualConfig {
  gifPath: string;
  sizePx: number;
  minimapColor: number;
  group: PortalVisualGroup;
}

export const portalRegistry: Record<PortalKind, PortalVisualConfig> = {
  [PORTAL_KINDS.PHASE1_TO_PHASE2]: {
    gifPath: ADVANCE_PORTAL_GIF_PATH,
    sizePx: ADVANCE_PORTAL_SIZE_PX,
    minimapColor: 0xc98a3a,
    group: 'advance',
  },
  [PORTAL_KINDS.PHASE2_TO_PHASE1]: {
    gifPath: RETURN_PORTAL_GIF_PATH,
    sizePx: RETURN_PORTAL_SIZE_PX,
    minimapColor: 0x4aa3ff,
    group: 'return',
  },
  [PORTAL_KINDS.PHASE2_TO_PHASE3]: {
    gifPath: ADVANCE_PORTAL_GIF_PATH,
    sizePx: ADVANCE_PORTAL_SIZE_PX,
    minimapColor: 0xc98a3a,
    group: 'advance',
  },
  [PORTAL_KINDS.PHASE3_TO_PHASE2]: {
    gifPath: RETURN_PORTAL_GIF_PATH,
    sizePx: RETURN_PORTAL_SIZE_PX,
    minimapColor: 0x4aa3ff,
    group: 'return',
  },
  [PORTAL_KINDS.PHASE3_TO_PHASE4]: {
    gifPath: EARTH_PORTAL_GIF_PATH,
    sizePx: ADVANCE_PORTAL_SIZE_PX,
    minimapColor: 0xc98a3a,
    group: 'advance',
  },
  [PORTAL_KINDS.PHASE4_TO_PHASE3]: {
    gifPath: RETURN_PORTAL_GIF_PATH,
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
