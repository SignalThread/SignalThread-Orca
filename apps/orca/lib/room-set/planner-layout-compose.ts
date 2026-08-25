/**
 * Minimal geometry composition for AI layout plans — coordinates only.
 * Preserves object types, counts, and labels from AI placements; ignores AI x/y.
 */

import { getRoomSetComponent, type RoomSetComponentId } from "@/lib/room-set/component-library";

import type { LayoutSpecZoneRole, LayoutSpecLayoutType } from "./layout-spec";
import type { LayoutSpecAudienceTopologyIntent } from "./layout-spec";
import type { ApplySemanticDirectives } from "./layout-spec-semantic-directives";
import {
  resolveSemanticDirectiveScoringWeight,
  topologyIntentFieldIsExplicit,
} from "./layout-spec-semantic-directives";
import type {
  RoomSetDensityPreference,
  RoomSetAudienceStyle,
  RoomSetEventIntentId,
} from "./planner-intent-shared";
import {
  effectiveBanquetAudienceStyle,
  styledBanquetSlot,
  banquetArcStrengthScale,
} from "./planner-banquet-audience-style";
import type { RoomSetLayoutPlacement } from "./planner-layout-schema";
import type { PlannerLayoutValidationIssue } from "./planner-layout-validator";
import { findPlannerLayoutPlacementOverlaps } from "./planner-layout-validator";
import {
  analyzeBanquetTableVisualQuality,
  banquetTableVisualOpportunityDemand,
  type BanquetTableVisualQualityMetrics,
} from "./planner-layout-visual-quality";
import {
  analyzeTheaterAudienceVisualQuality,
  analyzeTownHallAudienceVisualQuality,
  type RowAudienceVisualQualityMetrics,
  type TownHallAudienceVisualQualityMetrics,
} from "./planner-row-audience-visual-quality";
import type { RoomSetPlannerPlacementPreference } from "./planner-component-requests";
import {
  plannerSceneFromLayoutPlacements,
  plannerSceneToLayoutPlacements,
  type PlannerScene,
} from "./planner-scene";
import { formatRoomShellDimensions } from "./room-units";
import {
  audiencePackBand,
  composeDensityProfile,
  fullPackBandBelowTop,
  type ComposeDensityProfile,
  type LuBand,
} from "./planner-compose-density";

const FRONT_EDGE_LU = 2;
const FRONT_STACK_GAP_LU = 1.5;
const ROOM_EDGE_LU = 2;
const SECONDARY_EDGE_GAP_LU = 1.5;
const SECONDARY_BAND_DEPTH_LU = 14;
const SECONDARY_SIDE_BAND_LU = 10;
/** Hard cap on grid positions tried per object in the front-stack fallback scan. */
const MAX_SCAN_POSITIONS_PER_ITEM = 4096;

type SecondaryPlacementZone = "front" | "rear" | "side" | "perimeter";

type MutablePlacement = {
  componentId: RoomSetComponentId;
  xLu: number;
  yLu: number;
  rotationDeg: number;
  label?: string;
  placementPreference?: RoomSetPlannerPlacementPreference;
  zoneRole?: LayoutSpecZoneRole;
};

type LuRect = Readonly<{ x: number; y: number; w: number; h: number }>;

type ComposeContext = Readonly<{
  density: ComposeDensityProfile;
  roomWidthLu: number;
  roomDepthLu: number;
  attendeeTarget?: number;
  audienceStyle: RoomSetAudienceStyle;
  layoutType: LayoutSpecLayoutType;
  eventIntent?: RoomSetEventIntentId;
  audienceTopology?: LayoutSpecAudienceTopologyIntent;
  applySemanticDirectives?: ApplySemanticDirectives;
}>;

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function componentFootprint(componentId: RoomSetComponentId): { w: number; h: number } {
  const def = getRoomSetComponent(componentId);
  if (!def) return { w: 1, h: 1 };
  return { w: def.widthLu, h: def.depthLu };
}

/** Match validator: top-left anchor with full catalog width × depth inside the room. */
function fitsExtentsInRoom(
  x: number,
  y: number,
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  return (
    x >= -1e-6 &&
    y >= -1e-6 &&
    x + w <= roomWidthLu + 1e-6 &&
    y + h <= roomDepthLu + 1e-6
  );
}

function fitsExtentsInBand(x: number, y: number, w: number, h: number, band: LuBand): boolean {
  return (
    x >= band.x - 1e-6 &&
    y >= band.y - 1e-6 &&
    x + w <= band.x + band.w + 1e-6 &&
    y + h <= band.y + band.h + 1e-6
  );
}

function centerXInBand(itemW: number, band: LuBand): number {
  return band.x + (band.w - itemW) / 2;
}

function bandBelowTop(
  roomWidthLu: number,
  roomDepthLu: number,
  topY: number,
  insetLu: number,
): LuBand {
  return fullPackBandBelowTop(roomWidthLu, roomDepthLu, topY, insetLu);
}

function splitRowBankXsInBand(
  band: LuBand,
  rowW: number,
  aisleW: number,
): Readonly<{ leftX: number; rightX: number }> | null {
  const split = splitRowBankXs(band.w, rowW, aisleW);
  if (!split) return null;
  return { leftX: band.x + split.leftX, rightX: band.x + split.rightX };
}

function placementRect(placement: Readonly<{ componentId: RoomSetComponentId; xLu: number; yLu: number }>): LuRect {
  const { w, h } = componentFootprint(placement.componentId);
  return { x: placement.xLu, y: placement.yLu, w, h };
}

function rectsOverlap(a: LuRect, b: LuRect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function fitsRoom(rect: LuRect, roomWidthLu: number, roomDepthLu: number): boolean {
  return fitsExtentsInRoom(rect.x, rect.y, rect.w, rect.h, roomWidthLu, roomDepthLu);
}

function canPlace(
  draft: MutablePlacement,
  placed: readonly MutablePlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  const rect = placementRect(draft);
  if (!fitsRoom(rect, roomWidthLu, roomDepthLu)) return false;
  for (const prior of placed) {
    if (rectsOverlap(rect, placementRect(prior))) return false;
  }
  return true;
}

function pushIfFits(
  draft: MutablePlacement,
  placed: MutablePlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  if (!canPlace(draft, placed, roomWidthLu, roomDepthLu)) return false;
  placed.push(draft);
  return true;
}

function inflateRect(rect: LuRect, amount: number): LuRect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    w: rect.w + amount * 2,
    h: rect.h + amount * 2,
  };
}

function canPlaceWithClearance(
  draft: MutablePlacement,
  placed: readonly MutablePlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
  clearanceLu: number,
): boolean {
  const rect = placementRect(draft);
  if (!fitsRoom(rect, roomWidthLu, roomDepthLu)) return false;
  const expanded = inflateRect(rect, Math.max(0, clearanceLu) / 2);
  for (const prior of placed) {
    if (rectsOverlap(expanded, inflateRect(placementRect(prior), Math.max(0, clearanceLu) / 2))) {
      return false;
    }
  }
  return true;
}

function centerX(roomWidthLu: number, widthLu: number): number {
  return (roomWidthLu - widthLu) / 2;
}

/** Split audience banks with full row width accounted on both sides; null when either bank overflows. */
function splitRowBankXs(
  roomWidthLu: number,
  rowW: number,
  aisleW: number,
): Readonly<{ leftX: number; rightX: number }> | null {
  if (roomWidthLu + 1e-6 < rowW * 2 + aisleW) return null;
  const leftX = (roomWidthLu - aisleW) / 2 - rowW;
  const rightX = (roomWidthLu + aisleW) / 2;
  if (leftX < -1e-6 || rightX + rowW > roomWidthLu + 1e-6) return null;
  return { leftX, rightX };
}

function rowBankStartsInBand(
  band: LuBand,
  rowW: number,
  banks: number,
  aisleW: number,
): number[] | null {
  if (banks <= 0) return [];
  if (banks === 1) return [centerXInBand(rowW, band)];
  const totalWidth = banks * rowW + (banks - 1) * aisleW;
  if (totalWidth > band.w + 1e-6) return null;
  const startX = band.x + (band.w - totalWidth) / 2;
  const xs: number[] = [];
  for (let bankIndex = 0; bankIndex < banks; bankIndex += 1) {
    const x = startX + bankIndex * (rowW + aisleW);
    if (x < band.x - 1e-6 || x + rowW > band.x + band.w + 1e-6) return null;
    xs.push(x);
  }
  return xs;
}

/**
 * Evenly spaced column origins inside a band; each slot must fit full item width.
 * Returns null when the grid span exceeds the band width.
 */
function gridColumnStartsInBand(
  band: LuBand,
  itemW: number,
  pitch: number,
  slotCount: number,
): number[] | null {
  if (slotCount <= 0) return [];
  if (itemW > band.w + 1e-6) return null;
  const span = (slotCount - 1) * pitch + itemW;
  if (span > band.w + 1e-6) return null;

  const starts: number[] = [];
  const origin = band.x + (band.w - span) / 2;
  for (let index = 0; index < slotCount; index += 1) {
    const x = origin + index * pitch;
    if (x < band.x - 1e-6 || x + itemW > band.x + band.w + 1e-6) return null;
    starts.push(x);
  }
  return starts;
}

/**
 * Evenly spaced row origins inside a band; each slot must fit full item height.
 * Returns null when the grid span exceeds the band height.
 */
function gridRowStartsInBand(
  band: LuBand,
  itemH: number,
  pitch: number,
  slotCount: number,
  options?: Readonly<{ anchorRatio?: number }>,
): number[] | null {
  if (slotCount <= 0) return [];
  if (itemH > band.h + 1e-6) return null;
  const span = (slotCount - 1) * pitch + itemH;
  if (span > band.h + 1e-6) return null;

  const slack = band.h - span;
  const anchorRatio = clampNumber(options?.anchorRatio ?? 0, 0, 0.5);
  const origin = band.y + Math.max(0, slack) * anchorRatio;
  const starts: number[] = [];
  for (let index = 0; index < slotCount; index += 1) {
    const y = origin + index * pitch;
    if (y < band.y - 1e-6 || y + itemH > band.y + band.h + 1e-6) return null;
    starts.push(y);
  }
  return starts;
}

/** Corner-anchored edge placement — no clamping; null when the full footprint does not fit. */
function edgePlacementFromCorner(
  corner: "topLeft" | "topRight" | "bottomLeft" | "bottomRight",
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
  insetLu: number,
): Readonly<{ x: number; y: number }> | null {
  const inset = Math.max(0, insetLu);
  let x = inset;
  let y = inset;
  switch (corner) {
    case "topLeft":
      break;
    case "topRight":
      x = roomWidthLu - inset - w;
      break;
    case "bottomLeft":
      y = roomDepthLu - inset - h;
      break;
    case "bottomRight":
      x = roomWidthLu - inset - w;
      y = roomDepthLu - inset - h;
      break;
    default:
      return null;
  }
  if (!fitsExtentsInRoom(x, y, w, h, roomWidthLu, roomDepthLu)) return null;
  return { x, y };
}

function isPrimaryScreenComponent(componentId: RoomSetComponentId): boolean {
  return componentId === "av-projector-screen" || componentId === "av-led-wall";
}

function isStageDeckAvComponent(componentId: RoomSetComponentId): boolean {
  return componentId === "av-confidence-monitor";
}

function isScreenComponent(componentId: RoomSetComponentId): boolean {
  return (
    isPrimaryScreenComponent(componentId) ||
    isStageDeckAvComponent(componentId)
  );
}

function isStageComponent(componentId: RoomSetComponentId): boolean {
  return componentId.startsWith("stage-");
}

function isAudienceRowComponent(componentId: RoomSetComponentId): boolean {
  return componentId === "seating-theater-row" || componentId === "seating-classroom-row";
}

function isBanquetTableComponent(componentId: RoomSetComponentId): boolean {
  return (
    componentId === "table-round-60" ||
    componentId === "table-round-72" ||
    componentId === "table-banquet-6ft"
  );
}

function isCocktailComponent(componentId: RoomSetComponentId): boolean {
  return componentId === "table-cocktail-cluster" || componentId === "table-cocktail";
}

function isEdgeServiceComponent(componentId: RoomSetComponentId): boolean {
  const def = getRoomSetComponent(componentId);
  if (!def) return false;
  return def.category === "fnb" || def.category === "registration";
}

function isDecorComponent(componentId: RoomSetComponentId): boolean {
  return getRoomSetComponent(componentId)?.category === "decor";
}

function bottomExtentOf(placed: readonly MutablePlacement[]): number {
  let maxBottom = 0;
  for (const item of placed) {
    const rect = placementRect(item);
    maxBottom = Math.max(maxBottom, rect.y + rect.h);
  }
  return maxBottom;
}

function isFrontStackComponent(componentId: RoomSetComponentId): boolean {
  if (isScreenComponent(componentId) || isStageComponent(componentId)) return true;
  return getRoomSetComponent(componentId)?.category === "av";
}

type GeometryRolePartition = Readonly<{
  front: MutablePlacement[];
  audienceRows: MutablePlacement[];
  banquetTables: MutablePlacement[];
  cocktailClusters: MutablePlacement[];
  edgeServices: MutablePlacement[];
  other: MutablePlacement[];
}>;

/** Catalog geometry roles only — which layout primitive to use, not what to include. */
function partitionByGeometryRole(expanded: readonly MutablePlacement[]): GeometryRolePartition {
  const front: MutablePlacement[] = [];
  const audienceRows: MutablePlacement[] = [];
  const banquetTables: MutablePlacement[] = [];
  const cocktailClusters: MutablePlacement[] = [];
  const edgeServices: MutablePlacement[] = [];
  const other: MutablePlacement[] = [];

  for (const item of expanded) {
    if (isFrontStackComponent(item.componentId)) {
      front.push(item);
    } else if (isAudienceRowComponent(item.componentId)) {
      audienceRows.push(item);
    } else if (isBanquetTableComponent(item.componentId)) {
      banquetTables.push(item);
    } else if (isCocktailComponent(item.componentId)) {
      cocktailClusters.push(item);
    } else if (isEdgeServiceComponent(item.componentId)) {
      edgeServices.push(item);
    } else {
      other.push(item);
    }
  }

  return { front, audienceRows, banquetTables, cocktailClusters, edgeServices, other };
}

type AudiencePlacementAdjustment = Readonly<{
  ok: boolean;
  placedCount: number;
  warnings: readonly string[];
}>;

function capacityForPlacements(items: readonly MutablePlacement[]): number {
  let capacity = 0;
  for (const item of items) {
    const def = getRoomSetComponent(item.componentId);
    capacity += Math.max(0, def?.capacitySeated ?? 0);
  }
  return capacity;
}

