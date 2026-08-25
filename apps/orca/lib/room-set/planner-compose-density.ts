/**
 * Density-driven spacing + perimeter breathing for the deterministic composer.
 *
 * Density controls both spacing and how much of the usable audience band the layout should occupy.
 */

import type { RoomSetDensityPreference } from "./planner-intent-shared";

export type ComposeDensityProfile = Readonly<{
  /** Perimeter inset from the room shell (per-tier breathing room). */
  roomEdgeInsetLu: number;
  /** Uniform inset inside the audience band before grid placement. */
  packMarginLu: number;
  /** Target share of band width for the audience grid in oversized rooms. */
  targetBandFillRatio: number;
  /** Target share of band depth for audience grids/rows in oversized rooms. */
  targetBandDepthFillRatio: number;
  /** Target share of band area for topology scoring in oversized rooms. */
  targetBandAreaFillRatio: number;
  /** Where remaining depth slack sits before the audience block: front-weighted to centered. */
  audienceDepthAnchorRatio: number;
  frontAudienceGapLu: number;
  rowGapLu: number;
  tableGapLu: number;
  clusterGapLu: number;
  centerAisleLu: number;
}>;

/** Reference gap kept for future topology helpers. */
export const GRID_TOPOLOGY_REFERENCE_GAP_LU = 2;

export const BALANCED_DENSITY_PROFILE: ComposeDensityProfile = {
  roomEdgeInsetLu: 2,
  packMarginLu: 0,
  targetBandFillRatio: 0.68,
  targetBandDepthFillRatio: 0.56,
  targetBandAreaFillRatio: 0.34,
  audienceDepthAnchorRatio: 0.38,
  frontAudienceGapLu: 2,
  rowGapLu: 1,
  tableGapLu: 2,
  clusterGapLu: 2,
  centerAisleLu: 6,
};

const COMPACT_PROFILE: ComposeDensityProfile = {
  roomEdgeInsetLu: 1,
  packMarginLu: 0,
  targetBandFillRatio: 0.56,
  targetBandDepthFillRatio: 0.34,
  targetBandAreaFillRatio: 0.2,
  audienceDepthAnchorRatio: 0.18,
  frontAudienceGapLu: 1.25,
  rowGapLu: 0.5,
  tableGapLu: 1,
  clusterGapLu: 1,
  centerAisleLu: 4.5,
};

const PREMIUM_PROFILE: ComposeDensityProfile = {
  roomEdgeInsetLu: 4,
  packMarginLu: 2.5,
  targetBandFillRatio: 0.76,
  targetBandDepthFillRatio: 0.72,
  targetBandAreaFillRatio: 0.46,
  audienceDepthAnchorRatio: 0.5,
  frontAudienceGapLu: 3,
  rowGapLu: 2,
  tableGapLu: 3.5,
  clusterGapLu: 3,
  centerAisleLu: 8,
};

export function composeDensityProfile(
  densityPreference: RoomSetDensityPreference | undefined,
): ComposeDensityProfile {
  switch (densityPreference) {
    case "compact":
      return COMPACT_PROFILE;
    case "premium":
      return PREMIUM_PROFILE;
    case "balanced":
    default:
      return BALANCED_DENSITY_PROFILE;
  }
}

export type LuBand = Readonly<{ x: number; y: number; w: number; h: number }>;

export function fullPackBandBelowTop(
  roomWidthLu: number,
  roomDepthLu: number,
  topY: number,
  roomEdgeInsetLu: number,
): LuBand {
  const inset = Math.max(0, roomEdgeInsetLu);
  const y = Math.max(inset, topY);
  return {
    x: inset,
    y,
    w: Math.max(0, roomWidthLu - inset * 2),
    h: Math.max(0, roomDepthLu - inset - y),
  };
}

/** Audience pack band — full width below front; density only trims perimeter + inner margin. */
export function audiencePackBand(
  roomWidthLu: number,
  roomDepthLu: number,
  zoneTop: number,
  profile: ComposeDensityProfile,
): LuBand {
  const full = fullPackBandBelowTop(roomWidthLu, roomDepthLu, zoneTop, profile.roomEdgeInsetLu);
  const margin = Math.max(0, profile.packMarginLu);
  return {
    x: full.x + margin,
    y: full.y + margin,
    w: Math.max(0, full.w - margin * 2),
    h: Math.max(0, full.h - margin * 2),
  };
}
