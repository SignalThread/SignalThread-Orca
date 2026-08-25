/**
 * Deterministic banquet audience composition offsets (grid baseline + light variance).
 */

import type { RoomSetAudienceStyle } from "./planner-intent-shared";
import type { LuBand } from "./planner-compose-density";

import type { LayoutSpecAudienceArcStrength } from "./layout-spec";

/** Scale multiplier for arc / loose banquet offsets from topology intent. */
export function banquetArcStrengthScale(
  arcStrength: LayoutSpecAudienceArcStrength | undefined,
): number {
  switch (arcStrength) {
    case "softer":
      return 0.62;
    case "stronger":
      return 1.38;
    default:
      return 1;
  }
}

export function effectiveBanquetAudienceStyle(
  layoutType: string,
  audienceStyle: RoomSetAudienceStyle,
): RoomSetAudienceStyle {
  if (layoutType === "banquet") return audienceStyle;
  if (layoutType === "reception" && (audienceStyle === "loose" || audienceStyle === "arc" || audienceStyle === "scattered")) {
    return audienceStyle;
  }
  return "grid";
}

export function offsetBanquetLoose(
  baseX: number,
  baseY: number,
  row: number,
  col: number,
  gapLu: number,
  scale = 1,
): Readonly<{ x: number; y: number }> {
  const rowShift = (row % 2 === 0 ? 1 : -1) * Math.min(1.4, Math.max(0.4, gapLu * 0.34)) * scale;
  const seed = row * 31 + col * 17;
  const colNudge = (((seed % 7) - 3) / 3) * Math.min(0.55, Math.max(0.18, gapLu * 0.16)) * scale;
  const depthNudge = (((seed % 5) - 2) / 2) * Math.min(0.75, Math.max(0.2, gapLu * 0.2)) * scale;
  return { x: baseX + rowShift + colNudge, y: baseY + depthNudge };
}

/** Soft crescent opening toward front-of-room — edge tables recede, center advances. */
export function offsetBanquetArc(
  baseX: number,
  baseY: number,
  row: number,
  col: number,
  cols: number,
  gridRows: number,
  band: LuBand,
  itemW: number,
  scale = 1,
): Readonly<{ x: number; y: number }> {
  const rowT = gridRows <= 1 ? 0 : row / Math.max(1, gridRows - 1);
  const colT = cols <= 1 ? 0.5 : col / Math.max(1, cols - 1);
  const edgeFactor = Math.abs(colT - 0.5) * 2;
  const centerFactor = 1 - edgeFactor;
  const isFrontRow = row === 0;
  const isRearRow = row === gridRows - 1;

  const centerX = band.x + band.w / 2;
  const itemCenterX = baseX + itemW / 2;
  const side = itemCenterX >= centerX ? 1 : -1;

  // Front rows carry most of the crescent; rear rows ease off to preserve open depth.
  const frontWeight = 1 - rowT * 0.48;
  const edgeCurve = Math.pow(edgeFactor, 1.28);
  const centerCurve = Math.pow(centerFactor, 1.15);

  const wingSpread =
    edgeCurve * (1.15 + rowT * 0.55) * frontWeight * scale +
    (edgeFactor > 0.72 ? (edgeFactor - 0.72) * 3.2 * frontWeight * scale : 0);
  const arcX = baseX + side * wingSpread;

  const edgeRecede = edgeCurve * (2.1 + rowT * 0.75) * (0.75 + frontWeight * 0.45) * scale;
  const centerAdvance = centerCurve * (1.05 + frontWeight * 1.05) * scale;

  // Rear row: break mirror symmetry with light stagger — planner hand, not CAD.
  const seed = row * 29 + col * 19;
  let rearStaggerX = 0;
  let rearStaggerY = 0;
  if (isRearRow && gridRows > 1) {
    rearStaggerX = side * (0.22 + (seed % 4) * 0.11) * scale;
    rearStaggerY = (((seed % 5) - 2) * 0.13 + (col % 2 === 0 ? 0.12 : -0.08)) * scale;
  } else if (isFrontRow) {
    // Front wings open a touch more than a strict grid row would.
    rearStaggerX = side * edgeCurve * 0.08 * scale;
  }

  const wobbleX = side * (((row * 11 + col * 7) % 5) - 2) * 0.08 * scale;
  const wobbleY = (((row * 13 + col * 9) % 5) - 2) * 0.06 * scale;

  return {
    x: arcX + rearStaggerX + wobbleX,
    y: baseY + edgeRecede - centerAdvance + rearStaggerY + wobbleY,
  };
}

export function styledBanquetSlot(
  style: RoomSetAudienceStyle,
  args: Readonly<{
    baseX: number;
    baseY: number;
    row: number;
    col: number;
    cols: number;
    gridRows: number;
    band: LuBand;
    itemW: number;
    gapLu: number;
    scale?: number;
  }>,
): Readonly<{ x: number; y: number }> {
  const scale = args.scale ?? 1;
  if (style === "loose" || style === "scattered") {
    return offsetBanquetLoose(args.baseX, args.baseY, args.row, args.col, args.gapLu, scale);
  }
  if (style === "arc") {
    return offsetBanquetArc(
      args.baseX,
      args.baseY,
      args.row,
      args.col,
      args.cols,
      args.gridRows,
      args.band,
      args.itemW,
      scale,
    );
  }
  return { x: args.baseX, y: args.baseY };
}