function dedupeStrings(items: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function uniqueDescendingNumbers(values: readonly number[]): number[] {
  return [...new Set(values.map((value) => Number(value.toFixed(3))))].sort((left, right) => right - left);
}

function uniqueAscendingNumbers(values: readonly number[], tolerance = 1e-3): number[] {
  const out: number[] = [];
  for (const value of [...values].sort((left, right) => left - right)) {
    if (out.some((entry) => Math.abs(entry - value) <= tolerance)) continue;
    out.push(value);
  }
  return out;
}

function buildAudienceAdjustmentWarnings(args: Readonly<{
  label: string;
  originalCount: number;
  placedCount: number;
  originalCapacity: number;
  placedCapacity: number;
  spacingAdjusted: boolean;
  topologyAdjusted: boolean;
}>): string[] {
  const warnings: string[] = [];
  if (args.spacingAdjusted || args.topologyAdjusted || args.placedCount < args.originalCount) {
    warnings.push("Requested topology adjusted to fit room.");
  }
  if (args.placedCount < args.originalCount) {
    warnings.push(
      `${args.label} reduced from ${args.originalCount} to ${args.placedCount}; seated capacity reduced from ${args.originalCapacity} to ${args.placedCapacity}.`,
    );
  } else if (args.spacingAdjusted || args.topologyAdjusted) {
    warnings.push(
      `${args.label} reflowed with tighter spacing and/or bank adjustments to preserve a centered fit.`,
    );
  }
  return dedupeStrings(warnings);
}

function expandPlacements(input: readonly RoomSetLayoutPlacement[]): MutablePlacement[] {
  return input.map((placement) => ({
    componentId: placement.componentId,
    xLu: 0,
    yLu: 0,
    rotationDeg: Number.isFinite(placement.rotationDeg) ? placement.rotationDeg : 0,
    ...(placement.label?.trim() ? { label: placement.label.trim() } : {}),
    ...(placement.placementPreference ? { placementPreference: placement.placementPreference } : {}),
    ...(placement.zoneRole ? { zoneRole: placement.zoneRole } : {}),
  }));
}

function advanceZoneTop(
  placed: readonly MutablePlacement[],
  zoneTop: number,
  frontAudienceGapLu: number,
): number {
  if (placed.length === 0) return zoneTop;
  return Math.max(zoneTop, bottomExtentOf(placed) + frontAudienceGapLu);
}

function audienceTopCandidates(
  zoneTop: number,
  obstacleAwareZoneTop: number,
  preferObstacleAware = false,
): number[] {
  const ordered = preferObstacleAware
    ? [obstacleAwareZoneTop, zoneTop]
    : [zoneTop, obstacleAwareZoneTop];
  const out: number[] = [];
  for (const value of ordered) {
    if (!Number.isFinite(value)) continue;
    if (out.some((entry) => Math.abs(entry - value) < 1e-6)) continue;
    out.push(value);
  }
  return out;
}

type FrontStackPartition = Readonly<{
  primaryScreens: MutablePlacement[];
  stages: MutablePlacement[];
  stageDeck: MutablePlacement[];
  speakers: MutablePlacement[];
  controls: MutablePlacement[];
  otherAv: MutablePlacement[];
}>;

function partitionFrontStackItems(items: readonly MutablePlacement[]): FrontStackPartition {
  const primaryScreens: MutablePlacement[] = [];
  const stages: MutablePlacement[] = [];
  const stageDeck: MutablePlacement[] = [];
  const speakers: MutablePlacement[] = [];
  const controls: MutablePlacement[] = [];
  const otherAv: MutablePlacement[] = [];

  for (const item of items) {
    const id = item.componentId;
    if (isPrimaryScreenComponent(id)) {
      primaryScreens.push(item);
    } else if (isStageComponent(id)) {
      stages.push(item);
    } else if (isStageDeckAvComponent(id)) {
      stageDeck.push(item);
    } else if (id === "av-speaker-stack") {
      speakers.push(item);
    } else if (id === "av-foh-control") {
      controls.push(item);
    } else if (getRoomSetComponent(id)?.category === "av") {
      otherAv.push(item);
    } else {
      otherAv.push(item);
    }
  }

  primaryScreens.sort((left, right) => {
    const leftW = componentFootprint(left.componentId).w;
    const rightW = componentFootprint(right.componentId).w;
    return rightW - leftW;
  });

  return { primaryScreens, stages, stageDeck, speakers, controls, otherAv };
}

function unionRects(a: LuRect | null, b: LuRect): LuRect {
  if (!a) return b;
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

type FrontPlacementAttempt = Readonly<{
  componentId: RoomSetComponentId;
  role: string;
  xLu: number;
  yLu: number;
  label: string;
  ok: boolean;
}>;

function frontCornerCandidates(
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
): ReadonlyArray<Readonly<{ x: number; y: number; label: string }>> {
  const corners: Array<Readonly<{ corner: "topLeft" | "topRight"; label: string }>> = [
    { corner: "topLeft", label: "front-top-left" },
    { corner: "topRight", label: "front-top-right" },
  ];
  const out: Array<Readonly<{ x: number; y: number; label: string }>> = [];
  for (const { corner, label } of corners) {
    const position = edgePlacementFromCorner(corner, w, h, roomWidthLu, roomDepthLu, ROOM_EDGE_LU);
    if (position) out.push({ ...position, label });
  }
  return out;
}

function stageFlankCandidates(
  stageBox: LuRect,
  w: number,
  h: number,
  side: "left" | "right",
): ReadonlyArray<Readonly<{ x: number; y: number; label: string }>> {
  const x =
    side === "right"
      ? stageBox.x + stageBox.w + FRONT_STACK_GAP_LU
      : stageBox.x - FRONT_STACK_GAP_LU - w;
  const yAlignments: ReadonlyArray<Readonly<{ y: number; label: string }>> = [
    { y: stageBox.y + stageBox.h / 2 - h / 2, label: `stage-${side}-center` },
    { y: stageBox.y + 1, label: `stage-${side}-downstage` },
    { y: stageBox.y + stageBox.h - h - 1, label: `stage-${side}-upstage` },
  ];
  return yAlignments.map(({ y, label }) => ({ x, y, label: `${label}` }));
}

function stageDeckCandidates(
  stageBox: LuRect,
  w: number,
  h: number,
): ReadonlyArray<Readonly<{ x: number; y: number; label: string }>> {
  return [
    {
      x: stageBox.x + (stageBox.w - w) / 2,
      y: stageBox.y + stageBox.h + 0.5,
      label: "downstage-center",
    },
    {
      x: stageBox.x + stageBox.w * 0.25 - w / 2,
      y: stageBox.y + stageBox.h + 0.5,
      label: "downstage-left",
    },
    {
      x: stageBox.x + stageBox.w * 0.75 - w / 2,
      y: stageBox.y + stageBox.h + 0.5,
      label: "downstage-right",
    },
  ];
}

function frontBandScanCandidates(
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
  maxDepthLu: number,
): ReadonlyArray<Readonly<{ x: number; y: number; label: string }>> {
  const out: Array<Readonly<{ x: number; y: number; label: string }>> = [];
  const step = 2;
  const maxY = Math.min(roomDepthLu - h, maxDepthLu);
  let scanIterations = 0;
  for (let y = FRONT_EDGE_LU; y <= maxY + 1e-6; y += step) {
    for (let x = ROOM_EDGE_LU; x + w <= roomWidthLu - ROOM_EDGE_LU + 1e-6; x += step) {
      scanIterations += 1;
      if (scanIterations > MAX_SCAN_POSITIONS_PER_ITEM) return out;
      out.push({ x, y, label: `front-band-scan@${x.toFixed(1)},${y.toFixed(1)}` });
    }
  }
  return out;
}

function tryPlaceFrontItem(args: Readonly<{
  item: MutablePlacement;
  role: string;
  placed: MutablePlacement[];
  roomWidthLu: number;
  roomDepthLu: number;
  candidates: ReadonlyArray<Readonly<{ x: number; y: number; label: string }>>;
  attempts: FrontPlacementAttempt[];
}>): boolean {
  const { w, h } = componentFootprint(args.item.componentId);
  for (const candidate of args.candidates) {
    const fitsRoom = fitsExtentsInRoom(
      candidate.x,
      candidate.y,
      w,
      h,
      args.roomWidthLu,
      args.roomDepthLu,
    );
    const draft = { ...args.item, xLu: candidate.x, yLu: candidate.y };
    const ok = fitsRoom && canPlace(draft, args.placed, args.roomWidthLu, args.roomDepthLu);
    args.attempts.push({
      componentId: args.item.componentId,
      role: args.role,
      xLu: candidate.x,
      yLu: candidate.y,
      label: candidate.label,
      ok,
    });
    if (ok) {
      args.placed.push(draft);
      return true;
    }
  }
  return false;
}

function buildSupportAvCandidates(args: Readonly<{
  item: MutablePlacement;
  stageBox: LuRect | null;
  roomWidthLu: number;
  roomDepthLu: number;
  stackBottomY: number;
  preferSide: "left" | "right";
}>): ReadonlyArray<Readonly<{ x: number; y: number; label: string }>> {
  const { w, h } = componentFootprint(args.item.componentId);
  const out: Array<Readonly<{ x: number; y: number; label: string }>> = [];

  if (args.stageBox) {
    out.push(...stageFlankCandidates(args.stageBox, w, h, args.preferSide));
    out.push(...stageFlankCandidates(args.stageBox, w, h, args.preferSide === "left" ? "right" : "left"));
  }

  out.push(...frontCornerCandidates(w, h, args.roomWidthLu, args.roomDepthLu));

  const centeredY = Math.min(args.stackBottomY, args.roomDepthLu - h);
  out.push({
    x: centerX(args.roomWidthLu, w),
    y: centeredY,
    label: "front-center-below-stack",
  });

  const maxDepth = Math.max(
    args.stackBottomY + h + 8,
    args.roomDepthLu * 0.4,
    FRONT_EDGE_LU + 24,
  );
  out.push(...frontBandScanCandidates(w, h, args.roomWidthLu, args.roomDepthLu, maxDepth));

  return out;
}

function placeFrontStack(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
  frontAudienceGapLu: number,
): Readonly<{ ok: boolean; zoneTop: number; obstacleAwareZoneTop: number }> {
  console.info("[room-set/compose] front stack input", {
    count: items.length,
    objects: items.map((item) => item.componentId),
    roomWidthLu,
    roomDepthLu,
  });

  if (items.length === 0) {
    return { ok: true, zoneTop: FRONT_EDGE_LU, obstacleAwareZoneTop: FRONT_EDGE_LU };
  }

  const groups = partitionFrontStackItems(items);
  const attempts: FrontPlacementAttempt[] = [];
  let y = FRONT_EDGE_LU;
  let frontBottom = FRONT_EDGE_LU;
  let stageBox: LuRect | null = null;

  for (const screen of groups.primaryScreens) {
    const { w, h } = componentFootprint(screen.componentId);
    const x = centerX(roomWidthLu, w);
    const placedOk = tryPlaceFrontItem({
      item: screen,
      role: "primaryScreen",
      placed,
      roomWidthLu,
      roomDepthLu,
      candidates: [{ x, y, label: "front-wall-center" }],
      attempts,
    });
    if (!placedOk) {
      console.warn("[room-set/compose] front stack failed", {
        failedComponentId: screen.componentId,
        role: "primaryScreen",
        attempts: attempts.filter((entry) => entry.componentId === screen.componentId),
      });
      return { ok: false, zoneTop: y, obstacleAwareZoneTop: y };
    }
    const rect = placementRect(placed[placed.length - 1]!);
    y = rect.y + rect.h + FRONT_STACK_GAP_LU;
    frontBottom = Math.max(frontBottom, rect.y + rect.h);
  }

  for (const stage of groups.stages) {
    const { w, h } = componentFootprint(stage.componentId);
    const x = centerX(roomWidthLu, w);
    const placedOk = tryPlaceFrontItem({
      item: stage,
      role: "stage",
      placed,
      roomWidthLu,
      roomDepthLu,
      candidates: [{ x, y, label: "below-screen-center" }],
      attempts,
    });
    if (!placedOk) {
      console.warn("[room-set/compose] front stack failed", {
        failedComponentId: stage.componentId,
        role: "stage",
        attempts: attempts.filter((entry) => entry.componentId === stage.componentId),
      });
      return { ok: false, zoneTop: y, obstacleAwareZoneTop: y };
    }
    const rect = placementRect(placed[placed.length - 1]!);
    stageBox = unionRects(stageBox, rect);
    y = rect.y + rect.h + FRONT_STACK_GAP_LU;
    frontBottom = Math.max(frontBottom, rect.y + rect.h);
  }

  for (const deckItem of groups.stageDeck) {
    const { w, h } = componentFootprint(deckItem.componentId);
    const candidates =
      stageBox !== null
        ? stageDeckCandidates(stageBox, w, h)
        : [
            {
              x: centerX(roomWidthLu, w),
              y: FRONT_EDGE_LU,
              label: "front-center-no-stage",
            },
          ];
    const placedOk = tryPlaceFrontItem({
      item: deckItem,
      role: "stageDeck",
      placed,
      roomWidthLu,
      roomDepthLu,
      candidates,
      attempts,
    });
    if (!placedOk) {
      const fallbackCandidates = buildSupportAvCandidates({
        item: deckItem,
        stageBox,
        roomWidthLu,
        roomDepthLu,
        stackBottomY: y,
        preferSide: "left",
      });
      if (
        !tryPlaceFrontItem({
          item: deckItem,
          role: "stageDeck-fallback",
          placed,
          roomWidthLu,
          roomDepthLu,
          candidates: fallbackCandidates,
          attempts,
        })
      ) {
        console.warn("[room-set/compose] front stack failed", {
          failedComponentId: deckItem.componentId,
          role: "stageDeck",
          attempts: attempts.filter((entry) => entry.componentId === deckItem.componentId),
        });
        return { ok: false, zoneTop: y, obstacleAwareZoneTop: y };
      }
    }
    frontBottom = Math.max(frontBottom, bottomExtentOf(placed));
  }

  let speakerSide: "left" | "right" = "left";
  for (const speaker of groups.speakers) {
    const candidates = buildSupportAvCandidates({
      item: speaker,
      stageBox,
      roomWidthLu,
      roomDepthLu,
      stackBottomY: y,
      preferSide: speakerSide,
    });
    if (
      !tryPlaceFrontItem({
        item: speaker,
        role: "speaker",
        placed,
        roomWidthLu,
        roomDepthLu,
        candidates,
        attempts,
      })
    ) {
      console.warn("[room-set/compose] front stack failed", {
        failedComponentId: speaker.componentId,
        role: "speaker",
        attempts: attempts.filter((entry) => entry.componentId === speaker.componentId),
      });
      return { ok: false, zoneTop: y, obstacleAwareZoneTop: y };
    }
    speakerSide = speakerSide === "left" ? "right" : "left";
    frontBottom = Math.max(frontBottom, bottomExtentOf(placed));
  }

  for (const control of groups.controls) {
    const candidates = buildSupportAvCandidates({
      item: control,
      stageBox,
      roomWidthLu,
      roomDepthLu,
      stackBottomY: y,
      preferSide: "right",
    });
    if (
      !tryPlaceFrontItem({
        item: control,
        role: "control",
        placed,
        roomWidthLu,
        roomDepthLu,
        candidates,
        attempts,
      })
    ) {
      console.warn("[room-set/compose] front stack failed", {
        failedComponentId: control.componentId,
        role: "control",
        attempts: attempts.filter((entry) => entry.componentId === control.componentId),
      });
      return { ok: false, zoneTop: y, obstacleAwareZoneTop: y };
    }
    frontBottom = Math.max(frontBottom, bottomExtentOf(placed));
  }

  for (const av of groups.otherAv) {
    const candidates = buildSupportAvCandidates({
      item: av,
      stageBox,
      roomWidthLu,
      roomDepthLu,
      stackBottomY: y,
      preferSide: "left",
    });
    if (
      !tryPlaceFrontItem({
        item: av,
        role: "otherAv",
        placed,
        roomWidthLu,
        roomDepthLu,
        candidates,
        attempts,
      })
    ) {
      console.warn("[room-set/compose] front stack failed", {
        failedComponentId: av.componentId,
        role: "otherAv",
        attempts: attempts.filter((entry) => entry.componentId === av.componentId),
      });
      return { ok: false, zoneTop: y, obstacleAwareZoneTop: y };
    }
    frontBottom = Math.max(frontBottom, bottomExtentOf(placed));
  }

  const frontPlacements = placed.slice(-items.length);
  console.info("[room-set/compose] front stack placed", {
    count: frontPlacements.length,
    placements: frontPlacements.map((item) => ({
      componentId: item.componentId,
      xLu: item.xLu,
      yLu: item.yLu,
    })),
    attempts,
  });

  const zoneTop = frontBottom + frontAudienceGapLu;
  const obstacleAwareZoneTop = stageBox
    ? Math.max(FRONT_EDGE_LU, stageBox.y + frontAudienceGapLu)
    : zoneTop;

  return { ok: true, zoneTop, obstacleAwareZoneTop };
}

function audienceGridSpan(
  itemCount: number,
  cols: number,
  itemW: number,
  itemH: number,
  gapLu: number,
): Readonly<{ cols: number; rows: number; w: number; h: number }> {
  const rows = Math.ceil(itemCount / cols);
  const pitchX = itemW + gapLu;
  const pitchY = itemH + gapLu;
  return {
    cols,
    rows,
    w: (cols - 1) * pitchX + itemW,
    h: (rows - 1) * pitchY + itemH,
  };
}

function audienceGridSpanWithPitches(
  itemCount: number,
  cols: number,
  itemW: number,
  itemH: number,
  pitchX: number,
  pitchY: number,
): Readonly<{ cols: number; rows: number; w: number; h: number }> {
  const rows = Math.ceil(itemCount / cols);
  return {
    cols,
    rows,
    w: (cols - 1) * pitchX + itemW,
    h: (rows - 1) * pitchY + itemH,
  };
}

function pitchForTargetSpan(
  itemSize: number,
  slotCount: number,
  baseGapLu: number,
  bandSize: number,
  targetSpan: number,
): number {
  const basePitch = itemSize + baseGapLu;
  if (slotCount <= 1) return basePitch;
  const baseSpan = (slotCount - 1) * basePitch + itemSize;
  const desiredSpan = clampNumber(Math.max(baseSpan, targetSpan), baseSpan, bandSize);
  return Math.max(basePitch, (desiredSpan - itemSize) / (slotCount - 1));
}

function targetAudienceWidthSpan(
  band: LuBand,
  itemW: number,
  density: ComposeDensityProfile,
  audienceTopology?: LayoutSpecAudienceTopologyIntent,
  applySemanticDirectives?: ApplySemanticDirectives,
): number {
  let targetSpan = Math.max(itemW, band.w * density.targetBandFillRatio);
  if (audienceTopology?.widthBias === "wider") {
    targetSpan *= topologyIntentFieldIsExplicit(applySemanticDirectives, "widthBias") ? 1.14 : 1.08;
  }
  if (audienceTopology?.widthBias === "narrower") {
    targetSpan *= topologyIntentFieldIsExplicit(applySemanticDirectives, "widthBias") ? 0.88 : 0.92;
  }
  if (applySemanticDirectives?.packBias === "compact") {
    targetSpan *= applySemanticDirectives.packBiasStrength === "explicit" ? 0.88 : 0.94;
  } else if (applySemanticDirectives?.packBias === "loose") {
    targetSpan *= applySemanticDirectives.packBiasStrength === "explicit" ? 1.16 : 1.08;
  }
  return clampNumber(targetSpan, itemW, band.w);
}

function targetAudienceDepthSpan(
  band: LuBand,
  itemH: number,
  density: ComposeDensityProfile,
  audienceTopology?: LayoutSpecAudienceTopologyIntent,
  applySemanticDirectives?: ApplySemanticDirectives,
): number {
  let ratio = density.targetBandDepthFillRatio;
  if (audienceTopology?.depthBias === "deeper") {
    ratio *= topologyIntentFieldIsExplicit(applySemanticDirectives, "depthBias") ? 1.18 : 1.08;
  }
  if (audienceTopology?.depthBias === "shallower") {
    ratio *= topologyIntentFieldIsExplicit(applySemanticDirectives, "depthBias") ? 0.78 : 0.9;
  }
  if (applySemanticDirectives?.packBias === "compact") {
    ratio *= applySemanticDirectives.packBiasStrength === "explicit" ? 0.72 : 0.84;
  } else if (applySemanticDirectives?.packBias === "loose") {
    ratio *= applySemanticDirectives.packBiasStrength === "explicit" ? 1.22 : 1.1;
  }
  return clampNumber(Math.max(itemH, band.h * ratio), itemH, band.h);
}

function targetAudienceAreaRatio(
  density: ComposeDensityProfile,
  applySemanticDirectives?: ApplySemanticDirectives,
): number {
  let ratio = density.targetBandAreaFillRatio;
  if (applySemanticDirectives?.packBias === "compact") {
    ratio *= applySemanticDirectives.packBiasStrength === "explicit" ? 0.7 : 0.85;
  } else if (applySemanticDirectives?.packBias === "loose") {
    ratio *= applySemanticDirectives.packBiasStrength === "explicit" ? 1.25 : 1.12;
  }
  return clampNumber(ratio, 0.08, 0.75);
}

function isWideShallowGrid(cols: number, rows: number): boolean {
  if (rows <= 1) return cols >= 1;
  const ratio = cols / rows;
  return ratio >= 1.25 && ratio <= 5.5;
}

function lastRowBalanceScore(itemCount: number, cols: number, rows: number): number {
  const lastRowCount = itemCount - (rows - 1) * cols;
  if (lastRowCount >= cols) return 0;
  const balance = lastRowCount / cols;
  if (balance >= 0.55) return 0;
  return (0.55 - balance) * 40;
}

function rowCountsForTopology(itemCount: number, cols: number, rows: number): number[] {
  const counts: number[] = [];
  let remaining = itemCount;
  for (let row = 0; row < rows && remaining > 0; row += 1) {
    const take = Math.min(cols, remaining);
    counts.push(take);
    remaining -= take;
  }
  return counts;
}

/** Lower is better — rewards readable banquet rows; penalizes ragged or noisy splits. */
function scoreBanquetTopologyCoherence(rowCounts: readonly number[], itemCount: number): number {
  const rowTotal = rowCounts.length;
  if (rowTotal <= 1) return 0;

  let penalty = 0;
  const lastRow = rowCounts[rowTotal - 1] ?? 0;
  const prevRow = rowCounts[rowTotal - 2] ?? lastRow;
  const maxRow = Math.max(...rowCounts);
  const softMaxRows = Math.max(2, Math.ceil(Math.sqrt(itemCount * 1.1)));

  if (rowTotal > softMaxRows) {
    penalty += (rowTotal - softMaxRows) * 2.4;
  }

  for (let i = 0; i < rowTotal - 1; i += 1) {
    const count = rowCounts[i]!;
    if (count <= 2) penalty += (3 - count) * 3.8;
  }

  if (lastRow <= 2 && prevRow >= 4) {
    penalty += (prevRow - lastRow) * 0.65 + (3 - lastRow) * 2.4;
  } else if (rowTotal >= 3) {
    const drop = prevRow - lastRow;
    if (drop >= 4) penalty += (drop - 3) * 2.1;
    if (lastRow <= Math.max(3, maxRow * 0.38)) penalty += (maxRow - lastRow) * 0.35;
  }

  for (let i = 1; i < rowTotal; i += 1) {
    const delta = Math.abs(rowCounts[i]! - rowCounts[i - 1]!);
    if (delta > 2) penalty += (delta - 2) * 1.35;
  }

  const mean = itemCount / rowTotal;
  let spread = 0;
  for (const count of rowCounts) {
    spread += Math.abs(count - mean);
  }
  penalty += (spread / rowTotal) * 0.75;

  for (let i = 1; i < rowTotal; i += 1) {
    if (rowCounts[i]! > rowCounts[i - 1]!) {
      penalty += (rowCounts[i]! - rowCounts[i - 1]!) * 1.6;
    }
  }

  const monotonic = rowCounts.every((count, index) => index === 0 || count <= rowCounts[index - 1]!);
  if (monotonic && rowTotal >= 2 && rowTotal <= softMaxRows + 1) {
    penalty -= 1.1;
  }

  if (rowTotal >= 3) {
    const interior = rowCounts.slice(0, -1);
    const interiorSpread = interior.length > 0 ? Math.max(...interior) - Math.min(...interior) : 0;
    if (interiorSpread === 0) penalty -= 0.55;
  }

  return penalty;
}

function scoreAudienceTopologyIntentBias(
  span: Readonly<{ cols: number; rows: number; w: number; h: number }>,
  targetWidthSpan: number,
  intent: LayoutSpecAudienceTopologyIntent | undefined,
  directives?: ApplySemanticDirectives,
): number {
  if (!intent) return 0;

  let penalty = 0;

  if (intent.preferredRows != null) {
    const rowWeight = resolveSemanticDirectiveScoringWeight(directives, "preferredRows");
    const rowDelta = Math.abs(span.rows - intent.preferredRows);
    penalty += rowDelta * rowWeight;
    if (rowDelta > 0 && topologyIntentFieldIsExplicit(directives, "preferredRows")) {
      penalty += rowDelta * rowDelta * 2.5;
    }
  }

  const widthWeight = resolveSemanticDirectiveScoringWeight(directives, "widthBias");
  if (intent.widthBias === "wider") {
    penalty += Math.max(0, targetWidthSpan * 1.05 - span.w) * (0.42 * widthWeight);
    penalty -= span.w * (0.018 * widthWeight);
  } else if (intent.widthBias === "narrower") {
    penalty += Math.max(0, span.w - targetWidthSpan * 0.92) * (0.38 * widthWeight);
  }

  const depthWeight = resolveSemanticDirectiveScoringWeight(directives, "depthBias");
  if (intent.depthBias === "deeper") {
    penalty -= span.rows * (1.15 * depthWeight);
    penalty -= span.h * (0.07 * depthWeight);
    if (topologyIntentFieldIsExplicit(directives, "depthBias") && span.rows < 3) {
      penalty += (3 - span.rows) * 3.8 * depthWeight;
    }
  } else if (intent.depthBias === "shallower") {
    penalty += span.rows * (0.95 * depthWeight);
    penalty += span.h * (0.05 * depthWeight);
    if (topologyIntentFieldIsExplicit(directives, "depthBias") && span.rows > 2) {
      penalty += (span.rows - 2) * 3.2 * depthWeight;
    }
  }

  const arcWeight = resolveSemanticDirectiveScoringWeight(directives, "arcStrength");
  if (intent.arcStrength === "stronger") {
    if (span.rows < 3) penalty += (3 - span.rows) * (1.15 * arcWeight);
    const aspect = span.cols / Math.max(1, span.rows);
    if (aspect < 1.75) penalty += (1.75 - aspect) * (1.8 * arcWeight);
  } else if (intent.arcStrength === "softer") {
    if (span.rows > 2) penalty += (span.rows - 2) * (1.05 * arcWeight);
    const aspect = span.cols / Math.max(1, span.rows);
    if (aspect > 3.2) penalty += (aspect - 3.2) * (1.4 * arcWeight);
  }

  const packWeight = resolveSemanticDirectiveScoringWeight(directives, "packBias");
  if (directives?.packBias === "compact") {
    penalty += Math.max(0, span.w - targetWidthSpan * 1.02) * (0.48 * packWeight);
    penalty += Math.max(0, span.h - span.rows * 0.5) * (0.03 * packWeight);
  } else if (directives?.packBias === "loose") {
    penalty += Math.max(0, targetWidthSpan * 1.08 - span.w) * (0.55 * packWeight);
    penalty -= span.w * (0.022 * packWeight);
    penalty -= span.h * (0.035 * packWeight);
  }

  return penalty;
}

function isOversizedAudienceBand(gridW: number, gridH: number, band: LuBand): boolean {
  const bandArea = band.w * band.h;
  if (bandArea <= 0) return false;
  return (gridW * gridH) / bandArea < 0.42;
}

function scoreAudienceGridTopology(
  itemCount: number,
  span: Readonly<{ cols: number; rows: number; w: number; h: number }>,
  band: LuBand,
  targetWidthSpan: number,
  targetDepthSpan: number,
  targetAreaRatio: number,
  topologyStyle: "grid" | "arc",
  banquetCoherence = false,
  audienceTopology?: LayoutSpecAudienceTopologyIntent,
  applySemanticDirectives?: ApplySemanticDirectives,
): number {
  const widthDelta = Math.abs(span.w - targetWidthSpan);
  const depthDelta = Math.abs(span.h - targetDepthSpan);
  const targetArea = band.w * band.h * targetAreaRatio;
  const areaDelta = Math.abs(span.w * span.h - targetArea) / Math.max(1, Math.max(band.w, band.h));
  const raggedPenalty = lastRowBalanceScore(itemCount, span.cols, span.rows);
  const oversized = isOversizedAudienceBand(span.w, span.h, band);
  const fillWeight = topologyStyle === "arc" && oversized ? 0.5 : 1;
  let score = widthDelta * fillWeight + depthDelta * 1.15 + areaDelta * 0.35 + raggedPenalty;

  if (banquetCoherence) {
    score += scoreBanquetTopologyCoherence(
      rowCountsForTopology(itemCount, span.cols, span.rows),
      itemCount,
    ) * 0.72;
  }

  score += scoreAudienceTopologyIntentBias(
    span,
    targetWidthSpan,
    audienceTopology,
    applySemanticDirectives,
  );

  if (topologyStyle !== "arc" || !oversized) return score;

  const aspect = span.cols / Math.max(1, span.rows);
  const verticalSlack = band.h - span.h;

  if (span.rows === 2 && span.cols >= 8) {
    score += (span.cols - 7) * 0.8;
  }
  if (aspect > 3.6 && span.rows === 2) {
    score += (aspect - 3.6) * 1.5;
  }
  if (span.rows >= 3 && verticalSlack > span.h * 0.2) {
    score -= 2.6 + (span.rows - 2) * 0.9;
  }
  if (aspect >= 1.75 && aspect <= 3.6 && span.rows >= 3) {
    score -= 1.25;
  }

  return score;
}

function resolveAudienceGridTopology(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
  density: ComposeDensityProfile,
  topologyStyle: "grid" | "arc" = "grid",
  banquetCoherence = false,
  audienceTopology?: LayoutSpecAudienceTopologyIntent,
  applySemanticDirectives?: ApplySemanticDirectives,
): Readonly<{ cols: number; rows: number }> | null {
  if (itemCount <= 0) return { cols: 0, rows: 0 };

  const pitch = itemW + gapLu;
  const maxCols = Math.max(1, Math.floor((band.w + gapLu) / pitch));
  const targetWidthSpan = targetAudienceWidthSpan(
    band,
    itemW,
    density,
    audienceTopology,
    applySemanticDirectives,
  );
  const targetDepthSpan = targetAudienceDepthSpan(
    band,
    itemH,
    density,
    audienceTopology,
    applySemanticDirectives,
  );
  const targetAreaRatio = targetAudienceAreaRatio(density, applySemanticDirectives);
  const preferredCols = Math.max(
    1,
    Math.min(itemCount, Math.floor((targetWidthSpan - itemW) / pitch) + 1),
  );

  const candidates: number[] = [];
  const seen = new Set<number>();
  const pushCandidate = (cols: number) => {
    const clamped = Math.max(1, Math.min(itemCount, cols));
    if (seen.has(clamped)) return;
    seen.add(clamped);
    candidates.push(clamped);
  };
  pushCandidate(preferredCols);
  for (let delta = 1; delta <= maxCols; delta += 1) {
    pushCandidate(preferredCols + delta);
    pushCandidate(preferredCols - delta);
  }

  let best: Readonly<{ cols: number; rows: number; score: number }> | null = null;
  for (const cols of candidates) {
    if (cols > maxCols) continue;
    const baseSpan = audienceGridSpan(itemCount, cols, itemW, itemH, gapLu);
    const rows = baseSpan.rows;
    const pitchX = pitchForTargetSpan(itemW, cols, gapLu, band.w, targetWidthSpan);
    const pitchY = pitchForTargetSpan(itemH, rows, gapLu, band.h, targetDepthSpan);
    const span = audienceGridSpanWithPitches(itemCount, cols, itemW, itemH, pitchX, pitchY);
    if (span.w > band.w + 1e-6 || span.h > band.h + 1e-6) continue;
    if (!isWideShallowGrid(span.cols, span.rows)) continue;

    const score = scoreAudienceGridTopology(
      itemCount,
      span,
      band,
      targetWidthSpan,
      targetDepthSpan,
      targetAreaRatio,
      topologyStyle,
      banquetCoherence,
      audienceTopology,
      applySemanticDirectives,
    );
    if (!best || score < best.score) {
      best = { cols: span.cols, rows: span.rows, score };
    }
  }

  return best ? { cols: best.cols, rows: best.rows } : null;
}

type AudienceGridSlot = Readonly<{ x: number; y: number; row: number; col: number }>;
type AudienceScatterSlot = Readonly<{ x: number; y: number }>;
type BanquetPatternStyle = "structured" | "staggered" | "diagonal" | "clustered";
type AudienceScatterPattern =
  | "orderedConstellation"
  | "zoneBalanced"
  | "centerOut"
  | "stageSide"
  | "broadFootprint"
  | "lowCountCohesive";
type AudienceScatterProfile = Readonly<{
  targetWidthRatio: number;
  targetDepthRatio: number;
  separationWeight: number;
  tooFarPenalty: number;
  edgeRewardX: number;
  edgeRewardY: number;
  cornerPenalty: number;
  anchorWeight: number;
}>;

function buildAudienceGridSlots(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
  density: ComposeDensityProfile,
  topologyStyle: "grid" | "arc" = "grid",
  banquetCoherence = false,
  audienceTopology?: LayoutSpecAudienceTopologyIntent,
  applySemanticDirectives?: ApplySemanticDirectives,
): Readonly<{ cols: number; rows: number; slots: AudienceGridSlot[] }> | null {
  if (itemCount <= 0) return { cols: 0, rows: 0, slots: [] };
  if (itemW > band.w + 1e-6 || itemH > band.h + 1e-6) return null;

  const fitted = resolveAudienceGridTopology(
    itemCount,
    itemW,
    itemH,
    band,
    gapLu,
    density,
    topologyStyle,
    banquetCoherence,
    audienceTopology,
    applySemanticDirectives,
  );
  if (!fitted) return null;

  const { cols, rows: gridRows } = fitted;
  const targetWidthSpan = targetAudienceWidthSpan(
    band,
    itemW,
    density,
    audienceTopology,
    applySemanticDirectives,
  );
  const targetDepthSpan = targetAudienceDepthSpan(
    band,
    itemH,
    density,
    audienceTopology,
    applySemanticDirectives,
  );
  const pitchX = pitchForTargetSpan(itemW, cols, gapLu, band.w, targetWidthSpan);
  const pitchY = pitchForTargetSpan(itemH, gridRows, gapLu, band.h, targetDepthSpan);
  const colXs = gridColumnStartsInBand(band, itemW, pitchX, cols);
  const rowYs = gridRowStartsInBand(band, itemH, pitchY, gridRows, {
    anchorRatio: density.audienceDepthAnchorRatio,
  });
  if (!colXs || !rowYs) return null;

  const slots: AudienceGridSlot[] = [];
  let itemIndex = 0;
  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (itemIndex >= itemCount) break;
      const x = colXs[col];
      const y = rowYs[row];
      if (x === undefined || y === undefined) return null;
      slots.push({ x, y, row, col });
      itemIndex += 1;
    }
  }
  if (slots.length !== itemCount) return null;
  return { cols, rows: gridRows, slots };
}

function fractional(value: number): number {
  return value - Math.floor(value);
}

function audienceScatterProfile(itemCount: number): AudienceScatterProfile {
  if (itemCount <= 16) {
    return {
      targetWidthRatio: 0.96,
      targetDepthRatio: 0.9,
      separationWeight: 1.05,
      tooFarPenalty: 0.85,
      edgeRewardX: 1.65,
      edgeRewardY: 0.95,
      cornerPenalty: 42,
      anchorWeight: 2.2,
    };
  }
  if (itemCount <= 24) {
    return {
      targetWidthRatio: 0.98,
      targetDepthRatio: 0.92,
      separationWeight: 1.35,
      tooFarPenalty: 0.42,
      edgeRewardX: 2.5,
      edgeRewardY: 1.35,
      cornerPenalty: 20,
      anchorWeight: 1.35,
    };
  }
  return {
    targetWidthRatio: 1,
    targetDepthRatio: 0.94,
    separationWeight: 1.75,
    tooFarPenalty: 0.12,
    edgeRewardX: 4.5,
    edgeRewardY: 2.2,
    cornerPenalty: 6,
    anchorWeight: 0.25,
  };
}

function buildAudienceScatterCandidates(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  density: ComposeDensityProfile,
): AudienceScatterSlot[] {
  if (itemCount <= 0) return [];
  if (itemW > band.w + 1e-6 || itemH > band.h + 1e-6) return [];

  const usableW = Math.max(0, band.w - itemW);
  const usableH = Math.max(0, band.h - itemH);
  const originX = band.x;
  const originY = band.y;
  const scatterW = usableW;
  const scatterH = usableH;
  const candidateCount = Math.max(240, itemCount * 52);
  const candidates: AudienceScatterSlot[] = [];

  for (let index = 0; index < candidateCount; index += 1) {
    const xT = fractional(0.5 + index * 0.618033988749895);
    const yT = fractional(0.5 + index * 0.4142135623730951 + Math.floor(index / 7) * 0.031);
    const waveX = Math.sin((index + 1) * 2.399963229728653) * Math.min(1.35, usableW * 0.025);
    const waveY = Math.cos((index + 3) * 1.618033988749895) * Math.min(1.15, usableH * 0.025);
    const x = clampNumber(originX + scatterW * xT + waveX, band.x, band.x + usableW);
    const y = clampNumber(originY + scatterH * yT + waveY, band.y, band.y + usableH);
    candidates.push({ x, y });
  }

  return candidates;
}

function centerOfRect(rect: LuRect): Readonly<{ x: number; y: number }> {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function distanceBetweenPoints(
  a: Readonly<{ x: number; y: number }>,
  b: Readonly<{ x: number; y: number }>,
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function scatterFrontObstacleInfo(
  placed: readonly MutablePlacement[],
  band: LuBand,
): Readonly<{ frontBottom: number; hasFrontObstacle: boolean }> {
  const frontLimit = band.y + band.h * 0.42;
  let frontBottom = band.y;
  let hasFrontObstacle = false;
  for (const placement of placed) {
    const rect = placementRect(placement);
    if (rect.y > frontLimit) continue;
    hasFrontObstacle = true;
    frontBottom = Math.max(frontBottom, rect.y + rect.h);
  }
  return { frontBottom, hasFrontObstacle };
}

function scatterAnchorForIndex(
  itemIndex: number,
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  profile: AudienceScatterProfile,
): Readonly<{ x: number; y: number }> {
  const targetW = clampNumber(band.w * profile.targetWidthRatio, itemW, band.w);
  const targetH = clampNumber(band.h * profile.targetDepthRatio, itemH, band.h);
  const originX = band.x + Math.max(0, (band.w - targetW) / 2);
  const originY = band.y + Math.max(0, (band.h - targetH) * 0.2);
  const center = { x: band.x + band.w / 2, y: band.y + band.h / 2 };
  if (itemCount <= 1) return center;

  const angle = itemIndex * 2.399963229728653 + (itemIndex % 4) * 0.31;
  const rank = itemIndex === 0 ? 0 : itemIndex;
  const radiusRatio = Math.sqrt((rank + 0.55) / Math.max(1, itemCount));
  const ringJitter = 0.88 + fractional(itemIndex * 0.3819660112501051) * 0.2;
  const rx = Math.max(0, (targetW - itemW) / 2) * radiusRatio * ringJitter;
  const ry = Math.max(0, (targetH - itemH) / 2) * radiusRatio * (0.84 + fractional(itemIndex * 0.41421356237) * 0.24);
  const x = clampNumber(center.x + Math.cos(angle) * rx, originX + itemW / 2, originX + targetW - itemW / 2);
  const y = clampNumber(center.y + Math.sin(angle) * ry, originY + itemH / 2, originY + targetH - itemH / 2);
  return { x, y };
}

type ScatterBucket = 0 | 1 | 2;

function scatterBandBucket(value: number, min: number, size: number): ScatterBucket {
  const bucket = Math.floor(((value - min) / Math.max(1, size)) * 3);
  if (bucket <= 0) return 0;
  if (bucket >= 2) return 2;
  return 1;
}

function scoreScatterBucketCoverage(
  center: Readonly<{ x: number; y: number }>,
  band: LuBand,
  audiencePlacements: readonly MutablePlacement[],
): number {
  const xBucket = scatterBandBucket(center.x, band.x, band.w);
  const yBucket = scatterBandBucket(center.y, band.y, band.h);
  const xCounts = [0, 0, 0];
  const yCounts = [0, 0, 0];
  for (const placement of audiencePlacements) {
    const placementCenter = centerOfRect(placementRect(placement));
    xCounts[scatterBandBucket(placementCenter.x, band.x, band.w)] += 1;
    yCounts[scatterBandBucket(placementCenter.y, band.y, band.h)] += 1;
  }
  const maxX = Math.max(...xCounts);
  const minX = Math.min(...xCounts);
  const maxY = Math.max(...yCounts);
  const minY = Math.min(...yCounts);
  const coverageReward =
    (maxX - xCounts[xBucket]) * 2.2 +
    (maxY - yCounts[yBucket]) * 1.8 +
    (xCounts[xBucket] === minX ? 1.1 : 0) +
    (yCounts[yBucket] === minY ? 0.9 : 0);
  return coverageReward - (xCounts[xBucket] > maxX - 1 ? 0.6 : 0) - (yCounts[yBucket] > maxY - 1 ? 0.45 : 0);
}

function scoreScatterRowBandPenalty(
  centerY: number,
  itemH: number,
  audiencePlacements: readonly MutablePlacement[],
): number {
  let nearbyY = 0;
  let spacingEchoes = 0;
  const ys = audiencePlacements.map((placement) => centerOfRect(placementRect(placement)).y);
  for (const y of ys) {
    if (Math.abs(centerY - y) <= itemH * 0.32) nearbyY += 1;
  }
  for (let first = 0; first < ys.length; first += 1) {
    for (let second = first + 1; second < ys.length; second += 1) {
      const existingGap = Math.abs(ys[first]! - ys[second]!);
      const candidateGap = Math.min(Math.abs(centerY - ys[first]!), Math.abs(centerY - ys[second]!));
      if (existingGap > itemH * 0.9 && Math.abs(candidateGap - existingGap) <= itemH * 0.22) {
        spacingEchoes += 1;
      }
    }
  }
  return Math.max(0, nearbyY - 1) * 6.5 + Math.max(0, nearbyY - 2) * 9 + Math.min(4, spacingEchoes) * 0.9;
}

function scatterBucketCounts(
  placements: readonly MutablePlacement[],
  band: LuBand,
): Readonly<{ x: readonly number[]; y: readonly number[]; zones: readonly number[] }> {
  const x = [0, 0, 0];
  const y = [0, 0, 0];
  const zones = new Array<number>(9).fill(0);
  for (const placement of placements) {
    const center = centerOfRect(placementRect(placement));
    const xBucket = scatterBandBucket(center.x, band.x, band.w);
    const yBucket = scatterBandBucket(center.y, band.y, band.h);
    x[xBucket] += 1;
    y[yBucket] += 1;
    zones[yBucket * 3 + xBucket] += 1;
  }
  return { x, y, zones };
}

function scatterOrderedZoneQuotas(itemCount: number): readonly number[] {
  if (itemCount <= 0) return new Array<number>(9).fill(0);
  const quotas = new Array<number>(9).fill(Math.floor(itemCount / 9));
  const remainder = itemCount % 9;
  const zoneOrder = [4, 1, 3, 5, 7, 0, 2, 6, 8];
  for (let index = 0; index < remainder; index += 1) {
    quotas[zoneOrder[index]!] += 1;
  }
  return quotas;
}

function scatterZoneQuotaDeviation(
  placements: readonly MutablePlacement[],
  band: LuBand,
): number {
  if (placements.length < 9) return 0;
  const counts = scatterBucketCounts(placements, band).zones;
  const quotas = scatterOrderedZoneQuotas(placements.length);
  return counts.reduce((sum, count, index) => sum + Math.abs(count - quotas[index]!), 0);
}

function scatterDiagonalCorrelationPenalty(
  placements: readonly MutablePlacement[],
): number {
  if (placements.length < 6) return 0;
  const centers = placements.map((placement) => centerOfRect(placementRect(placement)));
  const meanX = centers.reduce((sum, center) => sum + center.x, 0) / centers.length;
  const meanY = centers.reduce((sum, center) => sum + center.y, 0) / centers.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const center of centers) {
    const dx = center.x - meanX;
    const dy = center.y - meanY;
    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }
  if (!(varianceX > 0) || !(varianceY > 0)) return 0;
  const correlation = Math.abs(covariance / Math.sqrt(varianceX * varianceY));
  return Math.max(0, correlation - 0.32) ** 2 * 80;
}

function scatterSubzoneEmptyPenalty(
  placements: readonly MutablePlacement[],
  band: LuBand,
): number {
  if (placements.length < 16) return 0;
  const subzoneColumns = 4;
  const subzoneRows = 4;
  const occupied = new Set<number>();
  for (const placement of placements) {
    const center = centerOfRect(placementRect(placement));
    const col = clampNumber(
      Math.floor(((center.x - band.x) / Math.max(1, band.w)) * subzoneColumns),
      0,
      subzoneColumns - 1,
    );
    const row = clampNumber(
      Math.floor(((center.y - band.y) / Math.max(1, band.h)) * subzoneRows),
      0,
      subzoneRows - 1,
    );
    occupied.add(row * subzoneColumns + col);
  }
  const expectedOccupied = placements.length >= 24 ? 14 : 11;
  return Math.max(0, expectedOccupied - occupied.size) * 5.5;
}

function scatterPerZoneNeighborVariancePenalty(
  placements: readonly MutablePlacement[],
  band: LuBand,
): number {
  if (placements.length < 12) return 0;
  const zoneNeighbors: number[] = [];
  for (let zone = 0; zone < 9; zone += 1) {
    const zonePlacements = placements.filter((placement) => {
      const center = centerOfRect(placementRect(placement));
      return scatterBandBucket(center.x, band.x, band.w) + scatterBandBucket(center.y, band.y, band.h) * 3 === zone;
    });
    if (zonePlacements.length < 2) continue;
    zoneNeighbors.push(scatterNearestNeighborStats(zonePlacements).mean);
  }
  if (zoneNeighbors.length < 3) return 0;
  const mean = zoneNeighbors.reduce((sum, value) => sum + value, 0) / zoneNeighbors.length;
  const variance =
    zoneNeighbors.reduce((sum, value) => sum + (value - mean) ** 2, 0) / zoneNeighbors.length;
  return variance * 0.1;
}

function scatterYBandStats(
  placements: readonly MutablePlacement[],
  itemH: number,
): Readonly<{ maxBand: number; repeatedSpacingPenalty: number }> {
  const ys = placements.map((placement) => centerOfRect(placementRect(placement)).y).sort((a, b) => a - b);
  const bands: number[][] = [];
  for (const y of ys) {
    const current = bands[bands.length - 1];
    if (!current) {
      bands.push([y]);
      continue;
    }
    const mean = current.reduce((sum, entry) => sum + entry, 0) / current.length;
    if (Math.abs(y - mean) <= itemH * 0.22) {
      current.push(y);
    } else {
      bands.push([y]);
    }
  }

  const gaps = bands
    .map((band) => band.reduce((sum, entry) => sum + entry, 0) / band.length)
    .slice(1)
    .map((y, index) => y - bands[index]!.reduce((sum, entry) => sum + entry, 0) / bands[index]!.length);
  let repeatedSpacingPenalty = 0;
  for (let index = 1; index < gaps.length; index += 1) {
    if (Math.abs(gaps[index]! - gaps[index - 1]!) <= itemH * 0.22) repeatedSpacingPenalty += 1;
  }

  return {
    maxBand: Math.max(0, ...bands.map((band) => band.length)),
    repeatedSpacingPenalty,
  };
}

function scatterNearestNeighborStats(
  placements: readonly MutablePlacement[],
): Readonly<{ min: number; max: number; mean: number; variance: number }> {
  const centers = placements.map((placement) => centerOfRect(placementRect(placement)));
  const distances: number[] = [];
  for (let index = 0; index < centers.length; index += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let otherIndex = 0; otherIndex < centers.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      nearest = Math.min(nearest, distanceBetweenPoints(centers[index]!, centers[otherIndex]!));
    }
    if (Number.isFinite(nearest)) distances.push(nearest);
  }
  if (distances.length === 0) return { min: 0, max: 0, mean: 0, variance: 0 };
  const mean = distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
  const variance =
    distances.reduce((sum, distance) => sum + (distance - mean) ** 2, 0) / distances.length;
  return {
    min: Math.min(...distances),
    max: Math.max(...distances),
    mean,
    variance,
  };
}

function scatterFootprint(
  placements: readonly MutablePlacement[],
): Readonly<{ width: number; depth: number; area: number }> {
  if (placements.length === 0) return { width: 0, depth: 0, area: 0 };
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const placement of placements) {
    const rect = placementRect(placement);
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  const width = maxX - minX;
  const depth = maxY - minY;
  return { width, depth, area: width * depth };
}

function scatterStageSideCount(
  placements: readonly MutablePlacement[],
  fixedPlacements: readonly MutablePlacement[],
  band: LuBand,
  itemW: number,
): number {
  const front = scatterFrontObstacleInfo(fixedPlacements, band);
  if (!front.hasFrontObstacle) return 0;
  const roomCenterX = band.x + band.w / 2;
  return placements.filter((placement) => {
    const rect = placementRect(placement);
    const center = centerOfRect(rect);
    return (
      center.y < front.frontBottom + rect.h * 0.65 &&
      Math.abs(center.x - roomCenterX) > itemW * 1.8
    );
  }).length;
}

function scoreCompleteScatterLayout(
  placements: readonly MutablePlacement[],
  fixedPlacements: readonly MutablePlacement[],
  band: LuBand,
  itemW: number,
  itemH: number,
  profile: AudienceScatterProfile,
): number {
  const footprint = scatterFootprint(placements);
  const buckets = scatterBucketCounts(placements, band);
  const nearest = scatterNearestNeighborStats(placements);
  const yBands = scatterYBandStats(placements, itemH);
  const occupiedZones = buckets.zones.filter((count) => count > 0).length;
  const xSpread = Math.max(...buckets.x) - Math.min(...buckets.x);
  const ySpread = Math.max(...buckets.y) - Math.min(...buckets.y);
  const targetWidth = band.w * profile.targetWidthRatio;
  const targetDepth = band.h * profile.targetDepthRatio;
  const idealNearest = clampNumber(
    Math.sqrt((targetWidth * targetDepth) / Math.max(1, placements.length)) * 0.82,
    Math.max(itemW, itemH) + 1,
    Math.max(band.w, band.h) * 0.34,
  );
  const cornerCount =
    buckets.zones[0]! + buckets.zones[2]! + buckets.zones[6]! + buckets.zones[8]!;
  const middleZoneCount = buckets.zones[4]!;
  const stageSideCount = scatterStageSideCount(placements, fixedPlacements, band, itemW);
  const quotaDeviation = scatterZoneQuotaDeviation(placements, band);
  const diagonalPenalty = scatterDiagonalCorrelationPenalty(placements);
  const emptySubzonePenalty = scatterSubzoneEmptyPenalty(placements, band);
  const zoneNeighborPenalty = scatterPerZoneNeighborVariancePenalty(placements, band);

  let score = 0;
  score += Math.min(footprint.width / Math.max(1, targetWidth), 1.12) * 28;
  score += Math.min(footprint.depth / Math.max(1, targetDepth), 1.12) * 24;
  score -= Math.max(0, targetWidth * 0.72 - footprint.width) * 0.8;
  score -= Math.max(0, targetDepth * 0.68 - footprint.depth) * 0.8;
  score += occupiedZones * 4.4;
  score -= xSpread * 3.2;
  score -= ySpread * 2.8;
  score -= Math.max(0, yBands.maxBand - 2) * 18;
  score -= yBands.repeatedSpacingPenalty * 5;
  score -= Math.abs(nearest.mean - idealNearest) * 1.6;
  score -= nearest.variance * 0.08;
  const maxNearestRatio = placements.length <= 16 ? 1.24 : placements.length <= 24 ? 1.38 : 1.55;
  const maxNearestPenalty = placements.length <= 16 ? 9 : placements.length <= 24 ? 5.4 : 3.2;
  score -= Math.max(0, nearest.max - idealNearest * maxNearestRatio) * maxNearestPenalty;
  score -= Math.max(0, idealNearest * 0.62 - nearest.min) * 5;
  score -= Math.max(0, middleZoneCount - Math.ceil(placements.length / 3)) * 4;
  score -= Math.max(0, cornerCount - Math.ceil(placements.length / 3)) * 3.5;
  score -= quotaDeviation * 6.5;
  score -= diagonalPenalty;
  score -= emptySubzonePenalty;
  score -= zoneNeighborPenalty;
  score += Math.min(stageSideCount, 2) * 4.5;
  return score;
}

function orderedConstellationZonePoint(
  zone: number,
  slotIndex: number,
  slotCount: number,
  seed: number,
  itemW: number,
  itemH: number,
  band: LuBand,
): Readonly<{ x: number; y: number }> {
  const col = zone % 3;
  const row = Math.floor(zone / 3);
  const zoneW = band.w / 3;
  const zoneH = band.h / 3;
  const zoneX = band.x + col * zoneW;
  const zoneY = band.y + row * zoneH;
  const xMin = zoneX + Math.max(itemW / 2, zoneW * 0.12);
  const xMax = zoneX + zoneW - Math.max(itemW / 2, zoneW * 0.12);
  const yMin = zoneY + Math.max(itemH / 2, zoneH * 0.12);
  const yMax = zoneY + zoneH - Math.max(itemH / 2, zoneH * 0.12);
  const zonePhase = (zone * 2 + seed) % 4;
  const anchors =
    slotCount <= 1
      ? [[0.5, 0.5]]
      : slotCount === 2
        ? zonePhase % 2 === 0
          ? [[0.32, 0.42], [0.68, 0.61]]
          : [[0.38, 0.68], [0.66, 0.34]]
        : zonePhase % 2 === 0
          ? [[0.34, 0.32], [0.7, 0.52], [0.45, 0.75], [0.62, 0.22]]
          : [[0.3, 0.58], [0.58, 0.28], [0.72, 0.72], [0.42, 0.82]];
  const anchor = anchors[slotIndex % anchors.length]!;
  let anchorX = anchor[0]!;
  let anchorY = anchor[1]!;
  if (col === 0) anchorX *= 0.82;
  if (col === 2) anchorX = 1 - (1 - anchorX) * 0.82;
  if (row === 0) anchorY *= 0.86;
  if (row === 2) anchorY = 1 - (1 - anchorY) * 0.86;
  const jitterX = (fractional((zone + 1) * 0.271828 + (slotIndex + 1) * 0.618034 + seed * 0.19) - 0.5) * zoneW * 0.08;
  const jitterY = (fractional((zone + 1) * 0.414214 + (slotIndex + 1) * 0.381966 + seed * 0.13) - 0.5) * zoneH * 0.08;
  return {
    x: clampNumber(zoneX + zoneW * anchorX + jitterX, xMin, xMax),
    y: clampNumber(zoneY + zoneH * anchorY + jitterY, yMin, yMax),
  };
}

function buildOrderedConstellationTargets(
  count: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  seed: number,
): Array<Readonly<{ x: number; y: number }>> {
  const quotas = scatterOrderedZoneQuotas(count);
  const zoneOrder = seed % 2 === 0 ? [4, 1, 3, 5, 7, 0, 2, 6, 8] : [4, 3, 5, 1, 7, 2, 0, 8, 6];
  const maxQuota = Math.max(...quotas);
  const targets: Array<Readonly<{ x: number; y: number }>> = [];
  for (let slotIndex = 0; slotIndex < maxQuota; slotIndex += 1) {
    for (const zone of zoneOrder) {
      if (slotIndex >= quotas[zone]!) continue;
      targets.push(
        orderedConstellationZonePoint(
          zone,
          slotIndex,
          quotas[zone]!,
          seed,
          itemW,
          itemH,
          band,
        ),
      );
    }
  }
  return targets.slice(0, count);
}

function scatterPatternTargetForIndex(
  pattern: AudienceScatterPattern,
  index: number,
  count: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  profile: AudienceScatterProfile,
  seed: number,
  fixedPlacements: readonly MutablePlacement[],
): Readonly<{ x: number; y: number }> {
  if (pattern === "orderedConstellation") {
    return (
      buildOrderedConstellationTargets(count, itemW, itemH, band, seed)[index] ??
      { x: band.x + band.w / 2, y: band.y + band.h / 2 }
    );
  }

  const center = { x: band.x + band.w / 2, y: band.y + band.h / 2 };
  const safeX = (x: number) => clampNumber(x, band.x + itemW / 2, band.x + band.w - itemW / 2);
  const safeY = (y: number) => clampNumber(y, band.y + itemH / 2, band.y + band.h - itemH / 2);
  const front = scatterFrontObstacleInfo(fixedPlacements, band);

  if (pattern === "zoneBalanced") {
    const zoneOrder = [4, 1, 3, 5, 7, 0, 2, 6, 8];
    const zone = zoneOrder[(index + seed * 2) % zoneOrder.length]!;
    const col = zone % 3;
    const row = Math.floor(zone / 3);
    const xJitter = (fractional((index + 1) * 0.6180339887 + seed * 0.17) - 0.5) * band.w * 0.13;
    const yJitter = (fractional((index + 1) * 0.4142135623 + seed * 0.11) - 0.5) * band.h * 0.13;
    return {
      x: safeX(band.x + ((col + 0.5) / 3) * band.w + xJitter),
      y: safeY(band.y + ((row + 0.5) / 3) * band.h + yJitter),
    };
  }

  if (pattern === "stageSide" && front.hasFrontObstacle && index < 4) {
    const side = index % 2 === 0 ? -1 : 1;
    const depthStep = Math.floor(index / 2);
    return {
      x: safeX(center.x + side * band.w * (0.28 + seed * 0.015)),
      y: safeY(front.frontBottom - itemH * 0.15 + depthStep * itemH * 1.55),
    };
  }

  const angleOffset =
    pattern === "broadFootprint"
      ? 0.52
      : pattern === "lowCountCohesive"
        ? 0.18
        : pattern === "stageSide"
          ? 0.74
          : 0;
  const angle = (index + seed * 0.37) * 2.399963229728653 + angleOffset;
  const rank = pattern === "centerOut" ? index : (index * 5 + seed * 3) % count;
  const radiusRatio = Math.sqrt((rank + 0.65) / Math.max(1, count));
  const patternScale =
    pattern === "lowCountCohesive"
      ? 0.78
      : pattern === "centerOut"
        ? 0.86
        : pattern === "broadFootprint"
          ? 1.04
          : 0.95;
  const rx = ((band.w - itemW) / 2) * profile.targetWidthRatio * radiusRatio * patternScale;
  const ry = ((band.h - itemH) / 2) * profile.targetDepthRatio * radiusRatio * patternScale;
  const waveX = Math.sin((index + 1) * (seed + 2.3)) * band.w * 0.035;
  const waveY = Math.cos((index + 2) * (seed + 1.7)) * band.h * 0.035;
  return {
    x: safeX(center.x + Math.cos(angle) * rx + waveX),
    y: safeY(center.y + Math.sin(angle) * ry + waveY),
  };
}

function buildScatterPatternTargets(
  pattern: AudienceScatterPattern,
  count: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  profile: AudienceScatterProfile,
  seed: number,
  fixedPlacements: readonly MutablePlacement[],
): Array<Readonly<{ x: number; y: number }>> {
  const targets: Array<Readonly<{ x: number; y: number }>> = [];
  for (let index = 0; index < count; index += 1) {
    targets.push(scatterPatternTargetForIndex(pattern, index, count, itemW, itemH, band, profile, seed, fixedPlacements));
  }
  return targets;
}

function scoreAudienceScatterCandidate(
  candidate: AudienceScatterSlot,
  candidateIndex: number,
  itemIndex: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  roomWidthLu: number,
  roomDepthLu: number,
  fixedPlacements: readonly MutablePlacement[],
  audiencePlacements: readonly MutablePlacement[],
  profile: AudienceScatterProfile,
  itemCount: number,
): number {
  const center = { x: candidate.x + itemW / 2, y: candidate.y + itemH / 2 };
  const roomCenter = { x: roomWidthLu / 2, y: roomDepthLu / 2 };
  const bandCenter = { x: band.x + band.w / 2, y: band.y + band.h / 2 };
  let score = 0;

  if (audiencePlacements.length === 0) {
    score -= distanceBetweenPoints(center, bandCenter) * 0.08;
  } else {
    let nearestAudience = Number.POSITIVE_INFINITY;
    for (const placement of audiencePlacements) {
      nearestAudience = Math.min(nearestAudience, distanceBetweenPoints(center, centerOfRect(placementRect(placement))));
    }
    const idealNeighborDistance = clampNumber(
      Math.sqrt((band.w * profile.targetWidthRatio * band.h * profile.targetDepthRatio) / Math.max(1, itemCount)) * 0.82,
      Math.max(itemW, itemH) + 1,
      Math.max(roomWidthLu, roomDepthLu) * 0.34,
    );
    score += Math.min(nearestAudience, idealNeighborDistance) * profile.separationWeight;
    score -= Math.max(0, nearestAudience - idealNeighborDistance) * profile.tooFarPenalty;
    score -= Math.max(0, idealNeighborDistance * 0.68 - nearestAudience) * 2.6;
  }

  let nearestFixed = Number.POSITIVE_INFINITY;
  for (const placement of fixedPlacements) {
    nearestFixed = Math.min(nearestFixed, distanceBetweenPoints(center, centerOfRect(placementRect(placement))));
  }
  if (Number.isFinite(nearestFixed)) {
    score += Math.min(nearestFixed, 36) * 0.18;
  }

  const front = scatterFrontObstacleInfo(fixedPlacements, band);
  if (front.hasFrontObstacle && candidate.y < front.frontBottom + itemH * 0.5) {
    const lateralDistance = Math.abs(center.x - roomCenter.x);
    score += Math.min(lateralDistance, roomWidthLu * 0.35) * 0.42;
  }

  const xUse = Math.abs(center.x - roomCenter.x) / Math.max(1, roomWidthLu / 2);
  const yUse = Math.abs(center.y - bandCenter.y) / Math.max(1, band.h / 2);
  const cornerness = Math.max(0, xUse - 0.72) * Math.max(0, yUse - 0.72);
  const anchor = scatterAnchorForIndex(itemIndex, itemCount, itemW, itemH, band, profile);
  score -= distanceBetweenPoints(center, anchor) * profile.anchorWeight;
  score += scoreScatterBucketCoverage(center, band, audiencePlacements);
  score -= scoreScatterRowBandPenalty(center.y, itemH, audiencePlacements);
  score += xUse * profile.edgeRewardX + yUse * profile.edgeRewardY;
  score -= cornerness * profile.cornerPenalty;
  score += fractional(candidateIndex * 0.7548776662466927) * 0.01;

  return score;
}

function buildAudienceObstacleScanCandidates(
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
): AudienceScatterSlot[] {
  const candidates: AudienceScatterSlot[] = [];
  const pitchX = Math.max(itemW + Math.max(0.35, gapLu * 0.35), itemW);
  const pitchY = Math.max(itemH + Math.max(0.35, gapLu * 0.35), itemH);
  let row = 0;
  for (let y = band.y; y + itemH <= band.y + band.h + 1e-6; y += pitchY) {
    const stagger = row % 2 === 0 ? 0 : pitchX * 0.45;
    for (let x = band.x + stagger; x + itemW <= band.x + band.w + 1e-6; x += pitchX) {
      candidates.push({ x, y });
    }
    row += 1;
  }
  return candidates;
}

function tryPlaceAudienceFromCandidates(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
  band: LuBand,
  itemW: number,
  itemH: number,
  candidates: readonly AudienceScatterSlot[],
  clearanceLu: number,
): boolean {
  const startIndex = placed.length;
  const scatterProfile = audienceScatterProfile(items.length);
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    let best: Readonly<{ draft: MutablePlacement; score: number }> | null = null;
    const fixedPlacements = placed.slice(0, startIndex);
    const audiencePlacements = placed.slice(startIndex);
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex]!;
      const draft = { ...item, xLu: candidate.x, yLu: candidate.y };
      if (!fitsExtentsInBand(candidate.x, candidate.y, itemW, itemH, band)) continue;
      if (!canPlaceWithClearance(draft, placed, roomWidthLu, roomDepthLu, clearanceLu)) continue;
      const score = scoreAudienceScatterCandidate(
        candidate,
        candidateIndex,
        itemIndex,
        itemW,
        itemH,
        band,
        roomWidthLu,
        roomDepthLu,
        fixedPlacements,
        audiencePlacements,
        scatterProfile,
        items.length,
      );
      if (!best || score > best.score) best = { draft, score };
    }
    if (!best) {
      placed.splice(startIndex);
      return false;
    }
    placed.push(best.draft);
  }
  return true;
}

function tryBuildCompleteScatterLayout(
  items: readonly MutablePlacement[],
  fixedPlacements: readonly MutablePlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
  band: LuBand,
  itemW: number,
  itemH: number,
  candidates: readonly AudienceScatterSlot[],
  targets: readonly Readonly<{ x: number; y: number }>[],
  clearanceLu: number,
  includeTargetCandidates = false,
): MutablePlacement[] | null {
  const working: MutablePlacement[] = [...fixedPlacements];
  const audience: MutablePlacement[] = [];
  const candidatePool = includeTargetCandidates
    ? [
        ...targets.map((target) => ({ x: target.x - itemW / 2, y: target.y - itemH / 2 })),
        ...candidates,
      ]
    : candidates;
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    const target = targets[itemIndex] ?? targets[targets.length - 1];
    if (!target) return null;
    let best: Readonly<{ draft: MutablePlacement; score: number }> | null = null;
    for (let candidateIndex = 0; candidateIndex < candidatePool.length; candidateIndex += 1) {
      const candidate = candidatePool[candidateIndex]!;
      const draft = { ...item, xLu: candidate.x, yLu: candidate.y };
      if (!fitsExtentsInBand(candidate.x, candidate.y, itemW, itemH, band)) continue;
      if (!canPlaceWithClearance(draft, working, roomWidthLu, roomDepthLu, clearanceLu)) continue;
      const center = { x: candidate.x + itemW / 2, y: candidate.y + itemH / 2 };
      const targetDistance = distanceBetweenPoints(center, target);
      const rowPenalty = scoreScatterRowBandPenalty(center.y, itemH, audience);
      const bucketBonus = scoreScatterBucketCoverage(center, band, audience);
      const tieBreak = fractional(candidateIndex * 0.7548776662466927) * 0.001;
      const score = -targetDistance - rowPenalty * 1.1 + bucketBonus * 0.8 + tieBreak;
      if (!best || score > best.score) best = { draft, score };
    }
    if (!best) return null;
    working.push(best.draft);
    audience.push(best.draft);
  }
  return audience;
}

type AudienceStaggeredSlot = Readonly<{ x: number; y: number; row: number; col: number }>;
type AudienceStaggeredRegion = Readonly<{
  key: "leftStage" | "rightStage" | "frontCenter" | "lowerFill";
  band: LuBand;
  targetCount: number;
  rows: number;
  anchorTop?: boolean;
}>;

function staggeredRowCounts(itemCount: number, rows: number): number[] {
  const rowCounts = Array.from({ length: rows }, () => Math.floor(itemCount / rows));
  let remainder = itemCount % rows;
  const order = Array.from({ length: rows }, (_, index) => index).sort((left, right) => {
    const center = (rows - 1) / 2;
    return Math.abs(left - center) - Math.abs(right - center);
  });
  for (const row of order) {
    if (remainder <= 0) break;
    rowCounts[row]! += 1;
    remainder -= 1;
  }
  return rowCounts;
}

function sampleStaggeredSlotsEvenly(
  slots: readonly AudienceStaggeredSlot[],
  count: number,
): AudienceStaggeredSlot[] {
  if (count <= 0 || slots.length === 0) return [];
  if (count >= slots.length) return [...slots];
  const selected: AudienceStaggeredSlot[] = [];
  const used = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const slotIndex =
      count === 1 ? Math.floor((slots.length - 1) / 2) : Math.round((index * (slots.length - 1)) / (count - 1));
    if (used.has(slotIndex)) continue;
    used.add(slotIndex);
    selected.push(slots[slotIndex]!);
  }
  for (let slotIndex = 0; selected.length < count && slotIndex < slots.length; slotIndex += 1) {
    if (used.has(slotIndex)) continue;
    used.add(slotIndex);
    selected.push(slots[slotIndex]!);
  }
  return selected;
}

function buildAudienceStaggeredSlots(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
  density: ComposeDensityProfile,
  rows: number,
  seed: number,
): AudienceStaggeredSlot[] {
  const minPitchX = itemW + Math.max(0.45, gapLu * 0.62);
  const minPitchY = itemH + Math.max(0.45, gapLu * 0.78);
  const maxCols = Math.max(1, Math.floor((band.w - itemW) / minPitchX) + 1);
  const rowCounts = staggeredRowCounts(itemCount, rows);
  const preferredCols = Math.min(maxCols, Math.max(...rowCounts) + 2);
  const widthRatio =
    density.targetBandFillRatio >= 0.74 ? 0.9 : density.targetBandFillRatio >= 0.64 ? 0.8 : 0.62;
  const depthRatio =
    density.targetBandDepthFillRatio >= 0.68 ? 0.78 : density.targetBandDepthFillRatio >= 0.5 ? 0.64 : 0.42;
  const targetWidth = clampNumber(band.w * widthRatio, itemW, band.w);
  const targetDepth = clampNumber(band.h * depthRatio, itemH, band.h);
  const pitchX =
    preferredCols <= 1 ? minPitchX : Math.max(minPitchX, (targetWidth - itemW) / Math.max(1, preferredCols - 1));
  const pitchY = rows <= 1 ? minPitchY : Math.max(minPitchY, (targetDepth - itemH) / Math.max(1, rows - 1));
  const spanH = (rows - 1) * pitchY + itemH;
  if (spanH > band.h + 1e-6) return [];

  const startY = band.y + Math.max(0, (band.h - spanH) * Math.min(0.28, density.audienceDepthAnchorRatio * 0.65));
  const rowSlots: AudienceStaggeredSlot[][] = [];
  const direction = seed % 2 === 0 ? 1 : -1;
  const phase = (seed % 3) * 0.16;

  for (let row = 0; row < rows; row += 1) {
    const y = startY + row * pitchY;
    const rowOffset = ((row % 2 === 0 ? 0 : 0.52) + direction * row * 0.16 + phase) * pitchX;
    const spanW = (preferredCols - 1) * pitchX + itemW;
    const originX = band.x + Math.max(0, (band.w - Math.min(spanW, band.w)) / 2);
    const slots: AudienceStaggeredSlot[] = [];
    for (let col = -2; col <= maxCols + 2; col += 1) {
      const x = originX + col * pitchX + rowOffset;
      if (x < band.x - 1e-6 || x + itemW > band.x + band.w + 1e-6) continue;
      slots.push({ x, y, row, col });
    }
    rowSlots.push(slots.sort((left, right) => left.x - right.x));
  }

  const selectedRows = rowSlots.map((slots, row) => {
    const count = Math.min(slots.length, Math.max(rowCounts[row] ?? 0, 0));
    if (count <= 0) return [];
    return sampleStaggeredSlotsEvenly(slots, count);
  });
  const ordered: AudienceStaggeredSlot[] = [];
  const maxRowLength = Math.max(0, ...selectedRows.map((slots) => slots.length));
  for (let colRank = 0; colRank < maxRowLength; colRank += 1) {
    for (let row = 0; row < selectedRows.length; row += 1) {
      const slot = selectedRows[row]![colRank];
      if (slot) ordered.push(slot);
    }
  }

  const selected = new Set(ordered);
  for (const slots of rowSlots) {
    for (const slot of slots) {
      if (!selected.has(slot)) ordered.push(slot);
    }
  }

  return ordered;
}

function dedupeAudienceStaggeredSlots(slots: readonly AudienceStaggeredSlot[]): AudienceStaggeredSlot[] {
  const seen = new Set<string>();
  const out: AudienceStaggeredSlot[] = [];
  for (const slot of slots) {
    const key = `${Math.round(slot.x * 4)}:${Math.round(slot.y * 4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(slot);
  }
  return out;
}

function interleaveStaggeredSlotGroups(groups: readonly AudienceStaggeredSlot[][]): AudienceStaggeredSlot[] {
  const out: AudienceStaggeredSlot[] = [];
  const maxLength = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < maxLength; index += 1) {
    for (const group of groups) {
      const slot = group[index];
      if (slot) out.push(slot);
    }
  }
  return out;
}

function frontStackObstacleRectForStaggered(
  fixedPlacements: readonly MutablePlacement[],
  band: LuBand,
): LuRect | null {
  let obstacle: LuRect | null = null;
  const frontLimit = band.y + band.h * 0.45;
  for (const placement of fixedPlacements) {
    if (!isFrontStackComponent(placement.componentId)) continue;
    const rect = placementRect(placement);
    if (rect.y > frontLimit) continue;
    obstacle = unionRects(obstacle, rect);
  }
  return obstacle;
}

function clampRegionBand(region: LuBand, parent: LuBand): LuBand | null {
  const x0 = clampNumber(region.x, parent.x, parent.x + parent.w);
  const y0 = clampNumber(region.y, parent.y, parent.y + parent.h);
  const x1 = clampNumber(region.x + region.w, parent.x, parent.x + parent.w);
  const y1 = clampNumber(region.y + region.h, parent.y, parent.y + parent.h);
  const w = x1 - x0;
  const h = y1 - y0;
  if (!(w > 0 && h > 0)) return null;
  return { x: x0, y: y0, w, h };
}

function staggeredRegionRows(
  targetCount: number,
  region: LuBand,
  itemW: number,
  itemH: number,
  gapLu: number,
): number {
  if (targetCount <= 2) return 1;
  const minPitchY = itemH + Math.max(0.45, gapLu * 0.78);
  const maxRows = Math.max(1, Math.floor((region.h - itemH) / minPitchY) + 1);
  const aspectRows = Math.round(Math.sqrt((targetCount * region.h) / Math.max(itemW, region.w)));
  return clampNumber(Math.max(1, aspectRows), 1, Math.min(targetCount, Math.max(1, maxRows)));
}

function buildStaggeredRegions(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
  density: ComposeDensityProfile,
  fixedPlacements: readonly MutablePlacement[],
): AudienceStaggeredRegion[] {
  const obstacle = frontStackObstacleRectForStaggered(fixedPlacements, band);
  if (!obstacle) return [];

  const sideGap = Math.max(1, Math.min(3, gapLu * 0.55));
  const centerSafeTop = Math.max(band.y, obstacle.y + obstacle.h + density.frontAudienceGapLu);
  const bandBottom = band.y + band.h;
  if (centerSafeTop + itemH > bandBottom + 1e-6) return [];

  const sideTarget = Math.max(1, Math.round(itemCount * 0.16));
  const frontCenterTarget = Math.max(1, Math.round(itemCount * 0.16));
  const lowerTarget = Math.max(1, itemCount - sideTarget * 2 - frontCenterTarget);
  const sideStageBottom = Math.min(bandBottom, centerSafeTop + itemH * 0.35);
  const frontCenterDepth = Math.min(
    bandBottom - centerSafeTop,
    Math.max(itemH, itemH * 2 + gapLu * 1.25),
  );
  const lowerTop = Math.min(
    bandBottom - itemH,
    centerSafeTop + Math.max(itemH + gapLu * 0.65, itemH * 1.35),
  );

  const rawRegions: Array<Omit<AudienceStaggeredRegion, "rows">> = [
    {
      key: "leftStage",
      band: {
        x: band.x,
        y: band.y,
        w: obstacle.x - sideGap - band.x,
        h: sideStageBottom - band.y,
      },
      targetCount: sideTarget,
    },
    {
      key: "rightStage",
      band: {
        x: obstacle.x + obstacle.w + sideGap,
        y: band.y,
        w: band.x + band.w - (obstacle.x + obstacle.w + sideGap),
        h: sideStageBottom - band.y,
      },
      targetCount: sideTarget,
    },
    {
      key: "frontCenter",
      band: {
        x: obstacle.x,
        y: centerSafeTop,
        w: obstacle.w,
        h: frontCenterDepth,
      },
      targetCount: frontCenterTarget,
      anchorTop: true,
    },
    {
      key: "lowerFill",
      band: {
        x: band.x,
        y: lowerTop,
        w: band.w,
        h: bandBottom - lowerTop,
      },
      targetCount: lowerTarget,
    },
  ];

  const regions: AudienceStaggeredRegion[] = [];
  for (const raw of rawRegions) {
    const nextBand = clampRegionBand(raw.band, band);
    if (!nextBand || nextBand.w + 1e-6 < itemW || nextBand.h + 1e-6 < itemH) continue;
    regions.push({
      ...raw,
      band: nextBand,
      rows: staggeredRegionRows(raw.targetCount, nextBand, itemW, itemH, gapLu),
    });
  }
  return regions;
}

function slotFitsStaggeredRegion(
  slot: AudienceStaggeredSlot,
  itemW: number,
  itemH: number,
  regions: readonly AudienceStaggeredRegion[],
): boolean {
  return regions.some((region) =>
    fitsExtentsInBand(slot.x, slot.y, itemW, itemH, region.band),
  );
}

function buildGlobalRegionAwareAudienceStaggeredSlots(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
  density: ComposeDensityProfile,
  regions: readonly AudienceStaggeredRegion[],
  rows: number,
  seed: number,
): AudienceStaggeredSlot[] {
  const minPitchX = itemW + Math.max(0.45, gapLu * 0.62);
  const minPitchY = itemH + Math.max(0.45, gapLu * 0.78);
  const maxCols = Math.max(1, Math.floor((band.w - itemW) / minPitchX) + 1);
  const maxRows = Math.max(1, Math.floor((band.h - itemH) / minPitchY) + 1);
  const targetWidthRatio =
    density.targetBandFillRatio >= 0.74 ? 0.96 : density.targetBandFillRatio >= 0.64 ? 0.9 : 0.82;
  const targetDepthRatio =
    density.targetBandDepthFillRatio >= 0.68 ? 0.86 : density.targetBandDepthFillRatio >= 0.5 ? 0.74 : 0.58;
  const preferredRows = clampNumber(Math.max(rows, rows + 1), 3, Math.min(Math.max(3, maxRows), 12));
  const targetWidth = clampNumber(band.w * targetWidthRatio, itemW, band.w);
  const targetDepth = clampNumber(band.h * targetDepthRatio, itemH, band.h);
  const preferredCols = Math.max(
    1,
    Math.min(maxCols, Math.floor((targetWidth - itemW) / minPitchX) + 1),
  );
  const pitchX =
    preferredCols <= 1 ? minPitchX : Math.max(minPitchX, (targetWidth - itemW) / Math.max(1, preferredCols - 1));
  const pitchY =
    preferredRows <= 1 ? minPitchY : Math.max(minPitchY, (targetDepth - itemH) / Math.max(1, preferredRows - 1));
  const regionStarts = regions.map((region) => region.band.y);
  const rowYs = uniqueAscendingNumbers(
    [
      ...Array.from({ length: preferredRows }, (_, row) => band.y + row * pitchY),
      ...regionStarts,
    ]
      .filter((y) => y >= band.y - 1e-6 && y + itemH <= band.y + band.h + 1e-6)
      .sort((left, right) => left - right),
    0.35,
  );
  if (rowYs.length === 0) return [];

  const direction = seed % 2 === 0 ? 1 : -1;
  const phase = (seed % 3) * 0.14;
  const spanW = (preferredCols - 1) * pitchX + itemW;
  const originX = band.x + Math.max(0, (band.w - Math.min(spanW, band.w)) / 2);
  const rowSlots = rowYs.map((y, row) => {
    const rowOffset = ((row % 2 === 0 ? 0 : 0.54) + direction * row * 0.13 + phase) * pitchX;
    const slots: AudienceStaggeredSlot[] = [];
    for (let col = -2; col <= maxCols + 2; col += 1) {
      const x = originX + col * pitchX + rowOffset;
      const slot = { x, y, row, col };
      if (!fitsExtentsInBand(x, y, itemW, itemH, band)) continue;
      if (!slotFitsStaggeredRegion(slot, itemW, itemH, regions)) continue;
      slots.push(slot);
    }
    const frontCenterRegion = regions.find((region) => region.key === "frontCenter");
    if (frontCenterRegion && y < frontCenterRegion.band.y + itemH * 0.5) {
      const bridgeGap = Math.max(0.45, gapLu * 0.62);
      const bridgeXs = [
        frontCenterRegion.band.x - itemW - bridgeGap,
        frontCenterRegion.band.x - itemW - bridgeGap - pitchX,
        frontCenterRegion.band.x + frontCenterRegion.band.w + bridgeGap,
        frontCenterRegion.band.x + frontCenterRegion.band.w + bridgeGap + pitchX,
      ];
      bridgeXs.forEach((x, bridgeIndex) => {
        const slot = { x, y, row, col: maxCols + bridgeIndex + 3 };
        if (!fitsExtentsInBand(x, y, itemW, itemH, band)) return;
        if (!slotFitsStaggeredRegion(slot, itemW, itemH, regions)) return;
        slots.push(slot);
      });
    }
    return slots.sort((left, right) => left.x - right.x);
  });

  const frontCenterRegion = regions.find((region) => region.key === "frontCenter");
  const lowerFillRegion = regions.find((region) => region.key === "lowerFill");
  type StaggeredSideSlot = Readonly<{ slot: AudienceStaggeredSlot; side: "left" | "right"; priority: number }>;
  const classifySideStageSlot = (slot: AudienceStaggeredSlot): StaggeredSideSlot | null => {
    if (!frontCenterRegion) return null;
    const centerX = slot.x + itemW / 2;
    const centerY = slot.y + itemH / 2;
    if (slot.y >= frontCenterRegion.band.y + itemH * 2.25) return null;
    if (centerX >= frontCenterRegion.band.x && centerX <= frontCenterRegion.band.x + frontCenterRegion.band.w) {
      return null;
    }
    const side = centerX < frontCenterRegion.band.x ? "left" : "right";
    const bridgeEdgeX =
      side === "left" ? frontCenterRegion.band.x : frontCenterRegion.band.x + frontCenterRegion.band.w;
    const horizontalBridgeDistance = Math.abs(centerX - bridgeEdgeX);
    const verticalBridgeDistance = Math.abs(centerY - (frontCenterRegion.band.y + itemH / 2));
    return {
      slot,
      side,
      priority: horizontalBridgeDistance + verticalBridgeDistance * 0.42,
    };
  };
  const rowHasMainField = (slots: readonly AudienceStaggeredSlot[]): boolean =>
    slots.some((slot) => {
      const centerX = slot.x + itemW / 2;
      const centerY = slot.y + itemH / 2;
      return (
        (frontCenterRegion &&
          centerX >= frontCenterRegion.band.x - 1e-6 &&
          centerX <= frontCenterRegion.band.x + frontCenterRegion.band.w + 1e-6 &&
          centerY >= frontCenterRegion.band.y - 1e-6 &&
          centerY <= frontCenterRegion.band.y + frontCenterRegion.band.h + 1e-6) ||
        (lowerFillRegion &&
          centerY >= lowerFillRegion.band.y - 1e-6 &&
          centerY <= lowerFillRegion.band.y + lowerFillRegion.band.h + 1e-6)
      );
    });
  const allSideSlots = rowSlots
    .flat()
    .map((slot) => classifySideStageSlot(slot))
    .filter((slot): slot is StaggeredSideSlot => Boolean(slot))
    .sort((left, right) => left.priority - right.priority);
  const sideCapPerSide = frontCenterRegion
    ? Math.max(1, Math.min(4, Math.round(itemCount * 0.12)))
    : 0;
  const selectedSideSlots = new Set<AudienceStaggeredSlot>();
  const sideCounts: Record<"left" | "right", number> = { left: 0, right: 0 };
  for (const entry of allSideSlots) {
    if (sideCounts[entry.side] >= sideCapPerSide) continue;
    selectedSideSlots.add(entry.slot);
    sideCounts[entry.side] += 1;
  }
  const rowCounts = staggeredRowCounts(itemCount, rowSlots.length);
  let overflow = 0;
  for (let row = 0; row < rowCounts.length; row += 1) {
    const slots = rowSlots[row] ?? [];
    if (slots.length === 0) {
      overflow += rowCounts[row] ?? 0;
      rowCounts[row] = 0;
      continue;
    }
    if (!rowHasMainField(slots)) {
      const rowY = rowYs[row] ?? band.y;
      const sideOnlyCap =
        frontCenterRegion && rowY < frontCenterRegion.band.y - itemH * 0.85 ? 0 : 2;
      const capped = Math.min(rowCounts[row] ?? 0, Math.min(sideOnlyCap, slots.length));
      overflow += (rowCounts[row] ?? 0) - capped;
      rowCounts[row] = capped;
    }
  }
  const redistributionOrder = rowCounts
    .map((_, row) => row)
    .filter((row) => rowHasMainField(rowSlots[row] ?? []))
    .sort((left, right) => {
      const center = (rowCounts.length - 1) / 2;
      return Math.abs(left - center) - Math.abs(right - center);
    });
  while (overflow > 0 && redistributionOrder.length > 0) {
    let changed = false;
    for (const row of redistributionOrder) {
      const capacity = rowSlots[row]?.length ?? 0;
      if ((rowCounts[row] ?? 0) >= capacity) continue;
      rowCounts[row]! += 1;
      overflow -= 1;
      changed = true;
      if (overflow <= 0) break;
    }
    if (!changed) break;
  }
  const selectedRows = rowSlots.map((slots, row) => {
    const count = Math.min(slots.length, Math.max(rowCounts[row] ?? 0, 0));
    if (count <= 0) return [];
    const mainSlots = slots.filter((slot) => !classifySideStageSlot(slot));
    const sideSlots = slots.filter((slot) => selectedSideSlots.has(slot));
    return sampleStaggeredSlotsEvenly([...mainSlots, ...sideSlots], count);
  });
  const primaryOrdered: AudienceStaggeredSlot[] = [];
  const maxRowLength = Math.max(0, ...selectedRows.map((slots) => slots.length));
  for (let colRank = 0; colRank < maxRowLength; colRank += 1) {
    for (let row = 0; row < selectedRows.length; row += 1) {
      const slot = selectedRows[row]![colRank];
      if (slot) primaryOrdered.push(slot);
    }
  }

  const selected = new Set(primaryOrdered);
  const acceptedSideRemainders: AudienceStaggeredSlot[] = [];
  const mainRemainders: AudienceStaggeredSlot[] = [];
  const deferredSideRemainders: AudienceStaggeredSlot[] = [];
  for (const slots of rowSlots) {
    for (const slot of slots) {
      if (selected.has(slot)) continue;
      const sideSlot = classifySideStageSlot(slot);
      if (!sideSlot) {
        mainRemainders.push(slot);
      } else if (selectedSideSlots.has(slot)) {
        acceptedSideRemainders.push(slot);
      } else {
        deferredSideRemainders.push(slot);
      }
    }
  }

  return dedupeAudienceStaggeredSlots([
    ...primaryOrdered,
    ...acceptedSideRemainders,
    ...mainRemainders,
    ...deferredSideRemainders,
  ]);
}

function buildRegionalPackedAudienceStaggeredSlots(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
  density: ComposeDensityProfile,
  fixedPlacements: readonly MutablePlacement[],
  fallbackRows: number,
  seed: number,
): AudienceStaggeredSlot[] {
  const regions = buildStaggeredRegions(itemCount, itemW, itemH, band, gapLu, density, fixedPlacements);
  if (regions.length === 0) return [];

  const groups = regions.map((region, regionIndex) => {
    const slots = buildAudienceStaggeredSlots(
      region.targetCount,
      itemW,
      itemH,
      region.band,
      gapLu,
      density,
      region.rows,
      seed + regionIndex * 7,
    );
    const primary = slots.slice(0, region.targetCount);
    if (!region.anchorTop || primary.length === 0) return primary;
    const minY = Math.min(...primary.map((slot) => slot.y));
    const yDelta = minY - region.band.y;
    return primary.map((slot) => ({ ...slot, y: slot.y - yDelta }));
  });

  const fallbackSlots = buildAudienceStaggeredSlots(
    itemCount,
    itemW,
    itemH,
    band,
    gapLu,
    density,
    fallbackRows,
    seed,
  );

  return dedupeAudienceStaggeredSlots([
    ...interleaveStaggeredSlotGroups(groups),
    ...fallbackSlots,
  ]);
}

function buildRegionAwareAudienceStaggeredSlots(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
  density: ComposeDensityProfile,
  fixedPlacements: readonly MutablePlacement[],
  fallbackRows: number,
  seed: number,
): AudienceStaggeredSlot[] {
  const regions = buildStaggeredRegions(itemCount, itemW, itemH, band, gapLu, density, fixedPlacements);
  if (regions.length === 0) return [];
  return buildGlobalRegionAwareAudienceStaggeredSlots(
    itemCount,
    itemW,
    itemH,
    band,
    gapLu,
    density,
    regions,
    fallbackRows,
    seed,
  );
}

function tryBuildAudienceStaggeredLayout(
  items: readonly MutablePlacement[],
  fixedPlacements: readonly MutablePlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  slots: readonly AudienceStaggeredSlot[],
  clearanceLu: number,
): MutablePlacement[] | null {
  const placed = [...fixedPlacements];
  const audience: MutablePlacement[] = [];
  for (const slot of slots) {
    if (audience.length >= items.length) break;
    const item = items[audience.length]!;
    const draft = { ...item, xLu: slot.x, yLu: slot.y };
    if (!fitsExtentsInBand(slot.x, slot.y, itemW, itemH, band)) continue;
    if (!canPlaceWithClearance(draft, placed, roomWidthLu, roomDepthLu, clearanceLu)) continue;
    placed.push(draft);
    audience.push(draft);
  }
  return audience.length === items.length ? audience : null;
}

function banquetPatternForAudienceStyle(style: RoomSetAudienceStyle): BanquetPatternStyle {
  switch (style) {
    case "grid":
      return "structured";
    case "loose":
      return "staggered";
    case "arc":
      return "diagonal";
    case "scattered":
      // "Scattered" is retained as a public style label, but for banquet tables it now means
      // deterministic diagonal/clustered field placement rather than random-looking scatter.
      return "diagonal";
    default:
      return "structured";
  }
}

function banquetPatternFillRatios(
  pattern: BanquetPatternStyle,
  itemCount: number,
  density: ComposeDensityProfile,
): Readonly<{ widthRatio: number; depthRatio: number }> {
  const highCount = itemCount >= 20;
  const baseWidth = density.targetBandFillRatio;
  const baseDepth = density.targetBandDepthFillRatio;
  const compactDensity = baseWidth <= 0.6 || baseDepth <= 0.4;
  switch (pattern) {
    case "structured":
      return {
        widthRatio: clampNumber(baseWidth, 0.58, highCount ? 0.86 : 0.8),
        depthRatio: clampNumber(baseDepth, 0.44, highCount ? 0.74 : 0.66),
      };
    case "staggered":
      if (compactDensity) {
        return {
          widthRatio: clampNumber(Math.max(baseWidth, highCount ? 0.66 : 0.6), 0.56, 0.76),
          depthRatio: clampNumber(Math.max(baseDepth, highCount ? 0.46 : 0.4), 0.34, 0.58),
        };
      }
      return {
        widthRatio: clampNumber(Math.max(baseWidth, highCount ? 0.82 : 0.78), 0.7, 0.9),
        depthRatio: clampNumber(Math.max(baseDepth, highCount ? 0.64 : 0.58), 0.52, 0.78),
      };
    case "diagonal":
      if (compactDensity) {
        return {
          widthRatio: clampNumber(Math.max(baseWidth, highCount ? 0.68 : 0.62), 0.58, 0.8),
          depthRatio: clampNumber(Math.max(baseDepth, highCount ? 0.5 : 0.44), 0.38, 0.64),
        };
      }
      if (baseWidth < 0.74 && baseDepth < 0.68) {
        return {
          widthRatio: clampNumber(Math.max(baseWidth, highCount ? 0.76 : 0.7), 0.66, 0.84),
          depthRatio: clampNumber(Math.max(baseDepth, highCount ? 0.6 : 0.54), 0.5, 0.72),
        };
      }
      return {
        widthRatio: clampNumber(Math.max(baseWidth, highCount ? 0.82 : 0.76), 0.72, 0.88),
        depthRatio: clampNumber(Math.max(baseDepth, highCount ? 0.78 : 0.64), 0.58, 0.92),
      };
    case "clustered":
      if (compactDensity) {
        return {
          widthRatio: clampNumber(Math.max(baseWidth, highCount ? 0.64 : 0.58), 0.54, 0.76),
          depthRatio: clampNumber(Math.max(baseDepth, highCount ? 0.46 : 0.4), 0.34, 0.6),
        };
      }
      return {
        widthRatio: clampNumber(Math.max(baseWidth, highCount ? 0.88 : 0.74), 0.68, 0.96),
        depthRatio: clampNumber(Math.max(baseDepth, highCount ? 0.7 : 0.56), 0.5, 0.86),
      };
  }
}

function banquetPatternColumnCount(
  itemCount: number,
  targetWidth: number,
  targetDepth: number,
  itemW: number,
  itemH: number,
  gapLu: number,
  band: LuBand,
  pattern: BanquetPatternStyle,
): number {
  const minPitchX = itemW + Math.max(0.45, gapLu * 0.72);
  const maxCols = Math.max(1, Math.floor((band.w - itemW) / minPitchX) + 1);
  const aspectCols = Math.ceil(Math.sqrt((itemCount * targetWidth * itemH) / Math.max(1, targetDepth * itemW)));
  const minCols =
    pattern === "diagonal"
      ? Math.min(maxCols, Math.max(3, Math.floor(Math.sqrt(itemCount))))
      : itemCount >= 20
        ? Math.min(maxCols, 5)
        : 1;
  const patternMaxCols =
    pattern === "diagonal"
      ? Math.floor(Math.sqrt(itemCount))
      : pattern === "staggered" || pattern === "clustered"
        ? Math.ceil(Math.sqrt(itemCount)) + 1
        : maxCols;
  return clampNumber(Math.max(minCols, aspectCols), 1, Math.min(itemCount, maxCols, patternMaxCols));
}

function balancedBanquetRowCounts(itemCount: number, rows: number): number[] {
  if (rows <= 0) return [];
  const counts = Array.from({ length: rows }, () => Math.floor(itemCount / rows));
  let remainder = itemCount % rows;
  for (let row = 0; row < rows && remainder > 0; row += 1) {
    counts[row]! += 1;
    remainder -= 1;
  }
  return counts;
}

function banquetPatternRowOffset(
  pattern: BanquetPatternStyle,
  row: number,
  rows: number,
  pitchX: number,
  slack: number,
): number {
  if (slack <= 0) return 0;
  if (pattern === "structured") return 0;
  if (pattern === "staggered") {
    return row % 2 === 0 ? 0 : Math.min(pitchX * 0.5, slack * 0.72);
  }
  if (pattern === "clustered") {
    const phase = row % 3 === 0 ? 0 : row % 3 === 1 ? 0.38 : -0.24;
    return clampNumber(phase * pitchX, -slack * 0.45, slack * 0.45);
  }
  const direction = rows % 2 === 0 ? 1 : -1;
  return row % 2 === 0 ? 0 : clampNumber(direction * pitchX * 0.5, -slack * 0.72, slack * 0.72);
}

function orderBanquetPatternSlots(
  slots: readonly AudienceStaggeredSlot[],
  pattern: BanquetPatternStyle,
  itemW: number,
): AudienceStaggeredSlot[] {
  if (pattern !== "diagonal") {
    return [...slots].sort((left, right) => left.row - right.row || left.col - right.col);
  }
  return [...slots].sort((left, right) => {
    const leftBand = left.row + Math.round((left.x + itemW / 2) / Math.max(1, itemW * 1.4));
    const rightBand = right.row + Math.round((right.x + itemW / 2) / Math.max(1, itemW * 1.4));
    return leftBand - rightBand || left.row - right.row || left.col - right.col;
  });
}

function selectPrimaryBanquetRowSlots(
  rowSlots: readonly AudienceStaggeredSlot[],
  rowCount: number,
  pattern: BanquetPatternStyle,
  itemW: number,
  itemH: number,
  obstacle: LuRect | null,
  band: LuBand,
  totalRows: number,
): AudienceStaggeredSlot[] {
  if (rowCount <= 0 || rowSlots.length === 0) return [];
  if (pattern === "structured") return rowSlots.slice(0, rowCount);
  const rowIndex = rowSlots[0]?.row ?? 0;
  const slidingOffset =
    rowCount < rowSlots.length
      ? pattern === "diagonal"
        ? Math.round((rowIndex / Math.max(1, totalRows - 1)) * (rowSlots.length - rowCount))
        : rowIndex % 2
      : 0;
  const slidingSelection = rowSlots.slice(slidingOffset, slidingOffset + rowCount);
  if (!obstacle) {
    return pattern === "diagonal" || pattern === "staggered"
      ? slidingSelection
      : sampleStaggeredSlotsEvenly(rowSlots, rowCount);
  }

  const safeTop = Math.max(band.y, obstacle.y + obstacle.h);
  const isFrontBand = rowSlots.some((slot) => slot.y < safeTop + itemH * 2.25);
  if (!isFrontBand) return pattern === "diagonal" ? slidingSelection : sampleStaggeredSlotsEvenly(rowSlots, rowCount);

  const obstacleCenterX = obstacle.x + obstacle.w / 2;
  const centerBlocked = rowSlots.some((slot) => slot.y < obstacle.y + obstacle.h && slot.y + itemH > obstacle.y);
  const leftSide = rowSlots
    .filter((slot) => slot.x + itemW / 2 < obstacle.x)
    .sort((left, right) => right.x - left.x);
  const rightSide = rowSlots
    .filter((slot) => slot.x + itemW / 2 > obstacle.x + obstacle.w)
    .sort((left, right) => left.x - right.x);
  const ranked = [...rowSlots].sort((left, right) => {
    const score = (slot: AudienceStaggeredSlot) => {
      const centerX = slot.x + itemW / 2;
      if (centerX >= obstacle.x && centerX <= obstacle.x + obstacle.w) {
        return (centerBlocked ? 100 : 0) + Math.abs(centerX - obstacleCenterX) * 0.08;
      }
      const edgeDistance =
        centerX < obstacle.x ? obstacle.x - centerX : centerX - (obstacle.x + obstacle.w);
      return 2 + edgeDistance;
    };
    return score(left) - score(right) || left.x - right.x;
  });
  const selected: AudienceStaggeredSlot[] = [];
  if (rowCount >= 4 && leftSide[0] && rightSide[0]) {
    selected.push(leftSide[0], rightSide[0]);
  }
  if (pattern === "diagonal") {
    for (const slot of slidingSelection) {
      if (selected.length >= rowCount) break;
      if (selected.includes(slot)) continue;
      selected.push(slot);
    }
  }
  for (const slot of ranked) {
    if (selected.length >= rowCount) break;
    if (selected.includes(slot)) continue;
    selected.push(slot);
  }
  return selected.slice(0, rowCount).sort((left, right) => left.x - right.x);
}

function buildDeterministicBanquetPatternSlots(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
  density: ComposeDensityProfile,
  pattern: BanquetPatternStyle,
  fixedPlacements: readonly MutablePlacement[],
): AudienceStaggeredSlot[] {
  if (itemCount <= 0) return [];
  if (itemW > band.w + 1e-6 || itemH > band.h + 1e-6) return [];

  const ratios = banquetPatternFillRatios(pattern, itemCount, density);
  const targetWidth = clampNumber(band.w * ratios.widthRatio, itemW, band.w);
  const targetDepth = clampNumber(band.h * ratios.depthRatio, itemH, band.h);
  const cols = banquetPatternColumnCount(itemCount, targetWidth, targetDepth, itemW, itemH, gapLu, band, pattern);
  const rows = Math.ceil(itemCount / cols);
  const minPitchX = itemW + Math.max(0.45, gapLu * 0.72);
  const minPitchY = itemH + Math.max(0.45, gapLu * 0.78);
  const maxSlotCols = Math.max(1, Math.floor((band.w - itemW) / minPitchX) + 1);
  const slotCols = pattern === "structured" ? cols : Math.min(maxSlotCols, cols + 1);
  const pitchX = pitchForTargetSpan(itemW, slotCols, minPitchX - itemW, band.w, targetWidth);
  const pitchY = pitchForTargetSpan(itemH, rows, minPitchY - itemH, band.h, targetDepth);
  const spanH = (rows - 1) * pitchY + itemH;
  if (spanH > band.h + 1e-6) return [];

  const rowCounts = balancedBanquetRowCounts(itemCount, rows);
  const anchorRatio =
    pattern === "structured" ? density.audienceDepthAnchorRatio : Math.min(0.12, density.audienceDepthAnchorRatio);
  const startY = band.y + Math.max(0, (band.h - spanH) * anchorRatio);
  const obstacle = pattern === "structured" ? null : frontStackObstacleRectForStaggered(fixedPlacements, band);
  const primarySlots: AudienceStaggeredSlot[] = [];
  const reserveSlots: AudienceStaggeredSlot[] = [];

  for (let row = 0; row < rows; row += 1) {
    const rowCount = rowCounts[row] ?? 0;
    const rowCapacity =
      pattern === "structured"
        ? rowCount
        : Math.min(slotCols, Math.max(cols, rowCount + 1));
    const fullRowSpan = (rowCapacity - 1) * pitchX + itemW;
    const rowWidth = Math.min(fullRowSpan, band.w);
    const baseX = band.x + (band.w - rowWidth) / 2;
    const y = startY + row * pitchY;
    const slack = Math.max(0, band.w - rowWidth);
    const offset = banquetPatternRowOffset(pattern, row, rows, pitchX, slack);
    const rowSlots: AudienceStaggeredSlot[] = [];

    for (let col = 0; col < rowCapacity; col += 1) {
      let x = baseX + col * pitchX + offset;
      if (x + itemW > band.x + band.w + 1e-6) x -= Math.min(offset, x + itemW - (band.x + band.w));
      if (!fitsExtentsInBand(x, y, itemW, itemH, band)) continue;
      rowSlots.push({ x, y, row, col });
    }

    const selected = selectPrimaryBanquetRowSlots(
      rowSlots,
      Math.min(rowCount, rowSlots.length),
      pattern,
      itemW,
      itemH,
      obstacle,
      band,
      rows,
    );
    primarySlots.push(...selected);
    const selectedSet = new Set(selected);
    reserveSlots.push(...rowSlots.filter((slot) => !selectedSet.has(slot)));
  }

  const overflowRows = Math.min(2, Math.max(0, Math.floor((band.y + band.h - (startY + spanH)) / Math.max(1, pitchY))));
  for (let overflow = 0; overflow < overflowRows; overflow += 1) {
    const row = rows + overflow;
    const y = startY + row * pitchY;
    const rowCapacity = cols;
    const spanW = (rowCapacity - 1) * pitchX + itemW;
    if (spanW > band.w + 1e-6 || y + itemH > band.y + band.h + 1e-6) continue;
    const slack = Math.max(0, band.w - spanW);
    const baseX = band.x + slack / 2;
    const offset = banquetPatternRowOffset(pattern, row, rows + overflowRows, pitchX, slack);
    for (let col = 0; col < rowCapacity; col += 1) {
      const x = baseX + col * pitchX + offset;
      if (!fitsExtentsInBand(x, y, itemW, itemH, band)) continue;
      reserveSlots.push({ x, y, row, col });
    }
  }

  return dedupeAudienceStaggeredSlots([
    ...orderBanquetPatternSlots(primarySlots, pattern, itemW),
    ...orderBanquetPatternSlots(reserveSlots, pattern, itemW),
  ]);
}

type BanquetVisualQualityGateResult = Readonly<{
  ok: boolean;
  metrics: BanquetTableVisualQualityMetrics;
  demand: number;
  reasons: readonly string[];
  score: number;
}>;

function mutablePlacementsForVisualQuality(
  placements: readonly MutablePlacement[],
): RoomSetLayoutPlacement[] {
  return placements.map((placement) => ({
    componentId: placement.componentId,
    xLu: placement.xLu,
    yLu: placement.yLu,
    rotationDeg: placement.rotationDeg,
    ...(placement.label ? { label: placement.label } : {}),
    ...(placement.placementPreference ? { placementPreference: placement.placementPreference } : {}),
    ...(placement.zoneRole ? { zoneRole: placement.zoneRole } : {}),
  }));
}

type TheaterRowPatternStyle = "structured" | "chevron" | "diagonal";

type TheaterVisualQualityGateResult = Readonly<{
  ok: boolean;
  metrics: RowAudienceVisualQualityMetrics;
  reasons: readonly string[];
  score: number;
}>;

type TownHallVisualQualityGateResult = Readonly<{
  ok: boolean;
  metrics: TownHallAudienceVisualQualityMetrics;
  reasons: readonly string[];
  score: number;
}>;

function scoreTheaterVisualQuality(
  metrics: RowAudienceVisualQualityMetrics,
  pattern: TheaterRowPatternStyle,
): number {
  const topologyScore =
    pattern === "diagonal"
      ? metrics.diagonalCoherenceScore * 0.56 + metrics.rowCoherenceScore * 0.44
      : pattern === "chevron"
        ? metrics.rowCoherenceScore * 0.58 + metrics.aisleCoherenceScore * 0.42
      : metrics.rowCoherenceScore;
  return (
    topologyScore * 32 +
    metrics.frontBackContinuityScore * 20 +
    metrics.aisleCoherenceScore * 14 +
    metrics.focalAlignmentScore * 14 +
    metrics.leftRightBalanceScore * 12 +
    metrics.frontClearanceScore * 10 -
    metrics.deadZoneRatio * 14
  );
}

function evaluateTheaterVisualQuality(
  placements: readonly MutablePlacement[],
  ctx: ComposeContext,
  pattern: TheaterRowPatternStyle,
): TheaterVisualQualityGateResult {
  const metrics = analyzeTheaterAudienceVisualQuality(
    mutablePlacementsForVisualQuality(placements),
    { widthLu: ctx.roomWidthLu, depthLu: ctx.roomDepthLu },
  );
  const reasons: string[] = [];
  const mediumCount = metrics.rowCount >= 6;
  const highCount = metrics.rowCount >= 10;

  if (metrics.rowCount <= 0) reasons.push("missing_theater_rows");
  if (mediumCount && metrics.frontClearanceScore < 0.32) reasons.push("front_clearance");
  if (mediumCount && metrics.focalAlignmentScore < 0.68) reasons.push("focal_alignment");
  if (pattern === "structured" && mediumCount && metrics.rowCoherenceScore < 0.72) {
    reasons.push("theater_row_coherence");
  }
  if (pattern === "chevron" && mediumCount && metrics.aisleCoherenceScore < 0.48) {
    reasons.push("theater_chevron_center_gap");
  }
  if (pattern === "diagonal" && mediumCount && metrics.diagonalCoherenceScore < 0.42) {
    reasons.push("theater_diagonal_coherence");
  }
  if (highCount && metrics.frontBackContinuityScore < 0.46) reasons.push("front_back_continuity");
  if (highCount && metrics.leftRightBalanceScore < 0.58) reasons.push("left_right_balance");
  if (
    highCount &&
    (isTownHallContext(ctx) || isTheaterCenterAisleContext(ctx)) &&
    metrics.aisleCoherenceScore < 0.34
  ) {
    reasons.push("aisle_coherence");
  }
  if (highCount && metrics.deadZoneRatio > 0.78) reasons.push("dead_zone_ratio");

  return {
    ok: reasons.length === 0,
    metrics,
    reasons,
    score: scoreTheaterVisualQuality(metrics, pattern),
  };
}

function scoreTownHallVisualQuality(
  metrics: TownHallAudienceVisualQualityMetrics,
  pattern: TheaterRowPatternStyle,
): number {
  return (
    scoreTheaterVisualQuality(metrics, pattern) +
    metrics.qaAccessScore * 20 +
    metrics.frontZoneUsabilityScore * 14
  );
}

function evaluateTownHallVisualQuality(
  placements: readonly MutablePlacement[],
  ctx: ComposeContext,
  pattern: TheaterRowPatternStyle,
): TownHallVisualQualityGateResult {
  const metrics = analyzeTownHallAudienceVisualQuality(
    mutablePlacementsForVisualQuality(placements),
    { widthLu: ctx.roomWidthLu, depthLu: ctx.roomDepthLu },
  );
  const base = evaluateTheaterVisualQuality(placements, ctx, pattern);
  const reasons = [...base.reasons];
  const mediumCount = metrics.rowCount >= 6;

  const expectsParticipationAisle = isTheaterCenterAisleContext(ctx);
  if (mediumCount && expectsParticipationAisle && metrics.qaAccessScore < 0.58) reasons.push("town_hall_qa_access");
  if (mediumCount && metrics.frontZoneUsabilityScore < 0.62) reasons.push("town_hall_front_zone");
  if (mediumCount && expectsParticipationAisle && metrics.aisleCoherenceScore < 0.46) {
    reasons.push("town_hall_participation_aisle");
  }

  return {
    ok: reasons.length === 0,
    metrics,
    reasons,
    score: scoreTownHallVisualQuality(metrics, pattern),
  };
}

function theaterRowPatternForContext(ctx: ComposeContext): TheaterRowPatternStyle {
  if (ctx.audienceStyle === "loose") return "chevron";
  if (ctx.audienceStyle === "arc") return "diagonal";
  return "structured";
}

function isTownHallContext(ctx: ComposeContext): boolean {
  return ctx.layoutType === "theater" && ctx.eventIntent === "town_hall";
}

function isTheaterCenterAisleContext(ctx: ComposeContext): boolean {
  return ctx.layoutType === "theater" && ctx.audienceStyle === "scattered";
}

function shouldUsePresetTheaterRows(rows: readonly MutablePlacement[], ctx: ComposeContext): boolean {
  return (
    ctx.layoutType === "theater" &&
    !(isTownHallContext(ctx) && ctx.audienceStyle === "grid") &&
    rows.length > 0 &&
    rows.every((row) => row.componentId === "seating-theater-row")
  );
}

function evaluatePresetTheaterRows(
  placements: readonly MutablePlacement[],
  ctx: ComposeContext,
  pattern: TheaterRowPatternStyle,
): TheaterVisualQualityGateResult | TownHallVisualQualityGateResult {
  return isTownHallContext(ctx) && (isTheaterCenterAisleContext(ctx) || ctx.audienceStyle === "loose")
    ? evaluateTownHallVisualQuality(placements, ctx, pattern)
    : evaluateTheaterVisualQuality(placements, ctx, pattern);
}

function scoreBanquetVisualQuality(
  metrics: BanquetTableVisualQualityMetrics,
  demand: number,
  pattern: BanquetPatternStyle,
): number {
  const topologyScore =
    pattern === "structured"
      ? metrics.rowCoherenceScore
      : metrics.diagonalCoherenceScore * 0.64 + metrics.rowCoherenceScore * 0.36;
  return (
    topologyScore * 34 +
    metrics.frontBackContinuityScore * 20 +
    metrics.leftRightBalanceScore * 14 +
    metrics.fieldDensityRatio * 10 +
    (metrics.stageSideUtilizationScore * 20 + metrics.frontBandCoverageScore * 10) * demand -
    metrics.isolatedTableCount * 18 -
    metrics.deadZoneRatio * 14
  );
}

function evaluateBanquetVisualQuality(
  placements: readonly MutablePlacement[],
  ctx: ComposeContext,
  pattern: BanquetPatternStyle,
): BanquetVisualQualityGateResult {
  const room = { widthLu: ctx.roomWidthLu, depthLu: ctx.roomDepthLu };
  const layoutPlacements = mutablePlacementsForVisualQuality(placements);
  const metrics = analyzeBanquetTableVisualQuality(layoutPlacements, room);
  const demand = banquetTableVisualOpportunityDemand(layoutPlacements, room);
  const reasons: string[] = [];
  const mediumCount = metrics.tableCount >= 16;
  const highCount = metrics.tableCount >= 22;
  const requiresLateralOpportunityUse = pattern !== "structured";

  if (highCount && metrics.isolatedTableCount > 0) {
    reasons.push("isolated_tables_high_count");
  } else if (mediumCount && metrics.isolatedTableCount > 1) {
    reasons.push("isolated_tables_medium_count");
  }

  if (highCount && metrics.frontBackContinuityScore < 0.38) {
    reasons.push("front_back_continuity");
  }

  if (pattern === "structured" && mediumCount && metrics.rowCoherenceScore < 0.72) {
    reasons.push("structured_row_coherence");
  }

  if (
    (pattern === "staggered" || pattern === "diagonal" || pattern === "clustered") &&
    highCount &&
    metrics.diagonalCoherenceScore < 0.5
  ) {
    reasons.push("diagonal_coherence");
  }

  if (highCount && demand >= 0.55 && metrics.leftRightBalanceScore < 0.56) {
    reasons.push("left_right_balance");
  }

  if (requiresLateralOpportunityUse && highCount && demand >= 0.55 && metrics.stageSideUtilizationScore < 0.42) {
    reasons.push("stage_side_utilization");
  }

  if (requiresLateralOpportunityUse && highCount && demand >= 0.55 && metrics.frontBandCoverageScore < 0.42) {
    reasons.push("front_band_coverage");
  }

  if (highCount && demand >= 0.55 && metrics.deadZoneRatio > 0.76) {
    reasons.push("dead_zone_ratio");
  }

  return {
    ok: reasons.length === 0,
    metrics,
    demand,
    reasons,
    score: scoreBanquetVisualQuality(metrics, demand, pattern),
  };
}

function buildDeterministicBanquetPatternCandidate(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
  pattern: BanquetPatternStyle,
): MutablePlacement[] | null {
  if (items.length === 0) return [];
  const sample = componentFootprint(items[0]!.componentId);
  const band = audiencePackBand(ctx.roomWidthLu, ctx.roomDepthLu, audienceTop, ctx.density);
  const slots = buildDeterministicBanquetPatternSlots(
    items.length,
    sample.w,
    sample.h,
    band,
    gapLu,
    ctx.density,
    pattern,
    placed,
  );
  if (slots.length === 0) return null;
  const clearances = [Math.max(0.2, gapLu * 0.45), Math.max(0.1, gapLu * 0.22), 0];
  for (const clearance of clearances) {
    const candidate = tryBuildAudienceStaggeredLayout(
      items,
      placed,
      ctx.roomWidthLu,
      ctx.roomDepthLu,
      sample.w,
      sample.h,
      band,
      slots,
      clearance,
    );
    if (!candidate) continue;
    return candidate;
  }
  return null;
}

function placeDeterministicBanquetTablesAdaptive(
  tables: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
  label: string,
  audienceTops: readonly number[],
): AudiencePlacementAdjustment {
  if (tables.length === 0) return { ok: true, placedCount: 0, warnings: [] };

  const pattern = banquetPatternForAudienceStyle(effectiveBanquetAudienceStyle(ctx.layoutType, ctx.audienceStyle));
  const minGap = Math.max(0, Math.min(gapLu, 0.5));
  const gapCandidates = uniqueDescendingNumbers([
    gapLu,
    Math.max(minGap, gapLu - 0.75),
    minGap,
  ]);
  const originalCapacity = capacityForPlacements(tables);

  for (let placedCount = tables.length; placedCount >= 1; placedCount -= 1) {
    const subset = tables.slice(0, placedCount);
    let best: Readonly<{
      candidate: MutablePlacement[];
      gate: BanquetVisualQualityGateResult;
      gapLu: number;
      audienceTop: number;
    }> | null = null;
    const topCandidates =
      pattern === "diagonal" && placedCount < 20
        ? [...audienceTops].sort((left, right) => right - left)
        : audienceTops;
    for (const candidateGap of gapCandidates) {
      for (const candidateTop of topCandidates) {
        const candidate = buildDeterministicBanquetPatternCandidate(
          subset,
          placed,
          ctx,
          candidateTop,
          candidateGap,
          pattern,
        );
        if (!candidate) continue;
        const gate = evaluateBanquetVisualQuality([...placed, ...candidate], ctx, pattern);
        if (!gate.ok) continue;
        if (placedCount < 22) {
          placed.push(...candidate);
          const warnings = buildAudienceAdjustmentWarnings({
            label,
            originalCount: tables.length,
            placedCount,
            originalCapacity,
            placedCapacity: capacityForPlacements(subset),
            spacingAdjusted: candidateGap !== gapLu,
            topologyAdjusted: Math.abs(candidateTop - audienceTop) > 1e-6,
          });
          return { ok: true, placedCount, warnings };
        }
        if (!best || gate.score > best.gate.score) {
          best = { candidate, gate, gapLu: candidateGap, audienceTop: candidateTop };
        }
      }
    }
    if (best) {
      placed.push(...best.candidate);
      const warnings = buildAudienceAdjustmentWarnings({
        label,
        originalCount: tables.length,
        placedCount,
        originalCapacity,
        placedCapacity: capacityForPlacements(subset),
        spacingAdjusted: best.gapLu !== gapLu,
        topologyAdjusted: Math.abs(best.audienceTop - audienceTop) > 1e-6,
      });
      return { ok: true, placedCount, warnings };
    }
  }

  return { ok: false, placedCount: 0, warnings: [] };
}

function staggeredAlignedColumnPenalty(placements: readonly MutablePlacement[], itemW: number): number {
  const tolerance = Math.max(0.75, itemW * 0.18);
  const columns: number[] = [];
  for (const placement of placements) {
    const center = centerOfRect(placementRect(placement)).x;
    const column = columns.findIndex((entry) => Math.abs(entry - center) <= tolerance);
    if (column >= 0) {
      columns[column] = (columns[column]! + center) / 2;
    } else {
      columns.push(center);
    }
  }
  return Math.max(0, placements.length - columns.length * 1.35);
}

function staggeredFrontCenterCount(
  placements: readonly MutablePlacement[],
  fixedPlacements: readonly MutablePlacement[],
  band: LuBand,
  itemW: number,
  itemH: number,
  density: ComposeDensityProfile,
): number {
  const obstacle = frontStackObstacleRectForStaggered(fixedPlacements, band);
  if (!obstacle) return 0;
  const safeTop = Math.max(band.y, obstacle.y + obstacle.h + density.frontAudienceGapLu);
  const safeBottom = Math.min(band.y + band.h, safeTop + itemH * 2.5);
  let count = 0;
  for (const placement of placements) {
    const rect = placementRect(placement);
    const center = centerOfRect(rect);
    if (rect.y + 1e-6 < safeTop || rect.y > safeBottom + 1e-6) continue;
    if (center.x + 1e-6 < obstacle.x || center.x > obstacle.x + obstacle.w + 1e-6) continue;
    if (rect.x + itemW <= obstacle.x || rect.x >= obstacle.x + obstacle.w) continue;
    count += 1;
  }
  return count;
}

type StaggeredContinuityMetrics = Readonly<{
  sideCount: number;
  mainCount: number;
  isolatedSideCount: number;
  averageSideBridgeDistance: number;
  maxSideBridgeDistance: number;
  sideToMainDensityRatio: number;
}>;

function averageNearestDistance(points: readonly Readonly<{ x: number; y: number }>[]): number {
  if (points.length <= 1) return 0;
  let total = 0;
  let count = 0;
  for (let index = 0; index < points.length; index += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    const current = points[index]!;
    for (let otherIndex = 0; otherIndex < points.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const other = points[otherIndex]!;
      nearest = Math.min(nearest, Math.hypot(current.x - other.x, current.y - other.y));
    }
    if (!Number.isFinite(nearest)) continue;
    total += nearest;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function staggeredContinuityMetrics(
  placements: readonly MutablePlacement[],
  fixedPlacements: readonly MutablePlacement[],
  band: LuBand,
  itemW: number,
  itemH: number,
  density: ComposeDensityProfile,
): StaggeredContinuityMetrics {
  const obstacle = frontStackObstacleRectForStaggered(fixedPlacements, band);
  if (!obstacle) {
    return {
      sideCount: 0,
      mainCount: placements.length,
      isolatedSideCount: 0,
      averageSideBridgeDistance: 0,
      maxSideBridgeDistance: 0,
      sideToMainDensityRatio: 1,
    };
  }

  const safeTop = Math.max(band.y, obstacle.y + obstacle.h + density.frontAudienceGapLu);
  const sideMaxY = safeTop + itemH * 2.25;
  const sidePoints: Array<Readonly<{ x: number; y: number }>> = [];
  const mainPoints: Array<Readonly<{ x: number; y: number }>> = [];
  for (const placement of placements) {
    const rect = placementRect(placement);
    const center = centerOfRect(rect);
    const sideStage =
      rect.y < sideMaxY &&
      (center.x < obstacle.x - 1e-6 || center.x > obstacle.x + obstacle.w + 1e-6);
    if (sideStage) {
      sidePoints.push(center);
    } else {
      mainPoints.push(center);
    }
  }

  if (sidePoints.length === 0 || mainPoints.length === 0) {
    return {
      sideCount: sidePoints.length,
      mainCount: mainPoints.length,
      isolatedSideCount: sidePoints.length,
      averageSideBridgeDistance: 0,
      maxSideBridgeDistance: 0,
      sideToMainDensityRatio: 1,
    };
  }

  const bridgeDistances = sidePoints.map((sidePoint) =>
    Math.min(
      ...mainPoints.map((mainPoint) => Math.hypot(sidePoint.x - mainPoint.x, sidePoint.y - mainPoint.y)),
    ),
  );
  const averageSideBridgeDistance =
    bridgeDistances.reduce((sum, distance) => sum + distance, 0) / bridgeDistances.length;
  const maxSideBridgeDistance = Math.max(...bridgeDistances);
  const isolatedSideThreshold = itemW * 2.65;
  const isolatedSideCount = bridgeDistances.filter((distance) => distance > isolatedSideThreshold).length;
  const sideNearest = averageNearestDistance(sidePoints);
  const mainNearest = averageNearestDistance(mainPoints);
  const sideToMainDensityRatio =
    sideNearest > 0 && mainNearest > 0 ? sideNearest / mainNearest : 1;

  return {
    sideCount: sidePoints.length,
    mainCount: mainPoints.length,
    isolatedSideCount,
    averageSideBridgeDistance,
    maxSideBridgeDistance,
    sideToMainDensityRatio,
  };
}

function scoreAudienceStaggeredLayout(
  placements: readonly MutablePlacement[],
  fixedPlacements: readonly MutablePlacement[],
  band: LuBand,
  itemW: number,
  itemH: number,
  density: ComposeDensityProfile,
): number {
  const footprint = scatterFootprint(placements);
  const stageSideCount = scatterStageSideCount(placements, fixedPlacements, band, itemW);
  const frontCenterCount = staggeredFrontCenterCount(placements, fixedPlacements, band, itemW, itemH, density);
  const continuity = staggeredContinuityMetrics(placements, fixedPlacements, band, itemW, itemH, density);
  const rowBands = scatterYBandStats(placements, itemH);
  const widthRatio =
    density.targetBandFillRatio >= 0.74 ? 0.9 : density.targetBandFillRatio >= 0.64 ? 0.8 : 0.62;
  const depthRatio =
    density.targetBandDepthFillRatio >= 0.68 ? 0.78 : density.targetBandDepthFillRatio >= 0.5 ? 0.64 : 0.42;
  const targetWidth = band.w * widthRatio;
  const targetDepth = band.h * depthRatio;
  const expectedRows = Math.max(2, Math.round(Math.sqrt(placements.length)));
  let score = 0;
  score += Math.min(footprint.width / Math.max(1, targetWidth), 1.12) * 30;
  score += Math.min(footprint.depth / Math.max(1, targetDepth), 1.1) * 20;
  score -= Math.max(0, targetWidth * 0.72 - footprint.width) * 0.7;
  score -= Math.max(0, targetDepth * 0.62 - footprint.depth) * 0.65;
  score += Math.min(stageSideCount, 6) * 4.2;
  score += Math.min(frontCenterCount, 5) * 5.2;
  if (frontCenterCount === 0 && frontStackObstacleRectForStaggered(fixedPlacements, band)) score -= 12;
  if (continuity.sideCount > 0 && continuity.mainCount > 0) {
    const comfortableBridge = itemW * 2.15;
    score += Math.max(0, comfortableBridge - continuity.averageSideBridgeDistance) * 0.9;
    score -= Math.max(0, continuity.averageSideBridgeDistance - itemW * 2.45) * 1.1;
    score -= Math.max(0, continuity.maxSideBridgeDistance - itemW * 3.15) * 0.75;
  }
  score -= continuity.isolatedSideCount * 7.5;
  score -= Math.max(0, 0.82 - continuity.sideToMainDensityRatio) * 28;
  score -= Math.max(0, rowBands.maxBand - Math.ceil(placements.length / expectedRows)) * 1.4;
  score -= staggeredAlignedColumnPenalty(placements, itemW) * 4.8;
  return score;
}

function placeAudienceStaggered(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
): boolean {
  if (items.length === 0) return true;
  const { roomWidthLu, roomDepthLu, density } = ctx;
  const sample = componentFootprint(items[0]!.componentId);
  const itemW = sample.w;
  const itemH = sample.h;
  const useRegionAwareSlots = isBanquetTableComponent(items[0]!.componentId);
  const band = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
  if (itemW > band.w + 1e-6 || itemH > band.h + 1e-6) return false;

  const baseRows = Math.max(
    2,
    Math.min(items.length, Math.round(Math.sqrt((items.length * band.h) / Math.max(1, band.w)))),
  );
  const rowCandidates = uniqueDescendingNumbers([
    baseRows + 2,
    baseRows + 1,
    baseRows,
    baseRows - 1,
    4,
    3,
  ]).filter((rows) => rows >= 2 && rows <= Math.min(items.length, 8));
  const clearances = [Math.max(0.2, gapLu * 0.45), Math.max(0.1, gapLu * 0.22), 0];

  const findBestPlacements = (
    slotMode: "global-region-aware" | "regional-packed" | "single-band",
  ): MutablePlacement[] | null => {
    let bestPlacements: MutablePlacement[] | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const clearance of clearances) {
      for (const rows of rowCandidates) {
        for (let seed = 0; seed < 6; seed += 1) {
          let slots: AudienceStaggeredSlot[] = [];
          if (slotMode === "global-region-aware") {
            slots = buildRegionAwareAudienceStaggeredSlots(
                items.length,
                itemW,
                itemH,
                band,
                gapLu,
                density,
                placed,
                rows,
                seed,
              );
          } else if (slotMode === "regional-packed") {
            slots = buildRegionalPackedAudienceStaggeredSlots(
              items.length,
              itemW,
              itemH,
              band,
              gapLu,
              density,
              placed,
              rows,
              seed,
            );
          } else {
            slots = buildAudienceStaggeredSlots(items.length, itemW, itemH, band, gapLu, density, rows, seed);
          }
          if (slots.length === 0) continue;
          const candidate = tryBuildAudienceStaggeredLayout(
            items,
            placed,
            roomWidthLu,
            roomDepthLu,
            itemW,
            itemH,
            band,
            slots,
            clearance,
          );
          if (!candidate) continue;
          const score = scoreAudienceStaggeredLayout(candidate, placed, band, itemW, itemH, density) - clearance * 0.1;
          if (!bestPlacements || score > bestScore) {
            bestPlacements = candidate;
            bestScore = score;
          }
        }
      }
      if (bestPlacements) break;
    }
    return bestPlacements;
  };

  const bestPlacements =
    (useRegionAwareSlots ? findBestPlacements("global-region-aware") : null) ??
    (useRegionAwareSlots ? findBestPlacements("regional-packed") : null) ??
    findBestPlacements("single-band");
  if (!bestPlacements) return false;
  placed.push(...(bestPlacements as MutablePlacement[]));
  return true;
}

function placeAudienceScatteredWholeLayout(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  band: LuBand,
  itemW: number,
  itemH: number,
  candidates: readonly AudienceScatterSlot[],
  gapLu: number,
): boolean {
  const profile = audienceScatterProfile(items.length);
  const patterns: AudienceScatterPattern[] = [
    "orderedConstellation",
    "zoneBalanced",
    "centerOut",
    "stageSide",
    "broadFootprint",
    "lowCountCohesive",
  ];
  const clearances = [
    Math.max(0.25, gapLu * 0.55),
    Math.max(0.1, gapLu * 0.3),
    0,
  ];
  let bestPlacements: MutablePlacement[] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const clearance of clearances) {
    for (const pattern of patterns) {
      for (let seed = 0; seed < 7; seed += 1) {
        const targets = buildScatterPatternTargets(
          pattern,
          items.length,
          itemW,
          itemH,
          band,
          profile,
          seed,
          placed,
        );
        const candidate = tryBuildCompleteScatterLayout(
          items,
          placed,
          ctx.roomWidthLu,
          ctx.roomDepthLu,
          band,
          itemW,
          itemH,
          candidates,
          targets,
          clearance,
          pattern === "orderedConstellation",
        );
        if (!candidate) continue;
        const score =
          scoreCompleteScatterLayout(candidate, placed, band, itemW, itemH, profile) -
          clearance * 0.08;
        if (!bestPlacements || score > bestScore) {
          bestPlacements = candidate;
          bestScore = score;
        }
      }
    }
    if (bestPlacements) break;
  }

  if (!bestPlacements) return false;
  placed.push(...(bestPlacements as MutablePlacement[]));
  return true;
}

function placeAudienceScattered(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
): boolean {
  if (items.length === 0) return true;

  const { roomWidthLu, roomDepthLu, density } = ctx;
  const sample = componentFootprint(items[0]!.componentId);
  const itemW = sample.w;
  const itemH = sample.h;
  const band = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
  const candidates = buildAudienceScatterCandidates(items.length, itemW, itemH, band, density);
  if (candidates.length === 0) return false;
  const scanCandidates = buildAudienceObstacleScanCandidates(itemW, itemH, band, gapLu);
  const fullRoomCandidates = [...candidates, ...scanCandidates];

  if (
    placeAudienceScatteredWholeLayout(
      items,
      placed,
      ctx,
      band,
      itemW,
      itemH,
      fullRoomCandidates,
      gapLu,
    )
  ) {
    return true;
  }

  const clearanceCandidates = [
    Math.max(0.25, gapLu * 0.55),
    Math.max(0.1, gapLu * 0.3),
    0,
  ];

  for (const clearance of clearanceCandidates) {
    if (
      tryPlaceAudienceFromCandidates(
        items,
        placed,
        roomWidthLu,
        roomDepthLu,
        band,
        itemW,
        itemH,
        fullRoomCandidates,
        clearance,
      )
    ) {
      return true;
    }
  }

  for (const clearance of [Math.max(0.1, gapLu * 0.2), 0]) {
    if (
      tryPlaceAudienceFromCandidates(
        items,
        placed,
        roomWidthLu,
        roomDepthLu,
        band,
        itemW,
        itemH,
        scanCandidates,
        clearance,
      )
    ) {
      return true;
    }
  }

  return false;
}

function centerOfBand(band: LuBand): Readonly<{ x: number; y: number }> {
  return { x: band.x + band.w / 2, y: band.y + band.h / 2 };
}

function buildAudienceOpenCenterCandidates(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
): AudienceScatterSlot[] {
  if (itemCount <= 0) return [];
  const pitchX = Math.max(itemW + Math.max(0.35, gapLu * 0.35), itemW);
  const pitchY = Math.max(itemH + Math.max(0.35, gapLu * 0.35), itemH);
  const center = centerOfBand(band);
  const openW = Math.max(itemW * 1.25, band.w * 0.36);
  const openH = Math.max(itemH * 1.6, band.h * 0.34);
  const open = {
    x: center.x - openW / 2,
    y: center.y - openH / 2,
    w: openW,
    h: openH,
  };
  const candidates: Array<AudienceScatterSlot & { score: number }> = [];

  for (let y = band.y; y + itemH <= band.y + band.h + 1e-6; y += pitchY) {
    for (let x = band.x; x + itemW <= band.x + band.w + 1e-6; x += pitchX) {
      const rect = { x, y, w: itemW, h: itemH };
      if (rectsOverlap(rect, open)) continue;
      const slotCenter = centerOfRect(rect);
      const edgeDistance = Math.min(
        Math.abs(slotCenter.x - open.x),
        Math.abs(slotCenter.x - (open.x + open.w)),
        Math.abs(slotCenter.y - open.y),
        Math.abs(slotCenter.y - (open.y + open.h)),
      );
      const ringDistance = Math.abs(distanceBetweenPoints(slotCenter, center) - Math.max(openW, openH) * 0.62);
      candidates.push({ x, y, score: ringDistance + edgeDistance * 0.08 });
    }
  }

  return candidates
    .sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x)
    .map(({ x, y }) => ({ x, y }));
}

function buildAudiencePerimeterCandidates(
  itemCount: number,
  itemW: number,
  itemH: number,
  band: LuBand,
  gapLu: number,
): AudienceScatterSlot[] {
  if (itemCount <= 0) return [];
  const pitchX = Math.max(itemW + Math.max(0.35, gapLu * 0.35), itemW);
  const pitchY = Math.max(itemH + Math.max(0.35, gapLu * 0.35), itemH);
  const candidates: Array<AudienceScatterSlot & { score: number }> = [];
  const inner = {
    x: band.x + band.w * 0.22,
    y: band.y + band.h * 0.18,
    w: band.w * 0.56,
    h: band.h * 0.58,
  };

  for (let y = band.y; y + itemH <= band.y + band.h + 1e-6; y += pitchY) {
    for (let x = band.x; x + itemW <= band.x + band.w + 1e-6; x += pitchX) {
      const rect = { x, y, w: itemW, h: itemH };
      if (rectsOverlap(rect, inner)) continue;
      const edgeDistance = Math.min(
        x - band.x,
        band.x + band.w - (x + itemW),
        y - band.y,
        band.y + band.h - (y + itemH),
      );
      const sideBalance = Math.abs((x + itemW / 2) - (band.x + band.w / 2)) * 0.001;
      candidates.push({ x, y, score: edgeDistance + sideBalance });
    }
  }

  return candidates
    .sort((left, right) => left.score - right.score || left.y - right.y || left.x - right.x)
    .map(({ x, y }) => ({ x, y }));
}

function placeAudienceOrderedCandidates(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  band: LuBand,
  itemW: number,
  itemH: number,
  candidates: readonly AudienceScatterSlot[],
  clearanceLu: number,
  rotationForIndex?: (index: number) => number,
): boolean {
  const startIndex = placed.length;
  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!;
    let placedOne = false;
    for (const candidate of candidates) {
      const draft = {
        ...item,
        xLu: candidate.x,
        yLu: candidate.y,
        rotationDeg: rotationForIndex ? rotationForIndex(itemIndex) : item.rotationDeg,
      };
      if (!fitsExtentsInBand(candidate.x, candidate.y, itemW, itemH, band)) continue;
      if (!canPlaceWithClearance(draft, placed, ctx.roomWidthLu, ctx.roomDepthLu, clearanceLu)) continue;
      placed.push(draft);
      placedOne = true;
      break;
    }
    if (!placedOne) {
      placed.splice(startIndex);
      return false;
    }
  }
  return true;
}

function placeAudienceOpenCenter(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
): boolean {
  if (items.length === 0) return true;
  const { density } = ctx;
  const sample = componentFootprint(items[0]!.componentId);
  const band = audiencePackBand(ctx.roomWidthLu, ctx.roomDepthLu, audienceTop, density);
  const candidates = buildAudienceOpenCenterCandidates(items.length, sample.w, sample.h, band, gapLu);
  if (candidates.length === 0) return false;
  for (const clearance of [Math.max(0.15, gapLu * 0.22), 0]) {
    if (placeAudienceOrderedCandidates(items, placed, ctx, band, sample.w, sample.h, candidates, clearance)) {
      return true;
    }
  }
  return false;
}

function placeAudiencePerimeter(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
): boolean {
  if (items.length === 0) return true;
  const { density } = ctx;
  const sample = componentFootprint(items[0]!.componentId);
  const band = audiencePackBand(ctx.roomWidthLu, ctx.roomDepthLu, audienceTop, density);
  const candidates = buildAudiencePerimeterCandidates(items.length, sample.w, sample.h, band, gapLu);
  if (candidates.length === 0) return false;
  for (const clearance of [Math.max(0.15, gapLu * 0.18), 0]) {
    if (placeAudienceOrderedCandidates(items, placed, ctx, band, sample.w, sample.h, candidates, clearance)) {
      return true;
    }
  }
  return false;
}

function tryPlaceStyledAudienceItem(
  item: MutablePlacement,
  placed: MutablePlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
  band: LuBand,
  itemW: number,
  itemH: number,
  baseX: number,
  baseY: number,
  style: RoomSetAudienceStyle,
  styleArgs: Readonly<{
    row: number;
    col: number;
    cols: number;
    gridRows: number;
    gapLu: number;
    arcStrengthScale?: number;
  }>,
): boolean {
  const attempt = (x: number, y: number) => {
    if (!fitsExtentsInRoom(x, y, itemW, itemH, roomWidthLu, roomDepthLu)) return false;
    if (!fitsExtentsInBand(x, y, itemW, itemH, band)) return false;
    return pushIfFits({ ...item, xLu: x, yLu: y }, placed, roomWidthLu, roomDepthLu);
  };

  if (style === "grid") return attempt(baseX, baseY);

  const arcScale = styleArgs.arcStrengthScale ?? 1;
  for (const scale of [1, 0.6, 0.3] as const) {
    const styled = styledBanquetSlot(style, {
      baseX,
      baseY,
      row: styleArgs.row,
      col: styleArgs.col,
      cols: styleArgs.cols,
      gridRows: styleArgs.gridRows,
      band,
      itemW,
      gapLu: styleArgs.gapLu,
      scale: scale * arcScale,
    });
    if (attempt(styled.x, styled.y)) return true;
  }

  return attempt(baseX, baseY);
}

function placeAudienceGrid(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
  styledBanquet = false,
): boolean {
  if (items.length === 0) return true;

  const { roomWidthLu, roomDepthLu, density } = ctx;
  const sample = componentFootprint(items[0]!.componentId);
  const itemW = sample.w;
  const itemH = sample.h;
  const band = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
  const shouldStyleAudience =
    styledBanquet ||
    (ctx.layoutType === "reception" &&
      (ctx.audienceStyle === "loose" || ctx.audienceStyle === "arc" || ctx.audienceStyle === "scattered"));
  const placementStyle = shouldStyleAudience
    ? effectiveBanquetAudienceStyle(ctx.layoutType, ctx.audienceStyle)
    : "grid";

  const placeGridStyle = (style: RoomSetAudienceStyle): boolean => {
    const topologyStyle =
      styledBanquet && ctx.layoutType === "banquet" && style === "arc" ? "arc" : "grid";
    const banquetCoherence = styledBanquet && ctx.layoutType === "banquet" && style !== "scattered";
    const built = buildAudienceGridSlots(
      items.length,
      itemW,
      itemH,
      band,
      gapLu,
      density,
      topologyStyle,
      banquetCoherence,
      ctx.audienceTopology,
      ctx.applySemanticDirectives,
    );
    if (!built) return false;

    const arcStrengthScale =
      styledBanquet && style === "arc"
        ? banquetArcStrengthScale(ctx.audienceTopology?.arcStrength)
        : 1;
    let itemIndex = 0;
    for (const slot of built.slots) {
      if (
        !tryPlaceStyledAudienceItem(
          items[itemIndex]!,
          placed,
          roomWidthLu,
          roomDepthLu,
          band,
          itemW,
          itemH,
          slot.x,
          slot.y,
          style,
          {
            row: slot.row,
            col: slot.col,
            cols: built.cols,
            gridRows: built.rows,
            gapLu,
            arcStrengthScale,
          },
        )
      ) {
        return false;
      }
      itemIndex += 1;
    }

    return itemIndex === items.length;
  };

  if (placementStyle === "scattered") {
    const startIndex = placed.length;
    if (placeAudienceScattered(items, placed, ctx, audienceTop, gapLu)) return true;
    placed.splice(startIndex);
    if (placeGridStyle("loose")) return true;
    placed.splice(startIndex);
    return placeGridStyle("grid");
  }

  if (ctx.layoutType === "reception" && placementStyle === "arc") {
    const startIndex = placed.length;
    if (placeAudienceOpenCenter(items, placed, ctx, audienceTop, gapLu)) return true;
    placed.splice(startIndex);
  }

  if (placementStyle === "loose") {
    const startIndex = placed.length;
    if (ctx.layoutType === "reception") {
      if (placeAudiencePerimeter(items, placed, ctx, audienceTop, gapLu)) return true;
      placed.splice(startIndex);
    }
    if (placeAudienceStaggered(items, placed, ctx, audienceTop, gapLu)) return true;
    placed.splice(startIndex);
  }

  return placeGridStyle(placementStyle);
}

function placeAudienceRowsExact(
  rows: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  options?: Readonly<{ rowGapLu?: number; centerAisleLu?: number; bankCount?: number }>,
): boolean {
  if (rows.length === 0) return true;

  const { roomWidthLu, roomDepthLu, density } = ctx;
  const sample = componentFootprint(rows[0]!.componentId);
  const rowW = sample.w;
  const rowH = sample.h;
  const band = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
  if (rowW > band.w + 1e-6 || rowH > band.h + 1e-6) return false;

  const rowGapLu = options?.rowGapLu ?? density.rowGapLu;
  const centerAisleLu = options?.centerAisleLu ?? density.centerAisleLu;
  const maxBanksFromWidth = Math.max(
    1,
    Math.floor((band.w + Math.max(0, centerAisleLu)) / (rowW + Math.max(0, centerAisleLu))),
  );
  const banks = Math.max(1, Math.min(options?.bankCount ?? maxBanksFromWidth, maxBanksFromWidth));
  const bankXs = rowBankStartsInBand(band, rowW, banks, centerAisleLu);
  if (!bankXs || bankXs.length !== banks) return false;
  const rowsPerBank = Math.ceil(rows.length / banks);
  const baseNeededHeight = rowsPerBank * rowH + Math.max(0, rowsPerBank - 1) * rowGapLu;
  const targetHeight = clampNumber(
    Math.max(baseNeededHeight, band.h * density.targetBandDepthFillRatio),
    baseNeededHeight,
    band.h,
  );
  const effectiveRowGapLu =
    rowsPerBank > 1
      ? Math.max(rowGapLu, (targetHeight - rowsPerBank * rowH) / (rowsPerBank - 1))
      : rowGapLu;
  const neededHeight = rowsPerBank * rowH + Math.max(0, rowsPerBank - 1) * effectiveRowGapLu;
  if (neededHeight > band.h + 1e-6) return false;

  const startY = band.y + Math.max(0, (band.h - neededHeight) * density.audienceDepthAnchorRatio);

  let rowIndex = 0;
  for (let bankRow = 0; bankRow < rowsPerBank; bankRow += 1) {
    const y = startY + bankRow * (rowH + effectiveRowGapLu);
    if (y + rowH > band.y + band.h + 1e-6) return false;

    for (let bankIndex = 0; bankIndex < bankXs.length; bankIndex += 1) {
      if (rowIndex >= rows.length) break;
      const draft = { ...rows[rowIndex]!, xLu: bankXs[bankIndex]!, yLu: y };
      if (!pushIfFits(draft, placed, roomWidthLu, roomDepthLu)) return false;
      rowIndex += 1;
    }
  }

  return rowIndex === rows.length;
}

function placeTheaterDiagonalRowsExact(
  rows: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  options?: Readonly<{ rowGapLu?: number; centerAisleLu?: number; bankCount?: number }>,
): boolean {
  if (rows.length === 0) return true;

  const { roomWidthLu, roomDepthLu, density } = ctx;
  const sample = componentFootprint(rows[0]!.componentId);
  const rowW = sample.w;
  const rowH = sample.h;
  const band = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
  if (rowW > band.w + 1e-6 || rowH > band.h + 1e-6) return false;

  const rowGapLu = options?.rowGapLu ?? density.rowGapLu;
  const centerAisleLu = options?.centerAisleLu ?? density.centerAisleLu;
  const maxBanksFromWidth = Math.max(
    1,
    Math.floor((band.w + Math.max(0, centerAisleLu)) / (rowW + Math.max(0, centerAisleLu))),
  );
  const banks = Math.max(1, Math.min(options?.bankCount ?? maxBanksFromWidth, maxBanksFromWidth));
  const baseBankXs = rowBankStartsInBand(band, rowW, banks, centerAisleLu);
  if (!baseBankXs || baseBankXs.length !== banks) return false;

  const rowsPerBank = Math.ceil(rows.length / banks);
  const baseNeededHeight = rowsPerBank * rowH + Math.max(0, rowsPerBank - 1) * rowGapLu;
  const targetHeight = clampNumber(
    Math.max(baseNeededHeight, band.h * density.targetBandDepthFillRatio),
    baseNeededHeight,
    band.h,
  );
  const effectiveRowGapLu =
    rowsPerBank > 1
      ? Math.max(rowGapLu, (targetHeight - rowsPerBank * rowH) / (rowsPerBank - 1))
      : rowGapLu;
  const neededHeight = rowsPerBank * rowH + Math.max(0, rowsPerBank - 1) * effectiveRowGapLu;
  if (neededHeight > band.h + 1e-6) return false;

  const totalWidth = banks * rowW + Math.max(0, banks - 1) * centerAisleLu;
  const slack = Math.max(0, band.w - totalWidth);
  const maxOffset = Math.min(6, Math.max(1.5, slack / 2 - 0.2));
  const startY = band.y + Math.max(0, (band.h - neededHeight) * density.audienceDepthAnchorRatio);

  let rowIndex = 0;
  for (let bankRow = 0; bankRow < rowsPerBank; bankRow += 1) {
    const y = startY + bankRow * (rowH + effectiveRowGapLu);
    if (y + rowH > band.y + band.h + 1e-6) return false;
    const offset =
      rowsPerBank <= 1
        ? 0
        : ((bankRow / Math.max(1, rowsPerBank - 1)) - 0.5) * maxOffset * 2;

    for (let bankIndex = 0; bankIndex < baseBankXs.length; bankIndex += 1) {
      if (rowIndex >= rows.length) break;
      const x = baseBankXs[bankIndex]! + offset;
      if (!fitsExtentsInBand(x, y, rowW, rowH, band)) return false;
      const draft = { ...rows[rowIndex]!, xLu: x, yLu: y };
      if (!pushIfFits(draft, placed, roomWidthLu, roomDepthLu)) return false;
      rowIndex += 1;
    }
  }

  return rowIndex === rows.length;
}

function placeTheaterChevronRowsExact(
  rows: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  options?: Readonly<{ rowGapLu?: number; centerAisleLu?: number }>,
): MutablePlacement[] | null {
  if (rows.length === 0) return [];

  const { roomWidthLu, roomDepthLu, density } = ctx;
  const bankComponentId: RoomSetComponentId = "seating-theater-row";
  const bankFootprint = componentFootprint(bankComponentId);
  const bankDef = getRoomSetComponent(bankComponentId);
  const bankCapacity = Math.max(1, bankDef?.capacitySeated ?? 10);
  const targetCapacity = Math.max(
    bankCapacity * 2,
    Math.min(ctx.attendeeTarget ?? capacityForPlacements(rows), capacityForPlacements(rows)),
  );
  const bandCount = Math.max(1, Math.ceil(targetCapacity / (bankCapacity * 2)));
  const band = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
  const rowGapLu = options?.rowGapLu ?? density.rowGapLu;
  const centerAisleLu = Math.max(options?.centerAisleLu ?? density.centerAisleLu, 5);
  const neededWidth = bankFootprint.w * 2 + centerAisleLu;
  if (neededWidth > band.w + 1e-6 || bankFootprint.h > band.h + 1e-6) return null;

  const baseNeededHeight = bandCount * bankFootprint.h + Math.max(0, bandCount - 1) * rowGapLu;
  const targetHeight = clampNumber(
    Math.max(baseNeededHeight, band.h * density.targetBandDepthFillRatio),
    baseNeededHeight,
    band.h,
  );
  const effectiveRowGapLu =
    bandCount > 1
      ? Math.max(rowGapLu, (targetHeight - bandCount * bankFootprint.h) / (bandCount - 1))
      : rowGapLu;
  const neededHeight = bandCount * bankFootprint.h + Math.max(0, bandCount - 1) * effectiveRowGapLu;
  if (neededHeight > band.h + 1e-6) return null;

  const fieldCenterX = band.x + band.w / 2;
  const baseLeftX = fieldCenterX - centerAisleLu / 2 - bankFootprint.w;
  const baseRightX = fieldCenterX + centerAisleLu / 2;
  const sideSlack = Math.min(baseLeftX - band.x, band.x + band.w - (baseRightX + bankFootprint.w));
  const lateralSpreadLu = Math.max(0, Math.min(4.5, sideSlack - 0.25));
  const startY = band.y + Math.max(0, (band.h - neededHeight) * density.audienceDepthAnchorRatio);
  const drafts: MutablePlacement[] = [];

  for (let bandIndex = 0; bandIndex < bandCount; bandIndex += 1) {
    const y = startY + bandIndex * (bankFootprint.h + effectiveRowGapLu);
    const depthProgress = bandCount <= 1 ? 0 : bandIndex / Math.max(1, bandCount - 1);
    const leftX = baseLeftX - lateralSpreadLu * depthProgress;
    const rightX = baseRightX + lateralSpreadLu * depthProgress;
    if (!fitsExtentsInBand(leftX, y, bankFootprint.w, bankFootprint.h, band)) return null;
    if (!fitsExtentsInBand(rightX, y, bankFootprint.w, bankFootprint.h, band)) return null;

    drafts.push(
      {
        componentId: bankComponentId,
        xLu: leftX,
        yLu: y,
        rotationDeg: -7,
        label: "Left audience bank",
        zoneRole: "audience",
      },
      {
        componentId: bankComponentId,
        xLu: rightX,
        yLu: y,
        rotationDeg: 7,
        label: "Right audience bank",
        zoneRole: "audience",
      },
    );
  }

  const startIndex = placed.length;
  for (const draft of drafts) {
    if (!pushIfFits(draft, placed, roomWidthLu, roomDepthLu)) {
      placed.splice(startIndex);
      return null;
    }
  }
  const placedDrafts = placed.slice(startIndex);
  placed.splice(startIndex);
  return placedDrafts;
}

function placeClassroomPodRows(
  rows: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
): boolean {
  if (rows.length === 0) return true;
  const sample = componentFootprint(rows[0]!.componentId);
  const band = audiencePackBand(ctx.roomWidthLu, ctx.roomDepthLu, audienceTop, ctx.density);
  const candidates = buildAudienceOpenCenterCandidates(rows.length, sample.w, sample.h, band, gapLu);
  if (candidates.length === 0) return false;

  return placeAudienceOrderedCandidates(
    rows,
    placed,
    ctx,
    band,
    sample.w,
    sample.h,
    candidates,
    Math.max(0.1, gapLu * 0.15),
  );
}

function placeClassroomCollaborativeRows(
  rows: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
): boolean {
  if (rows.length === 0) return true;
  const sample = componentFootprint(rows[0]!.componentId);
  const band = audiencePackBand(ctx.roomWidthLu, ctx.roomDepthLu, audienceTop, ctx.density);
  if (sample.w > band.w + 1e-6 || sample.h > band.h + 1e-6) return false;

  const pitchY = sample.h + Math.max(0.5, gapLu * 0.45);
  const pitchX = sample.w + Math.max(0.5, gapLu * 0.45);
  const candidates: Array<AudienceScatterSlot & { rotationDeg: number }> = [];
  const sideRows = Math.max(1, Math.min(Math.ceil(rows.length / 3), Math.floor((band.h - sample.h) / pitchY) + 1));
  const leftX = band.x;
  const rightX = band.x + band.w - sample.w;

  for (let row = 0; row < sideRows; row += 1) {
    const y = band.y + row * pitchY;
    if (y + sample.h > band.y + band.h + 1e-6) break;
    candidates.push({ x: leftX, y, rotationDeg: 0 });
    candidates.push({ x: rightX, y, rotationDeg: 0 });
  }

  const rearY = band.y + band.h - sample.h;
  const rearStartX = band.x + Math.max(0, (band.w - Math.min(3, rows.length) * pitchX + Math.max(0.5, gapLu * 0.45)) / 2);
  for (let col = 0; col < Math.max(1, Math.floor((band.w + Math.max(0.5, gapLu * 0.45)) / pitchX)); col += 1) {
    const x = rearStartX + col * pitchX;
    if (x + sample.w > band.x + band.w + 1e-6) break;
    candidates.push({ x, y: rearY, rotationDeg: 0 });
  }

  const startIndex = placed.length;
  for (let index = 0; index < rows.length; index += 1) {
    let placedOne = false;
    for (const candidate of candidates) {
      const draft = {
        ...rows[index]!,
        xLu: candidate.x,
        yLu: candidate.y,
        rotationDeg: candidate.rotationDeg,
      };
      if (!fitsExtentsInBand(candidate.x, candidate.y, sample.w, sample.h, band)) continue;
      if (!canPlaceWithClearance(draft, placed, ctx.roomWidthLu, ctx.roomDepthLu, Math.max(0.05, gapLu * 0.1))) continue;
      placed.push(draft);
      placedOne = true;
      break;
    }
    if (!placedOne) {
      placed.splice(startIndex);
      return false;
    }
  }

  return true;
}

function placeAudienceRows(
  rows: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  audienceTops: readonly number[] = [audienceTop],
): AudiencePlacementAdjustment {
  if (rows.length === 0) return { ok: true, placedCount: 0, warnings: [] };

  const { density, roomWidthLu, roomDepthLu } = ctx;
  const sample = componentFootprint(rows[0]!.componentId);
  const band = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
  if (sample.w > band.w + 1e-6 || sample.h > band.h + 1e-6) {
    return { ok: false, placedCount: 0, warnings: [] };
  }

  const baseAisle = density.centerAisleLu;
  const baseGap = density.rowGapLu;
  const minAisle = Math.max(2, Math.min(baseAisle, 2));
  const minGap = Math.max(0, Math.min(baseGap, 0.25));
  const aisleCandidates = uniqueDescendingNumbers([
    baseAisle,
    Math.max(minAisle, baseAisle - 1.5),
    minAisle,
  ]);
  const gapCandidates = uniqueDescendingNumbers([
    baseGap,
    Math.max(minGap, baseGap - 0.5),
    minGap,
  ]);
  const originalCapacity = capacityForPlacements(rows);
  const isWorkshopPods = ctx.layoutType === "classroom" && ctx.eventIntent === "workshop" && ctx.audienceStyle === "scattered";
  const isWorkshopCollaborative = ctx.layoutType === "classroom" && ctx.eventIntent === "workshop" && ctx.audienceStyle === "arc";
  const isClassroomCenterAisle =
    ctx.layoutType === "classroom" &&
    ctx.audienceStyle === "scattered" &&
    ctx.eventIntent !== "workshop";

  for (let placedCount = rows.length; placedCount >= 1; placedCount -= 1) {
    const subset = rows.slice(0, placedCount);
    if (isWorkshopPods) {
      for (const candidateTop of audienceTops) {
        const startIndex = placed.length;
        const ok = placeClassroomPodRows(subset, placed, ctx, candidateTop, baseGap);
        if (ok) {
          const warnings = buildAudienceAdjustmentWarnings({
            label: "Workshop pod rows",
            originalCount: rows.length,
            placedCount,
            originalCapacity,
            placedCapacity: capacityForPlacements(subset),
            spacingAdjusted: false,
            topologyAdjusted: Math.abs(candidateTop - audienceTop) > 1e-6,
          });
          return { ok: true, placedCount, warnings };
        }
        placed.splice(startIndex);
      }
    }
    if (isWorkshopCollaborative) {
      for (const candidateTop of audienceTops) {
        const startIndex = placed.length;
        const ok = placeClassroomCollaborativeRows(subset, placed, ctx, candidateTop, baseGap);
        if (ok) {
          const warnings = buildAudienceAdjustmentWarnings({
            label: "Workshop collaborative rows",
            originalCount: rows.length,
            placedCount,
            originalCapacity,
            placedCapacity: capacityForPlacements(subset),
            spacingAdjusted: false,
            topologyAdjusted: Math.abs(candidateTop - audienceTop) > 1e-6,
          });
          return { ok: true, placedCount, warnings };
        }
        placed.splice(startIndex);
      }
    }
    if (ctx.audienceStyle === "loose") {
      for (const candidateTop of audienceTops) {
        const startIndex = placed.length;
        const ok = placeAudienceStaggered(subset, placed, ctx, candidateTop, baseGap);
        if (ok) {
          const warnings = buildAudienceAdjustmentWarnings({
            label: "Audience rows",
            originalCount: rows.length,
            placedCount,
            originalCapacity,
            placedCapacity: capacityForPlacements(subset),
            spacingAdjusted: false,
            topologyAdjusted: Math.abs(candidateTop - audienceTop) > 1e-6,
          });
          return { ok: true, placedCount, warnings };
        }
        placed.splice(startIndex);
      }
    }
    for (const rowGapLu of gapCandidates) {
      for (const centerAisleLu of aisleCandidates) {
        const maxBanks = Math.max(
          1,
          Math.floor((band.w + Math.max(0, centerAisleLu)) / (sample.w + Math.max(0, centerAisleLu))),
        );
        const wantsClassroomCenterAisle = isClassroomCenterAisle && maxBanks >= 2 && placedCount >= 4;
        const minBanks = wantsClassroomCenterAisle ? 2 : 1;
        const startingBankCount = wantsClassroomCenterAisle ? 2 : maxBanks;
        for (let bankCount = startingBankCount; bankCount >= minBanks; bankCount -= 1) {
          for (const candidateTop of audienceTops) {
            const startIndex = placed.length;
            const ok = placeAudienceRowsExact(subset, placed, ctx, candidateTop, {
              rowGapLu,
              centerAisleLu: wantsClassroomCenterAisle ? Math.max(centerAisleLu, 14) : centerAisleLu,
              bankCount,
            });
            if (ok) {
              const warnings = buildAudienceAdjustmentWarnings({
                label: "Audience rows",
                originalCount: rows.length,
                placedCount,
                originalCapacity,
                placedCapacity: capacityForPlacements(subset),
                spacingAdjusted: rowGapLu !== baseGap || centerAisleLu !== baseAisle,
                topologyAdjusted:
                  (placedCount === rows.length && bankCount !== maxBanks) ||
                  Math.abs(candidateTop - audienceTop) > 1e-6,
              });
              return { ok: true, placedCount, warnings };
            }
            placed.splice(startIndex);
          }
        }
      }
    }
  }

  return { ok: false, placedCount: 0, warnings: [] };
}

function placePresetTheaterRows(
  rows: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  audienceTops: readonly number[] = [audienceTop],
): AudiencePlacementAdjustment {
  if (rows.length === 0) return { ok: true, placedCount: 0, warnings: [] };

  const { density, roomWidthLu, roomDepthLu } = ctx;
  const sample = componentFootprint(rows[0]!.componentId);
  const band = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
  if (sample.w > band.w + 1e-6 || sample.h > band.h + 1e-6) {
    return { ok: false, placedCount: 0, warnings: [] };
  }

  const pattern = theaterRowPatternForContext(ctx);
  const originalCapacity = capacityForPlacements(rows);
  const baseAisle = isTownHallContext(ctx)
    ? Math.max(density.centerAisleLu, 8)
    : density.centerAisleLu;
  const baseGap = isTownHallContext(ctx)
    ? Math.max(density.rowGapLu, 1)
    : density.rowGapLu;
  const minAisle = Math.max(isTownHallContext(ctx) ? 6 : 2, Math.min(baseAisle, isTownHallContext(ctx) ? 6 : 2));
  const minGap = Math.max(0, Math.min(baseGap, 0.25));
  const aisleCandidates = uniqueDescendingNumbers([
    baseAisle,
    Math.max(minAisle, baseAisle - 1.5),
    minAisle,
  ]);
  const gapCandidates = uniqueDescendingNumbers([
    baseGap,
    Math.max(minGap, baseGap - 0.5),
    minGap,
  ]);
  const minGatedPlacedCount = rows.length >= 6 ? Math.ceil(rows.length * 0.8) : 1;
  const candidates: Array<Readonly<{
    placements: MutablePlacement[];
    gate: TheaterVisualQualityGateResult | TownHallVisualQualityGateResult;
    placedCount: number;
    placedCapacity: number;
    rowGapLu: number;
    centerAisleLu: number;
    audienceTop: number;
    bankCount: number;
    topologyAdjusted: boolean;
    stableTieBreaker: number;
  }>> = [];

  for (let placedCount = rows.length; placedCount >= 1; placedCount -= 1) {
    if (placedCount < minGatedPlacedCount) break;
    const subset = rows.slice(0, placedCount);

    const tryCandidate = (
      candidate: MutablePlacement[],
      rowGapLu: number,
      centerAisleLu: number,
      candidateTop: number,
      bankCount: number,
      candidatePlacedCount = placedCount,
    ) => {
      const gate = evaluatePresetTheaterRows([...placed, ...candidate], ctx, pattern);
      if (!gate.ok) return;
      const placedCapacity = capacityForPlacements(candidate);
      const topologyAdjusted = Math.abs(candidateTop - audienceTop) > 1e-6;
      const stableTieBreaker =
        candidate.reduce((sum, placement, index) => {
          return sum + placement.xLu * (index + 1) * 0.001 + placement.yLu * (index + 1) * 0.0001;
        }, 0) +
        rowGapLu * 0.01 +
        centerAisleLu * 0.001 +
        candidateTop * 0.0001 +
        bankCount * 0.00001;
      candidates.push({
        placements: candidate,
        gate,
        placedCount: candidatePlacedCount,
        placedCapacity,
        rowGapLu,
        centerAisleLu,
        audienceTop: candidateTop,
        bankCount,
        topologyAdjusted,
        stableTieBreaker,
      });
    };

    if (pattern === "chevron") {
      for (const rowGapLu of gapCandidates) {
        for (const centerAisleLu of aisleCandidates) {
          for (const candidateTop of audienceTops) {
            const candidate = placeTheaterChevronRowsExact(subset, placed, ctx, candidateTop, {
              rowGapLu,
              centerAisleLu,
            });
            if (candidate) {
              tryCandidate(candidate, rowGapLu, centerAisleLu, candidateTop, 2, candidate.length);
            }
          }
        }
      }
    } else if (pattern === "diagonal") {
      for (const rowGapLu of gapCandidates) {
        for (const centerAisleLu of aisleCandidates) {
          const candidateBand = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
          const maxBanks = Math.max(
            1,
            Math.floor((candidateBand.w + Math.max(0, centerAisleLu)) / (sample.w + Math.max(0, centerAisleLu))),
          );
          const minBanks = maxBanks >= 2 && placedCount >= 6 ? 2 : 1;
          for (let bankCount = maxBanks; bankCount >= minBanks; bankCount -= 1) {
            for (const candidateTop of audienceTops) {
              const startIndex = placed.length;
              const ok = placeTheaterDiagonalRowsExact(subset, placed, ctx, candidateTop, {
                rowGapLu,
                centerAisleLu,
                bankCount,
              });
              if (ok) {
                tryCandidate(placed.slice(startIndex), rowGapLu, centerAisleLu, candidateTop, bankCount);
              }
              placed.splice(startIndex);
            }
          }
        }
      }
    } else {
      for (const rowGapLu of gapCandidates) {
        for (const centerAisleLu of aisleCandidates) {
          const candidateBand = audiencePackBand(roomWidthLu, roomDepthLu, audienceTop, density);
          const maxBanks = Math.max(
            1,
            Math.floor((candidateBand.w + Math.max(0, centerAisleLu)) / (sample.w + Math.max(0, centerAisleLu))),
          );
          const wantsCenterAisle = isTheaterCenterAisleContext(ctx) && maxBanks >= 2 && placedCount >= 6;
          const minBanks = wantsCenterAisle ? 2 : 1;
          const startingBankCount = maxBanks;
          for (let bankCount = startingBankCount; bankCount >= minBanks; bankCount -= 1) {
            for (const candidateTop of audienceTops) {
              const startIndex = placed.length;
              const ok = placeAudienceRowsExact(subset, placed, ctx, candidateTop, {
                rowGapLu,
                centerAisleLu: wantsCenterAisle ? centerAisleLu : Math.min(centerAisleLu, 2),
                bankCount,
              });
              if (ok) {
                tryCandidate(placed.slice(startIndex), rowGapLu, centerAisleLu, candidateTop, bankCount);
              }
              placed.splice(startIndex);
            }
          }
        }
      }
    }
  }

  const best = candidates.sort((left, right) => {
    const capacityDelta = right.placedCapacity - left.placedCapacity;
    if (capacityDelta !== 0) return capacityDelta;
    const scoreDelta = right.gate.score - left.gate.score;
    if (Math.abs(scoreDelta) > 1e-9) return scoreDelta;
    const countDelta = right.placedCount - left.placedCount;
    if (countDelta !== 0) return countDelta;
    return left.stableTieBreaker - right.stableTieBreaker;
  })[0] ?? null;
  if (!best) return { ok: false, placedCount: 0, warnings: [] };

  placed.push(...best.placements);
  const warnings = buildAudienceAdjustmentWarnings({
    label: isTownHallContext(ctx) ? "Town hall audience rows" : "Theater audience rows",
    originalCount: rows.length,
    placedCount: best.placedCount,
    originalCapacity,
    placedCapacity: best.placedCapacity,
    spacingAdjusted: best.rowGapLu !== baseGap || best.centerAisleLu !== baseAisle,
    topologyAdjusted: best.topologyAdjusted,
  });
  return { ok: true, placedCount: best.placedCount, warnings };
}

function placeAudienceGridAdaptive(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  gapLu: number,
  styledBanquet = false,
  label = "Audience topology",
  audienceTops: readonly number[] = [audienceTop],
): AudiencePlacementAdjustment {
  if (items.length === 0) return { ok: true, placedCount: 0, warnings: [] };

  const minGap = Math.max(0, Math.min(gapLu, 0.5));
  const gapCandidates = uniqueDescendingNumbers([
    gapLu,
    Math.max(minGap, gapLu - 0.75),
    minGap,
  ]);
  const originalCapacity = capacityForPlacements(items);

  for (let placedCount = items.length; placedCount >= 1; placedCount -= 1) {
    const subset = items.slice(0, placedCount);
    for (const candidateGap of gapCandidates) {
      for (const candidateTop of audienceTops) {
        const startIndex = placed.length;
        const ok = placeAudienceGrid(subset, placed, ctx, candidateTop, candidateGap, styledBanquet);
        if (ok) {
          const warnings = buildAudienceAdjustmentWarnings({
            label,
            originalCount: items.length,
            placedCount,
            originalCapacity,
            placedCapacity: capacityForPlacements(subset),
            spacingAdjusted: candidateGap !== gapLu,
            topologyAdjusted: Math.abs(candidateTop - audienceTop) > 1e-6,
          });
          return { ok: true, placedCount, warnings };
        }
        placed.splice(startIndex);
      }
    }
  }

  return { ok: false, placedCount: 0, warnings: [] };
}

function placeBanquetTables(
  tables: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  audienceTop: number,
  audienceTops: readonly number[] = [audienceTop],
): AudiencePlacementAdjustment {
  const startIndex = placed.length;
  const pattern = banquetPatternForAudienceStyle(effectiveBanquetAudienceStyle(ctx.layoutType, ctx.audienceStyle));
  const deterministic = placeDeterministicBanquetTablesAdaptive(
    tables,
    placed,
    ctx,
    audienceTop,
    ctx.density.tableGapLu,
    "Banquet tables",
    audienceTops,
  );
  if (deterministic.ok && deterministic.placedCount === tables.length) return deterministic;
  const deterministicReduced = deterministic.ok
    ? {
        adjustment: deterministic,
        placements: placed.slice(startIndex),
      }
    : null;
  placed.splice(startIndex);

  const fallback = placeAudienceGridAdaptive(
    tables,
    placed,
    ctx,
    audienceTop,
    ctx.density.tableGapLu,
    true,
    "Banquet tables",
    audienceTops,
  );
  if (fallback.ok) {
    const gate = evaluateBanquetVisualQuality(placed, ctx, pattern);
    if (gate.ok) return fallback;
    placed.splice(startIndex);
  }

  if (deterministicReduced) {
    placed.push(...deterministicReduced.placements);
    return deterministicReduced.adjustment;
  }

  return { ok: false, placedCount: 0, warnings: [] };
}

function mapZoneRoleToPreference(
  zoneRole: LayoutSpecZoneRole | undefined,
): RoomSetPlannerPlacementPreference | undefined {
  switch (zoneRole) {
    case "front":
      return "front";
    case "rear":
      return "rear";
    case "perimeter":
      return "perimeter";
    case "mixed":
      return "mixed";
    default:
      return undefined;
  }
}

function defaultSecondaryZoneForComponent(componentId: RoomSetComponentId): SecondaryPlacementZone {
  if (componentId.startsWith("registration-")) return "rear";
  if (componentId === "fnb-portable-bar") return "rear";
  if (componentId === "fnb-buffet-line" || componentId === "fnb-coffee-station") return "perimeter";
  if (componentId.startsWith("decor-")) return "perimeter";
  return "perimeter";
}

function resolveSecondaryPlacementZone(item: MutablePlacement): SecondaryPlacementZone {
  const pref = item.placementPreference ?? mapZoneRoleToPreference(item.zoneRole);
  if (pref && pref !== "mixed") return pref;
  return defaultSecondaryZoneForComponent(item.componentId);
}

function dedupePositions(positions: ReadonlyArray<Readonly<{ x: number; y: number }>>): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const seen = new Set<string>();
  for (const position of positions) {
    const key = `${position.x.toFixed(3)}:${position.y.toFixed(3)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: position.x, y: position.y });
  }
  return out;
}

function sideWallKeyForX(
  x: number,
  w: number,
  roomWidthLu: number,
  insetLu: number,
): "left" | "right" | null {
  const inset = Math.max(0, insetLu);
  if (Math.abs(x - inset) < 1e-6) return "left";
  if (Math.abs(x + w - (roomWidthLu - inset)) < 1e-6) return "right";
  return null;
}

function preferUnusedSideWallCandidates(
  candidates: Array<{ x: number; y: number }>,
  item: MutablePlacement,
  placed: MutablePlacement[],
  w: number,
  roomWidthLu: number,
): Array<{ x: number; y: number }> {
  const usedSideWalls = new Set<"left" | "right">();
  for (const placement of placed) {
    if (placement.componentId !== item.componentId) continue;
    const key = sideWallKeyForX(placement.xLu, w, roomWidthLu, ROOM_EDGE_LU);
    if (key) usedSideWalls.add(key);
  }
  if (usedSideWalls.size === 0) return candidates;

  const openWallCandidates: Array<{ x: number; y: number }> = [];
  const repeatedWallCandidates: Array<{ x: number; y: number }> = [];
  for (const candidate of candidates) {
    const key = sideWallKeyForX(candidate.x, w, roomWidthLu, ROOM_EDGE_LU);
    if (key && usedSideWalls.has(key)) {
      repeatedWallCandidates.push(candidate);
    } else {
      openWallCandidates.push(candidate);
    }
  }
  return [...openWallCandidates, ...repeatedWallCandidates];
}

function centerDistanceBetweenRects(left: LuRect, right: LuRect): number {
  return Math.hypot(
    left.x + left.w / 2 - (right.x + right.w / 2),
    left.y + left.h / 2 - (right.y + right.h / 2),
  );
}

function minDistanceToPlaced(
  candidate: Readonly<{ x: number; y: number }>,
  componentId: RoomSetComponentId,
  placed: readonly MutablePlacement[],
  filter?: (placement: MutablePlacement) => boolean,
): number {
  const { w, h } = componentFootprint(componentId);
  const rect = { x: candidate.x, y: candidate.y, w, h };
  let minDistance = Number.POSITIVE_INFINITY;
  for (const placement of placed) {
    if (filter && !filter(placement)) continue;
    minDistance = Math.min(minDistance, centerDistanceBetweenRects(rect, placementRect(placement)));
  }
  return Number.isFinite(minDistance) ? minDistance : 9999;
}

function decorCandidateEdgeScore(
  candidate: Readonly<{ x: number; y: number }>,
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
): number {
  const left = candidate.x;
  const right = roomWidthLu - candidate.x - w;
  const top = candidate.y;
  const bottom = roomDepthLu - candidate.y - h;
  const edgeDistance = Math.min(left, right, top, bottom);
  const rearBonus = bottom <= ROOM_EDGE_LU + 0.25 ? 10 : 0;
  const cornerBonus =
    (left <= ROOM_EDGE_LU + 0.25 || right <= ROOM_EDGE_LU + 0.25) &&
    (top <= ROOM_EDGE_LU + 0.25 || bottom <= ROOM_EDGE_LU + 0.25)
      ? 8
      : 0;
  const frontPenalty = top <= ROOM_EDGE_LU + 0.25 ? 5 : 0;
  return rearBonus + cornerBonus - frontPenalty - edgeDistance;
}

function orderDecorPlacementCandidates(
  candidates: Array<{ x: number; y: number }>,
  item: MutablePlacement,
  placed: MutablePlacement[],
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
): Array<{ x: number; y: number }> {
  return [...candidates].sort((left, right) => {
    const leftDecorDistance = minDistanceToPlaced(
      left,
      item.componentId,
      placed,
      (placement) => placement.componentId === item.componentId,
    );
    const rightDecorDistance = minDistanceToPlaced(
      right,
      item.componentId,
      placed,
      (placement) => placement.componentId === item.componentId,
    );
    if (Math.abs(leftDecorDistance - rightDecorDistance) > 0.25) {
      return rightDecorDistance - leftDecorDistance;
    }

    const leftGeneralDistance = minDistanceToPlaced(left, item.componentId, placed);
    const rightGeneralDistance = minDistanceToPlaced(right, item.componentId, placed);
    if (Math.abs(leftGeneralDistance - rightGeneralDistance) > 0.25) {
      return rightGeneralDistance - leftGeneralDistance;
    }

    return (
      decorCandidateEdgeScore(right, w, h, roomWidthLu, roomDepthLu) -
      decorCandidateEdgeScore(left, w, h, roomWidthLu, roomDepthLu)
    );
  });
}

function appendCornerIfFits(
  out: Array<{ x: number; y: number }>,
  corner: "topLeft" | "topRight" | "bottomLeft" | "bottomRight",
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
  insetLu: number,
): void {
  const position = edgePlacementFromCorner(corner, w, h, roomWidthLu, roomDepthLu, insetLu);
  if (position) out.push(position);
}

function appendHorizontalEdgePositions(
  out: Array<{ x: number; y: number }>,
  edge: "top" | "bottom",
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
  insetLu: number,
): void {
  const inset = Math.max(0, insetLu);
  const y = edge === "top" ? inset : roomDepthLu - inset - h;
  const gap = SECONDARY_EDGE_GAP_LU;
  for (let x = inset; x + w <= roomWidthLu - inset + 1e-6; x += w + gap) {
    if (fitsExtentsInRoom(x, y, w, h, roomWidthLu, roomDepthLu)) {
      out.push({ x, y });
    }
  }
}

function appendVerticalEdgePositions(
  out: Array<{ x: number; y: number }>,
  side: "left" | "right",
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
  insetLu: number,
): void {
  const inset = Math.max(0, insetLu);
  const x = side === "left" ? inset : roomWidthLu - inset - w;
  const gap = SECONDARY_EDGE_GAP_LU;
  for (let y = inset; y + h <= roomDepthLu - inset + 1e-6; y += h + gap) {
    if (fitsExtentsInRoom(x, y, w, h, roomWidthLu, roomDepthLu)) {
      out.push({ x, y });
    }
  }
}

function appendSideCenterPosition(
  out: Array<{ x: number; y: number }>,
  side: "left" | "right",
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
  insetLu: number,
): void {
  const inset = Math.max(0, insetLu);
  const x = side === "left" ? inset : roomWidthLu - inset - w;
  const y = (roomDepthLu - h) / 2;
  if (fitsExtentsInRoom(x, y, w, h, roomWidthLu, roomDepthLu)) {
    out.push({ x, y });
  }
}

function appendCenterRearPosition(
  out: Array<{ x: number; y: number }>,
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
  insetLu: number,
): void {
  const inset = Math.max(0, insetLu);
  const x = (roomWidthLu - w) / 2;
  const y = roomDepthLu - inset - h;
  if (fitsExtentsInRoom(x, y, w, h, roomWidthLu, roomDepthLu)) {
    out.push({ x, y });
  }
}

function appendBalancedRearPerimeterSlots(
  out: Array<{ x: number; y: number }>,
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
  insetLu: number,
): void {
  appendCornerIfFits(out, "bottomLeft", w, h, roomWidthLu, roomDepthLu, insetLu);
  appendCornerIfFits(out, "bottomRight", w, h, roomWidthLu, roomDepthLu, insetLu);
  appendSideCenterPosition(out, "right", w, h, roomWidthLu, roomDepthLu, insetLu);
  appendSideCenterPosition(out, "left", w, h, roomWidthLu, roomDepthLu, insetLu);
  appendCenterRearPosition(out, w, h, roomWidthLu, roomDepthLu, insetLu);
}

function secondaryZoneBands(
  zone: SecondaryPlacementZone,
  roomWidthLu: number,
  roomDepthLu: number,
  insetLu: number,
): LuBand[] {
  const inset = Math.max(0, insetLu);
  const innerW = Math.max(0, roomWidthLu - inset * 2);
  const innerH = Math.max(0, roomDepthLu - inset * 2);
  const bandDepth = Math.min(SECONDARY_BAND_DEPTH_LU, Math.max(6, innerH * 0.22));
  const sideWidth = Math.min(SECONDARY_SIDE_BAND_LU, Math.max(5, innerW * 0.12));

  switch (zone) {
    case "rear":
      return [{ x: inset, y: roomDepthLu - inset - bandDepth, w: innerW, h: bandDepth }];
    case "front":
      return [{ x: inset, y: inset, w: innerW, h: bandDepth }];
    case "side":
      return [
        { x: inset, y: inset, w: sideWidth, h: innerH },
        { x: roomWidthLu - inset - sideWidth, y: inset, w: sideWidth, h: innerH },
      ];
    case "perimeter":
      return [
        { x: inset, y: roomDepthLu - inset - bandDepth, w: innerW, h: bandDepth },
        { x: inset, y: inset, w: sideWidth, h: innerH },
        { x: roomWidthLu - inset - sideWidth, y: inset, w: sideWidth, h: innerH },
        { x: inset, y: inset, w: innerW, h: bandDepth },
      ];
    default:
      return [];
  }
}

function sortBandScanPositions(
  positions: Array<{ x: number; y: number }>,
  zone: SecondaryPlacementZone,
  roomWidthLu: number,
  roomDepthLu: number,
): Array<{ x: number; y: number }> {
  const centerX = roomWidthLu / 2;
  const centerY = roomDepthLu / 2;
  return positions.sort((left, right) => {
    switch (zone) {
      case "rear":
        return right.y - left.y || Math.abs(left.x - centerX) - Math.abs(right.x - centerX);
      case "front":
        return left.y - right.y || Math.abs(left.x - centerX) - Math.abs(right.x - centerX);
      case "side": {
        const leftDist = Math.min(left.x, roomWidthLu - left.x);
        const rightDist = Math.min(right.x, roomWidthLu - right.x);
        return leftDist - rightDist || Math.abs(left.y - centerY) - Math.abs(right.y - centerY);
      }
      case "perimeter": {
        const leftEdge = Math.min(
          left.x,
          roomWidthLu - left.x,
          left.y,
          roomDepthLu - left.y,
        );
        const rightEdge = Math.min(
          right.x,
          roomWidthLu - right.x,
          right.y,
          roomDepthLu - right.y,
        );
        return leftEdge - rightEdge || Math.abs(left.y - centerY) - Math.abs(right.y - centerY);
      }
      default:
        return left.y - right.y || left.x - right.x;
    }
  });
}

function scanZoneBandsForPosition(
  zone: SecondaryPlacementZone,
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
): Array<{ x: number; y: number }> {
  const bands = secondaryZoneBands(zone, roomWidthLu, roomDepthLu, ROOM_EDGE_LU);
  const positions: Array<{ x: number; y: number }> = [];
  const gap = SECONDARY_EDGE_GAP_LU;
  for (const band of bands) {
    if (w > band.w + 1e-6 || h > band.h + 1e-6) continue;
    const stepX = Math.max(w + gap, 1);
    const stepY = Math.max(h + gap, 1);
    for (let y = band.y; y + h <= band.y + band.h + 1e-6; y += stepY) {
      for (let x = band.x; x + w <= band.x + band.w + 1e-6; x += stepX) {
        if (fitsExtentsInRoom(x, y, w, h, roomWidthLu, roomDepthLu)) {
          positions.push({ x, y });
        }
      }
    }
  }
  return sortBandScanPositions(positions, zone, roomWidthLu, roomDepthLu);
}

function buildSecondaryPlacementCandidates(
  item: MutablePlacement,
  w: number,
  h: number,
  roomWidthLu: number,
  roomDepthLu: number,
): Array<{ x: number; y: number }> {
  const zone = resolveSecondaryPlacementZone(item);
  const componentId = item.componentId;
  const inset = ROOM_EDGE_LU;
  const raw: Array<{ x: number; y: number }> = [];

  switch (zone) {
    case "rear":
      if (componentId === "fnb-portable-bar") {
        appendBalancedRearPerimeterSlots(raw, w, h, roomWidthLu, roomDepthLu, inset);
        appendHorizontalEdgePositions(raw, "bottom", w, h, roomWidthLu, roomDepthLu, inset);
      } else if (componentId.startsWith("registration-")) {
        appendCornerIfFits(raw, "bottomLeft", w, h, roomWidthLu, roomDepthLu, inset);
        appendCenterRearPosition(raw, w, h, roomWidthLu, roomDepthLu, inset);
        appendCornerIfFits(raw, "bottomRight", w, h, roomWidthLu, roomDepthLu, inset);
        appendHorizontalEdgePositions(raw, "bottom", w, h, roomWidthLu, roomDepthLu, inset);
      } else {
        appendCornerIfFits(raw, "bottomLeft", w, h, roomWidthLu, roomDepthLu, inset);
        appendCornerIfFits(raw, "bottomRight", w, h, roomWidthLu, roomDepthLu, inset);
        appendCenterRearPosition(raw, w, h, roomWidthLu, roomDepthLu, inset);
        appendHorizontalEdgePositions(raw, "bottom", w, h, roomWidthLu, roomDepthLu, inset);
      }
      break;
    case "front":
      appendCornerIfFits(raw, "topLeft", w, h, roomWidthLu, roomDepthLu, inset);
      appendCornerIfFits(raw, "topRight", w, h, roomWidthLu, roomDepthLu, inset);
      appendHorizontalEdgePositions(raw, "top", w, h, roomWidthLu, roomDepthLu, inset);
      break;
    case "side":
      appendSideCenterPosition(raw, "left", w, h, roomWidthLu, roomDepthLu, inset);
      appendSideCenterPosition(raw, "right", w, h, roomWidthLu, roomDepthLu, inset);
      appendVerticalEdgePositions(raw, "left", w, h, roomWidthLu, roomDepthLu, inset);
      appendVerticalEdgePositions(raw, "right", w, h, roomWidthLu, roomDepthLu, inset);
      appendCornerIfFits(raw, "bottomLeft", w, h, roomWidthLu, roomDepthLu, inset);
      appendCornerIfFits(raw, "bottomRight", w, h, roomWidthLu, roomDepthLu, inset);
      break;
    case "perimeter":
      if (componentId === "fnb-portable-bar") {
        appendBalancedRearPerimeterSlots(raw, w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "left", w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "right", w, h, roomWidthLu, roomDepthLu, inset);
      } else if (componentId.startsWith("registration-")) {
        appendCornerIfFits(raw, "bottomLeft", w, h, roomWidthLu, roomDepthLu, inset);
        appendCenterRearPosition(raw, w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "left", w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "right", w, h, roomWidthLu, roomDepthLu, inset);
      } else if (componentId.startsWith("fnb-")) {
        appendBalancedRearPerimeterSlots(raw, w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "left", w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "right", w, h, roomWidthLu, roomDepthLu, inset);
        appendHorizontalEdgePositions(raw, "bottom", w, h, roomWidthLu, roomDepthLu, inset);
      } else if (componentId.startsWith("decor-")) {
        appendCornerIfFits(raw, "bottomLeft", w, h, roomWidthLu, roomDepthLu, inset);
        appendCornerIfFits(raw, "bottomRight", w, h, roomWidthLu, roomDepthLu, inset);
        appendSideCenterPosition(raw, "left", w, h, roomWidthLu, roomDepthLu, inset);
        appendSideCenterPosition(raw, "right", w, h, roomWidthLu, roomDepthLu, inset);
        appendCornerIfFits(raw, "topLeft", w, h, roomWidthLu, roomDepthLu, inset);
        appendCornerIfFits(raw, "topRight", w, h, roomWidthLu, roomDepthLu, inset);
        appendHorizontalEdgePositions(raw, "bottom", w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "left", w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "right", w, h, roomWidthLu, roomDepthLu, inset);
        appendHorizontalEdgePositions(raw, "top", w, h, roomWidthLu, roomDepthLu, inset);
      } else {
        appendBalancedRearPerimeterSlots(raw, w, h, roomWidthLu, roomDepthLu, inset);
        appendCornerIfFits(raw, "topLeft", w, h, roomWidthLu, roomDepthLu, inset);
        appendCornerIfFits(raw, "topRight", w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "left", w, h, roomWidthLu, roomDepthLu, inset);
        appendVerticalEdgePositions(raw, "right", w, h, roomWidthLu, roomDepthLu, inset);
      }
      break;
    default:
      break;
  }

  const scanCandidates = scanZoneBandsForPosition(zone, w, h, roomWidthLu, roomDepthLu);
  const candidates = [...raw, ...scanCandidates];
  return dedupePositions(candidates);
}

function placeSecondaryZoneItems(
  items: MutablePlacement[],
  placed: MutablePlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  for (const item of items) {
    const { w, h } = componentFootprint(item.componentId);
    const candidates = buildSecondaryPlacementCandidates(item, w, h, roomWidthLu, roomDepthLu);
    const orderedCandidates = isDecorComponent(item.componentId)
      ? orderDecorPlacementCandidates(candidates, item, placed, w, h, roomWidthLu, roomDepthLu)
      : preferUnusedSideWallCandidates(
          candidates,
          item,
          placed,
          w,
          roomWidthLu,
        );
    let placedOne = false;
    const clearancePasses = isDecorComponent(item.componentId) ? [SECONDARY_EDGE_GAP_LU, 0] : [0];
    for (const clearanceLu of clearancePasses) {
      for (const position of orderedCandidates) {
        const draft = { ...item, xLu: position.x, yLu: position.y };
        const fits =
          clearanceLu > 0
            ? canPlaceWithClearance(draft, placed, roomWidthLu, roomDepthLu, clearanceLu)
            : canPlace(draft, placed, roomWidthLu, roomDepthLu);
        if (fits) {
          placed.push(draft);
          placedOne = true;
          break;
        }
      }
      if (placedOne) break;
    }
    if (!placedOne) return false;
  }
  return true;
}

function placeCocktailClusters(
  clusters: MutablePlacement[],
  placed: MutablePlacement[],
  ctx: ComposeContext,
  zoneTop: number,
  audienceTops: readonly number[] = [zoneTop],
): AudiencePlacementAdjustment {
  return placeAudienceGridAdaptive(
    clusters,
    placed,
    ctx,
    zoneTop,
    ctx.density.clusterGapLu,
    false,
    "Cocktail clusters",
    audienceTops,
  );
}

export type ComposePlannerLayoutResult = Readonly<{
  ok: boolean;
  scene: PlannerScene | null;
  placements: readonly RoomSetLayoutPlacement[];
  issues: readonly PlannerLayoutValidationIssue[];
  warnings: readonly string[];
}>;

export function composePlannerLayoutPlacements(
  inputPlacements: readonly RoomSetLayoutPlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
  densityPreference: RoomSetDensityPreference = "balanced",
  audienceStyle: RoomSetAudienceStyle = "grid",
  layoutType: LayoutSpecLayoutType = "theater",
  eventIntent?: RoomSetEventIntentId,
  audienceTopology?: LayoutSpecAudienceTopologyIntent,
  applySemanticDirectives?: ApplySemanticDirectives,
  attendeeTarget?: number,
): ComposePlannerLayoutResult {
  if (!(roomWidthLu > 0 && roomDepthLu > 0)) {
    return {
      ok: false,
      scene: null,
      placements: [],
      issues: [{ code: "invalid_room", message: "Room dimensions must be positive." }],
      warnings: [],
    };
  }

  const density = composeDensityProfile(densityPreference);
  const ctx: ComposeContext = {
    density,
    roomWidthLu,
    roomDepthLu,
    ...(attendeeTarget ? { attendeeTarget } : {}),
    audienceStyle,
    layoutType,
    ...(eventIntent ? { eventIntent } : {}),
    ...(audienceTopology ? { audienceTopology } : {}),
    ...(applySemanticDirectives ? { applySemanticDirectives } : {}),
  };
  const expanded = expandPlacements(inputPlacements);
  const placed: MutablePlacement[] = [];
  const warnings: string[] = [];
  let intentionalDrops = 0;
  const groups = partitionByGeometryRole(expanded);

  console.info("[room-set/compose] density profile", {
    densityPreference,
    audienceStyle,
    layoutType,
    roomEdgeInsetLu: density.roomEdgeInsetLu,
    packMarginLu: density.packMarginLu,
    targetBandFillRatio: density.targetBandFillRatio,
    targetBandDepthFillRatio: density.targetBandDepthFillRatio,
    targetBandAreaFillRatio: density.targetBandAreaFillRatio,
    tableGapLu: density.tableGapLu,
    rowGapLu: density.rowGapLu,
  });

  const frontResult = placeFrontStack(
    groups.front,
    placed,
    roomWidthLu,
    roomDepthLu,
    density.frontAudienceGapLu,
  );
  if (!frontResult.ok) {
    return {
      ok: false,
      scene: null,
      placements: [],
      issues: [
        {
          code: "compose_front_failed",
          message: `Could not place front-of-room stack (${groups.front.length} objects) within ${formatRoomShellDimensions(roomWidthLu, roomDepthLu)}.`,
        },
      ],
      warnings: [],
    };
  }

  let zoneTop = frontResult.zoneTop;
  let obstacleAwareZoneTop = frontResult.obstacleAwareZoneTop;
  const placedBeforeRows = placed.length;
  if (groups.audienceRows.length > 0) {
    const rowTops = audienceTopCandidates(zoneTop, obstacleAwareZoneTop, ctx.audienceStyle === "loose");
    const rowPlacement = shouldUsePresetTheaterRows(groups.audienceRows, ctx)
      ? placePresetTheaterRows(groups.audienceRows, placed, ctx, zoneTop, rowTops)
      : placeAudienceRows(groups.audienceRows, placed, ctx, zoneTop, rowTops);
    if (!rowPlacement.ok) {
      return {
        ok: false,
        scene: null,
        placements: [],
        issues: [
          {
            code: "compose_rows_failed",
            message: `Could not compose ${groups.audienceRows.length} audience row(s) within ${formatRoomShellDimensions(roomWidthLu, roomDepthLu)}.`,
          },
        ],
        warnings: [],
      };
    }
    warnings.push(...rowPlacement.warnings);
    intentionalDrops += groups.audienceRows.length - rowPlacement.placedCount;
    zoneTop = advanceZoneTop(placed.slice(placedBeforeRows), zoneTop, density.frontAudienceGapLu);
    obstacleAwareZoneTop = zoneTop;
  }

  const placedBeforeTables = placed.length;
  if (groups.banquetTables.length > 0) {
    const tableTops = audienceTopCandidates(
      zoneTop,
      obstacleAwareZoneTop,
      ctx.audienceStyle === "scattered" ||
        ctx.audienceStyle === "loose",
    );
    const tablePlacement = placeBanquetTables(groups.banquetTables, placed, ctx, zoneTop, tableTops);
    if (!tablePlacement.ok) {
      return {
        ok: false,
        scene: null,
        placements: [],
        issues: [
          {
            code: "compose_tables_failed",
            message: `Could not compose ${groups.banquetTables.length} table(s) within ${formatRoomShellDimensions(roomWidthLu, roomDepthLu)}.`,
          },
        ],
        warnings: [],
      };
    }
    warnings.push(...tablePlacement.warnings);
    intentionalDrops += groups.banquetTables.length - tablePlacement.placedCount;
    zoneTop = advanceZoneTop(placed.slice(placedBeforeTables), zoneTop, density.frontAudienceGapLu);
    obstacleAwareZoneTop = zoneTop;
  }

  const placedBeforeClusters = placed.length;
  if (groups.cocktailClusters.length > 0) {
    const clusterTops = audienceTopCandidates(
      zoneTop,
      obstacleAwareZoneTop,
      ctx.audienceStyle === "scattered",
    );
    const clusterPlacement = placeCocktailClusters(groups.cocktailClusters, placed, ctx, zoneTop, clusterTops);
    if (!clusterPlacement.ok) {
      return {
        ok: false,
        scene: null,
        placements: [],
        issues: [
          {
            code: "compose_cluster_failed",
            message: `Could not compose ${groups.cocktailClusters.length} cocktail cluster(s) within ${formatRoomShellDimensions(roomWidthLu, roomDepthLu)}.`,
          },
        ],
        warnings: [],
      };
    }
    warnings.push(...clusterPlacement.warnings);
    intentionalDrops += groups.cocktailClusters.length - clusterPlacement.placedCount;
    zoneTop = advanceZoneTop(placed.slice(placedBeforeClusters), zoneTop, density.frontAudienceGapLu);
    obstacleAwareZoneTop = zoneTop;
  }

  if (groups.edgeServices.length > 0) {
    if (!placeSecondaryZoneItems(groups.edgeServices, placed, roomWidthLu, roomDepthLu)) {
      return {
        ok: false,
        scene: null,
        placements: [],
        issues: [
          {
            code: "compose_edge_failed",
            message: `Could not place ${groups.edgeServices.length} edge service object(s) without overlap.`,
          },
        ],
        warnings: [],
      };
    }
  }

  if (groups.other.length > 0) {
    if (!placeSecondaryZoneItems(groups.other, placed, roomWidthLu, roomDepthLu)) {
      return {
        ok: false,
        scene: null,
        placements: [],
        issues: [
          {
            code: "compose_overflow",
            message: `Could not fit ${groups.other.length} remaining object(s) inside the room without overlap.`,
          },
        ],
        warnings: [],
      };
    }
  }

  const expectedPlacedCount = expanded.length - intentionalDrops;
  if (placed.length !== expectedPlacedCount) {
    return {
      ok: false,
      scene: null,
      placements: [],
      issues: [
        {
          code: "compose_count_mismatch",
          message: `Composition dropped objects (${placed.length}/${expectedPlacedCount}).`,
        },
      ],
      warnings: dedupeStrings(warnings),
    };
  }

  const overlapStartedMs = performance.now();
  const overlaps = findPlannerLayoutPlacementOverlaps(placed, roomWidthLu, roomDepthLu);
  console.info("[room-set/plan-layout] overlap/bounds validation", {
    ms: Math.round(performance.now() - overlapStartedMs),
    placementCount: placed.length,
    issueCount: overlaps.length,
  });
  if (overlaps.length > 0) {
    return {
      ok: false,
      scene: null,
      placements: [],
      issues: overlaps,
      warnings: dedupeStrings(warnings),
    };
  }

  const scene = plannerSceneFromLayoutPlacements(placed, {
    widthLu: roomWidthLu,
    depthLu: roomDepthLu,
  });

  return {
    ok: true,
    scene,
    placements: plannerSceneToLayoutPlacements(scene),
    issues: [],
    warnings: dedupeStrings(warnings),
  };
}
