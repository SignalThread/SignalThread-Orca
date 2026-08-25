import type { LayoutSpec } from "@/lib/room-set/layout-spec";
import type { RoomSetLayoutPlacement } from "@/lib/room-set/planner-layout-schema";
import {
  getRoomSetComponent,
  type RoomSetComponentCategoryId,
} from "@/lib/room-set/component-library";

export type ApplySpatialDirective =
  | "centerAudienceBlock"
  | "splitAudienceIntoBanks"
  | "anchorBarsLeftRight"
  | "moveBuffetToPerimeterWithoutOverlap"
  | "preserveCenterAisle"
  | "createNetworkingLoungePerimeter"
  | "tightenSeating"
  | "preserveStageSightlines"
  | "increaseSymmetry"
  | "enforceMirrorLayout";

/** Planner-facing keys surfaced in simulation logs and apply diagnostics. */
export type PlannerSemanticDirectiveKey =
  | "preserveCenterAisle"
  | "tightenSeating"
  | "preserveStageSightlines"
  | "createNetworkingLoungePerimeter"
  | "moveBuffetToPerimeterWithoutOverlap";

const SPATIAL_TO_PLANNER_KEY: Partial<Record<ApplySpatialDirective, PlannerSemanticDirectiveKey>> = {
  preserveCenterAisle: "preserveCenterAisle",
  tightenSeating: "tightenSeating",
  preserveStageSightlines: "preserveStageSightlines",
  createNetworkingLoungePerimeter: "createNetworkingLoungePerimeter",
  moveBuffetToPerimeterWithoutOverlap: "moveBuffetToPerimeterWithoutOverlap",
};

export function mapSpatialDirectivesToPlannerKeys(
  directives: readonly ApplySpatialDirective[],
): readonly PlannerSemanticDirectiveKey[] {
  const keys = new Set<PlannerSemanticDirectiveKey>();
  for (const directive of directives) {
    const mapped = SPATIAL_TO_PLANNER_KEY[directive];
    if (mapped) keys.add(mapped);
  }
  return [...keys];
}

export type ApplySpatialDirectiveResult = Readonly<{
  placements: readonly RoomSetLayoutPlacement[];
  changed: boolean;
  warnings: readonly string[];
}>;

type MutablePlacement = {
  componentId: RoomSetLayoutPlacement["componentId"];
  xLu: number;
  yLu: number;
  rotationDeg: number;
  label?: string;
  placementPreference?: RoomSetLayoutPlacement["placementPreference"];
  zoneRole?: RoomSetLayoutPlacement["zoneRole"];
};

const DIRECTIVE_ORDER: readonly ApplySpatialDirective[] = [
  "preserveStageSightlines",
  "tightenSeating",
  "preserveCenterAisle",
  "centerAudienceBlock",
  "splitAudienceIntoBanks",
  "anchorBarsLeftRight",
  "moveBuffetToPerimeterWithoutOverlap",
  "createNetworkingLoungePerimeter",
  "increaseSymmetry",
  "enforceMirrorLayout",
];

const PERIMETER_INCREMENTAL_STEP_LU = 8;
const PERIMETER_ALREADY_NEAR_LU = 3;
const PLACEMENT_GAP_LU = 0.35;

const BUFFET_COMPONENT_IDS = new Set(["fnb-buffet-line", "fnb-coffee-station"]);
const MIRRORABLE_CATEGORIES = new Set<RoomSetComponentCategoryId>([
  "fnb",
  "lounge",
  "booths",
  "registration",
  "decor",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundLu(value: number): number {
  return Math.round(value * 4) / 4;
}

function placementSize(placement: RoomSetLayoutPlacement | MutablePlacement): Readonly<{
  widthLu: number;
  depthLu: number;
  category: RoomSetComponentCategoryId | null;
}> {
  const component = getRoomSetComponent(placement.componentId);
  return {
    widthLu: component?.widthLu ?? 0,
    depthLu: component?.depthLu ?? 0,
    category: component?.category ?? null,
  };
}

function placementRect(placement: RoomSetLayoutPlacement | MutablePlacement) {
  const { widthLu, depthLu } = placementSize(placement);
  return {
    minX: placement.xLu,
    minY: placement.yLu,
    maxX: placement.xLu + widthLu,
    maxY: placement.yLu + depthLu,
    widthLu,
    depthLu,
    centerX: placement.xLu + widthLu / 2,
    centerY: placement.yLu + depthLu / 2,
  };
}

function placementBoundsAt(
  placement: RoomSetLayoutPlacement | MutablePlacement,
  xLu: number,
  yLu: number,
) {
  const { widthLu, depthLu } = placementSize(placement);
  return { x: xLu, y: yLu, w: widthLu, h: depthLu };
}

function boundsOverlap(
  a: Readonly<{ x: number; y: number; w: number; h: number }>,
  b: Readonly<{ x: number; y: number; w: number; h: number }>,
  gapLu = PLACEMENT_GAP_LU,
): boolean {
  return !(
    a.x + a.w + gapLu <= b.x ||
    b.x + b.w + gapLu <= a.x ||
    a.y + a.h + gapLu <= b.y ||
    b.y + b.h + gapLu <= a.y
  );
}

function placementOverlapsOthers(
  placements: readonly MutablePlacement[],
  index: number,
  xLu: number,
  yLu: number,
  excluded: ReadonlySet<number>,
): boolean {
  const candidate = placementBoundsAt(placements[index]!, xLu, yLu);
  for (let otherIndex = 0; otherIndex < placements.length; otherIndex += 1) {
    if (otherIndex === index || excluded.has(otherIndex)) continue;
    const other = placements[otherIndex]!;
    const { widthLu, depthLu } = placementSize(other);
    if (widthLu <= 0 || depthLu <= 0) continue;
    if (boundsOverlap(candidate, { x: other.xLu, y: other.yLu, w: widthLu, h: depthLu })) {
      return true;
    }
  }
  return false;
}

function nudgeTowardTarget(
  current: number,
  target: number,
  maxStep: number,
): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
}

function clampPlacementToRoom(
  placement: MutablePlacement,
  roomWidthLu: number,
  roomDepthLu: number,
): void {
  const { widthLu, depthLu } = placementSize(placement);
  placement.xLu = roundLu(clamp(placement.xLu, 0, Math.max(0, roomWidthLu - widthLu)));
  placement.yLu = roundLu(clamp(placement.yLu, 0, Math.max(0, roomDepthLu - depthLu)));
}

function boundsForIndices(
  placements: readonly (RoomSetLayoutPlacement | MutablePlacement)[],
  indices: readonly number[],
) {
  if (indices.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const index of indices) {
    const rect = placementRect(placements[index]!);
    minX = Math.min(minX, rect.minX);
    minY = Math.min(minY, rect.minY);
    maxX = Math.max(maxX, rect.maxX);
    maxY = Math.max(maxY, rect.maxY);
  }
  return { minX, minY, maxX, maxY, widthLu: maxX - minX, depthLu: maxY - minY };
}

function sortedIndicesByYThenX(
  placements: readonly (RoomSetLayoutPlacement | MutablePlacement)[],
  indices: readonly number[],
): number[] {
  return [...indices].sort((leftIndex, rightIndex) => {
    const left = placements[leftIndex]!;
    const right = placements[rightIndex]!;
    const deltaY = left.yLu - right.yLu;
    if (Math.abs(deltaY) > 0.25) return deltaY;
    return left.xLu - right.xLu;
  });
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  const left = sorted[middle - 1];
  const right = sorted[middle];
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

function verticalStepForIndices(
  placements: readonly (RoomSetLayoutPlacement | MutablePlacement)[],
  indices: readonly number[],
): number {
  const sorted = sortedIndicesByYThenX(placements, indices);
  const deltas: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = placements[sorted[i - 1]!]!;
    const next = placements[sorted[i]!]!;
    const delta = next.yLu - prev.yLu;
    if (delta > 0.5) deltas.push(delta);
  }
  const maxDepth = Math.max(...sorted.map((index) => placementRect(placements[index]!).depthLu), 0);
  return Math.max(maxDepth + 1.5, median(deltas) ?? maxDepth + 1.5);
}

function categoryForPlacement(
  placement: RoomSetLayoutPlacement | MutablePlacement,
): RoomSetComponentCategoryId | null {
  return placementSize(placement).category;
}

function frontIndices(
  placements: readonly (RoomSetLayoutPlacement | MutablePlacement)[],
): number[] {
  return placements.flatMap((placement, index) => {
    const category = categoryForPlacement(placement);
    return category === "stages" || category === "av" ? [index] : [];
  });
}

function frontMaxY(placements: readonly (RoomSetLayoutPlacement | MutablePlacement)[]): number {
  const indices = frontIndices(placements);
  const bounds = boundsForIndices(placements, indices);
  return bounds ? bounds.maxY : 0;
}

function mirrorableIndices(
  placements: readonly (RoomSetLayoutPlacement | MutablePlacement)[],
  excluded: ReadonlySet<number>,
): number[] {
  return placements.flatMap((placement, index) => {
    if (excluded.has(index)) return [];
    const category = categoryForPlacement(placement);
    return category && MIRRORABLE_CATEGORIES.has(category) ? [index] : [];
  });
}

function preserveSet(indices: readonly number[]): ReadonlySet<number> {
  return new Set(indices);
}

function mirrorGroup(
  placements: MutablePlacement[],
  indices: readonly number[],
  roomWidthLu: number,
  roomDepthLu: number,
  hard: boolean,
): boolean {
  let changed = false;
  const centerX = roomWidthLu / 2;
  const byComponent = new Map<string, number[]>();
  for (const index of indices) {
    const placement = placements[index]!;
    const list = byComponent.get(placement.componentId) ?? [];
    list.push(index);
    byComponent.set(placement.componentId, list);
  }

  for (const componentIndices of byComponent.values()) {
    const sorted = sortedIndicesByYThenX(placements, componentIndices);
    for (let leftCursor = 0, rightCursor = sorted.length - 1; leftCursor < rightCursor; leftCursor += 1, rightCursor -= 1) {
      const leftIndex = sorted[leftCursor]!;
      const rightIndex = sorted[rightCursor]!;
      const leftPlacement = placements[leftIndex]!;
      const rightPlacement = placements[rightIndex]!;
      const leftRect = placementRect(leftPlacement);
      const rightRect = placementRect(rightPlacement);
      const offset = Math.max(
        5,
        Math.max(centerX - leftRect.centerX, rightRect.centerX - centerX),
      );
      const leftTargetX = roundLu(centerX - offset - leftRect.widthLu / 2);
      const rightTargetX = roundLu(centerX + offset - rightRect.widthLu / 2);
      const leftNextX = hard ? leftTargetX : roundLu(leftPlacement.xLu * 0.25 + leftTargetX * 0.75);
      const rightNextX = hard ? rightTargetX : roundLu(rightPlacement.xLu * 0.25 + rightTargetX * 0.75);
      if (Math.abs(leftPlacement.xLu - leftNextX) > 0.01) {
        leftPlacement.xLu = leftNextX;
        changed = true;
      }
      if (Math.abs(rightPlacement.xLu - rightNextX) > 0.01) {
        rightPlacement.xLu = rightNextX;
        changed = true;
      }
      if (hard) {
        const alignedY = roundLu((leftPlacement.yLu + rightPlacement.yLu) / 2);
        if (Math.abs(leftPlacement.yLu - alignedY) > 0.01) {
          leftPlacement.yLu = alignedY;
          changed = true;
        }
        if (Math.abs(rightPlacement.yLu - alignedY) > 0.01) {
          rightPlacement.yLu = alignedY;
          changed = true;
        }
      }
      clampPlacementToRoom(leftPlacement, roomWidthLu, roomDepthLu);
      clampPlacementToRoom(rightPlacement, roomWidthLu, roomDepthLu);
    }
    if (hard && sorted.length % 2 === 1) {
      const middlePlacement = placements[sorted[Math.floor(sorted.length / 2)]!]!;
      const rect = placementRect(middlePlacement);
      const targetX = roundLu(centerX - rect.widthLu / 2);
      if (Math.abs(middlePlacement.xLu - targetX) > 0.01) {
        middlePlacement.xLu = targetX;
        clampPlacementToRoom(middlePlacement, roomWidthLu, roomDepthLu);
        changed = true;
      }
    }
  }
  return changed;
}

export function inferSpatialApplyDirectives(prompt: string): readonly ApplySpatialDirective[] {
  const text = prompt.trim();
  if (!text) return [];

  const directives = new Set<ApplySpatialDirective>();

  if (
    /\b(?:center|centre|centered|centred)\b[\s\S]{0,48}\b(?:audience|seating|rows?|guest\s+tables?|audience\s+block)\b/i.test(text) ||
    /\b(?:audience|seating|rows?|guest\s+tables?)\b[\s\S]{0,48}\b(?:center|centre|centered|centred)\b/i.test(text)
  ) {
    directives.add("centerAudienceBlock");
  }

  if (
    /\b(?:split|divide|separate)\b[\s\S]{0,40}\b(?:audience|seating|rows?|tables?)\b[\s\S]{0,40}\b(?:banks?|left\s+and\s+right|two\s+banks?)\b/i.test(text) ||
    /\b(?:two|2)\s+banks?\b/i.test(text)
  ) {
    directives.add("splitAudienceIntoBanks");
  }

  if (
    /\b(?:anchor|place|move|put)\b[\s\S]{0,36}\bbars?\b[\s\S]{0,36}\b(?:left\s+and\s+right|left\/right|both\s+sides?)\b/i.test(text) ||
    /\bbars?\b[\s\S]{0,36}\b(?:left\s+and\s+right|left\/right|both\s+sides?)\b/i.test(text)
  ) {
    directives.add("anchorBarsLeftRight");
  }

  if (
    /\b(?:move|put|place|shift|relocate)\b[\s\S]{0,24}\bbuffet\b[\s\S]{0,40}\b(?:perimeter|periphery|wall|edge)\b/i.test(text) ||
    /\bbuffet\b[\s\S]{0,40}\b(?:perimeter|periphery|outside\s+walls?|around\s+the\s+room|along\s+the\s+wall|room\s+edge)\b/i.test(text)
  ) {
    directives.add("moveBuffetToPerimeterWithoutOverlap");
  }

  if (
    /\b(?:preserve|keep|maintain|protect|reserve|leave|open|clear)\b[\s\S]{0,42}\b(?:center|middle)\b[\s\S]{0,42}\b(?:aisle|circulation|walkway|corridor|path)\b/i.test(text) ||
    /\b(?:center|middle)\s+aisle\b/i.test(text)
  ) {
    directives.add("preserveCenterAisle");
  }

  if (
    /\b(?:networking\s+lounge|lounge|soft\s+seating)\b[\s\S]{0,48}\b(?:perimeter|periphery|near\s+the\s+(?:wall|edge)|outside\s+walls?|around\s+the\s+room|along\s+the\s+wall|room\s+edge)\b/i.test(text) ||
    /\b(?:create|add)\b[\s\S]{0,32}\b(?:networking\s+)?lounge\b[\s\S]{0,40}\b(?:perimeter|near\s+perimeter)\b/i.test(text)
  ) {
    directives.add("createNetworkingLoungePerimeter");
  }

  if (/\b(?:tighten|tighter|compact)\b[\s\S]{0,32}\b(?:seating|pack|spacing|rows?)\b/i.test(text)) {
    directives.add("tightenSeating");
  }

  if (/\b(?:sightline|sight\s*lines?|stage\s+sight|preserve\s+stage)\b/i.test(text)) {
    directives.add("preserveStageSightlines");
  }

  if (
    /\b(?:increase|improve|make|more)\b[\s\S]{0,24}\b(?:symmetry|symmetrical|balanced)\b/i.test(text) ||
    /\b(?:more\s+balanced|cleaner\s+symmetry|increase\s+symmetry)\b/i.test(text)
  ) {
    directives.add("increaseSymmetry");
  }

  if (
    /\b(?:mirror|mirrored|mirror\s+layout|perfect\s+symmetry|enforce\s+mirror|left[-\s]?right\s+mirror)\b/i.test(text)
  ) {
    directives.add("enforceMirrorLayout");
  }

  return DIRECTIVE_ORDER.filter((directive) => directives.has(directive));
}

function structuralAudienceIndices(
  placements: readonly (RoomSetLayoutPlacement | MutablePlacement)[],
  primaryAudienceComponentId: LayoutSpec["audience"]["primaryComponentId"],
): number[] {
  return placements.flatMap((placement, index) =>
    placement.componentId === primaryAudienceComponentId ? [index] : [],
  );
}

function centerAudienceBlock(
  placements: MutablePlacement[],
  audienceIndices: readonly number[],
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  const audienceBounds = boundsForIndices(placements, audienceIndices);
  if (!audienceBounds) return false;
  const targetMinX = roundLu((roomWidthLu - audienceBounds.widthLu) / 2);
  const deltaX = targetMinX - audienceBounds.minX;
  if (Math.abs(deltaX) < 0.01) return false;
  for (const index of audienceIndices) {
    placements[index]!.xLu += deltaX;
    clampPlacementToRoom(placements[index]!, roomWidthLu, roomDepthLu);
  }
  return true;
}

function splitAudienceIntoBanks(
  placements: MutablePlacement[],
  audienceIndices: readonly number[],
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  if (audienceIndices.length < 2) return false;
  const sorted = sortedIndicesByYThenX(placements, audienceIndices);
  const leftBank = sorted.slice(0, Math.ceil(sorted.length / 2));
  const rightBank = sorted.slice(Math.ceil(sorted.length / 2));
  if (leftBank.length === 0 || rightBank.length === 0) return false;

  const audienceBounds = boundsForIndices(placements, audienceIndices);
  if (!audienceBounds) return false;
  const maxWidth = Math.max(...audienceIndices.map((index) => placementRect(placements[index]!).widthLu));
  const maxDepth = Math.max(...audienceIndices.map((index) => placementRect(placements[index]!).depthLu));
  const aisleLu = Math.max(8, 6);
  const leftX = roundLu(Math.max(2, roomWidthLu / 2 - aisleLu / 2 - maxWidth));
  const rightX = roundLu(Math.min(roomWidthLu - maxWidth - 2, roomWidthLu / 2 + aisleLu / 2));
  const stepY = verticalStepForIndices(placements, audienceIndices);
  const rowCount = Math.max(leftBank.length, rightBank.length);
  const audienceSet = new Set(audienceIndices);
  const rearObstacleTop = placements.reduce((minY, placement, index) => {
    if (audienceSet.has(index)) return minY;
    const rect = placementRect(placement);
    if (rect.centerY <= audienceBounds.minY) return minY;
    return Math.min(minY, rect.minY);
  }, roomDepthLu - 2);
  const safeBottomY = Math.max(frontMaxY(placements) + maxDepth + 3, rearObstacleTop - PLACEMENT_GAP_LU);
  const topFloor = frontMaxY(placements) + 2;
  const availableDepth = Math.max(maxDepth, safeBottomY - topFloor);
  const minStepY = maxDepth + PLACEMENT_GAP_LU;
  const fitStepY =
    rowCount > 1
      ? Math.max(minStepY, Math.min(stepY, (availableDepth - maxDepth) / (rowCount - 1)))
      : stepY;
  const totalDepth = maxDepth + Math.max(0, rowCount - 1) * fitStepY;
  const topY = roundLu(
    clamp(
      audienceBounds.minY,
      topFloor,
      Math.max(topFloor, safeBottomY - totalDepth),
    ),
  );

  for (let i = 0; i < leftBank.length; i += 1) {
    const placement = placements[leftBank[i]!]!;
    placement.xLu = leftX;
    placement.yLu = roundLu(topY + i * fitStepY);
    clampPlacementToRoom(placement, roomWidthLu, roomDepthLu);
  }
  for (let i = 0; i < rightBank.length; i += 1) {
    const placement = placements[rightBank[i]!]!;
    placement.xLu = rightX;
    placement.yLu = roundLu(topY + i * fitStepY);
    clampPlacementToRoom(placement, roomWidthLu, roomDepthLu);
  }
  return true;
}

function anchorBarsLeftRight(
  placements: MutablePlacement[],
  barIndices: readonly number[],
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  if (barIndices.length === 0) return false;
  const sorted = sortedIndicesByYThenX(placements, barIndices);
  const leftBars = sorted.filter((_, index) => index % 2 === 0);
  const rightBars = sorted.filter((_, index) => index % 2 === 1);
  const maxDepth = Math.max(...barIndices.map((index) => placementRect(placements[index]!).depthLu));
  const stepY = Math.max(maxDepth + 2, verticalStepForIndices(placements, barIndices));
  const rows = Math.max(leftBars.length, rightBars.length);
  const totalDepth = maxDepth + Math.max(0, rows - 1) * stepY;
  const startY = roundLu(
    clamp(
      roomDepthLu * 0.58,
      frontMaxY(placements) + 3,
      Math.max(frontMaxY(placements) + 3, roomDepthLu - totalDepth - 2),
    ),
  );

  for (let i = 0; i < leftBars.length; i += 1) {
    const placement = placements[leftBars[i]!]!;
    const rect = placementRect(placement);
    placement.xLu = 2;
    placement.yLu = roundLu(startY + i * stepY);
    clampPlacementToRoom(placement, roomWidthLu, roomDepthLu);
    if (rect.widthLu > 0) placement.rotationDeg = 0;
  }
  for (let i = 0; i < rightBars.length; i += 1) {
    const placement = placements[rightBars[i]!]!;
    placement.xLu = roundLu(roomWidthLu - placementRect(placement).widthLu - 2);
    placement.yLu = roundLu(startY + i * stepY);
    clampPlacementToRoom(placement, roomWidthLu, roomDepthLu);
  }
  return true;
}

function preserveCenterAisle(
  placements: MutablePlacement[],
  audienceIndices: readonly number[],
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  let changed = false;

  if (audienceIndices.length < 2) return changed;

  const leftIndices = audienceIndices.filter((index) => placementRect(placements[index]!).centerX < roomWidthLu / 2);
  const rightIndices = audienceIndices.filter((index) => placementRect(placements[index]!).centerX >= roomWidthLu / 2);

  if (leftIndices.length === 0 || rightIndices.length === 0) {
    changed = splitAudienceIntoBanks(placements, audienceIndices, roomWidthLu, roomDepthLu) || changed;
    return changed;
  }

  const leftBounds = boundsForIndices(placements, leftIndices);
  const rightBounds = boundsForIndices(placements, rightIndices);
  const centerGapLu =
    leftBounds && rightBounds ? rightBounds.minX - leftBounds.maxX : 0;
  if (centerGapLu >= 8) return changed;

  const widenLu = 2;
  const blocked = new Set<number>(audienceIndices);
  for (const index of leftIndices) {
    const placement = placements[index]!;
    const nextX = roundLu(Math.max(0, placement.xLu - widenLu));
    if (Math.abs(nextX - placement.xLu) <= 0.01) continue;
    if (placementOverlapsOthers(placements, index, nextX, placement.yLu, blocked)) continue;
    placement.xLu = nextX;
    clampPlacementToRoom(placement, roomWidthLu, roomDepthLu);
    changed = true;
  }
  for (const index of rightIndices) {
    const placement = placements[index]!;
    const rect = placementRect(placement);
    const nextX = roundLu(Math.min(roomWidthLu - rect.widthLu, placement.xLu + widenLu));
    if (Math.abs(nextX - placement.xLu) <= 0.01) continue;
    if (placementOverlapsOthers(placements, index, nextX, placement.yLu, blocked)) continue;
    placement.xLu = nextX;
    clampPlacementToRoom(placement, roomWidthLu, roomDepthLu);
    changed = true;
  }

  return changed;
}

function tightenAudienceGroup(
  placements: MutablePlacement[],
  groupIndices: readonly number[],
  roomWidthLu: number,
  roomDepthLu: number,
  preserveSightlines: boolean,
): boolean {
  if (groupIndices.length === 0) return false;

  const sorted = sortedIndicesByYThenX(placements, groupIndices);
  const stepY = verticalStepForIndices(placements, groupIndices);
  const maxDepth = Math.max(
    ...groupIndices.map((index) => placementRect(placements[index]!).depthLu),
    0,
  );
  const minStep = maxDepth + PLACEMENT_GAP_LU + 0.5;
  const tightenedStep = Math.max(minStep, stepY * 0.9);
  if (tightenedStep >= stepY - 0.05) return false;

  const minY = roundLu(frontMaxY(placements) + (preserveSightlines ? 4 : 2));
  let changed = false;

  for (let i = 0; i < sorted.length; i += 1) {
    const placement = placements[sorted[i]!]!;
    const targetY = roundLu(minY + i * tightenedStep);
    if (Math.abs(targetY - placement.yLu) > 0.01) {
      placement.yLu = targetY;
      clampPlacementToRoom(placement, roomWidthLu, roomDepthLu);
      changed = true;
    }
  }

  void roomWidthLu;
  return changed;
}

function tightenSeating(
  placements: MutablePlacement[],
  audienceIndices: readonly number[],
  roomWidthLu: number,
  roomDepthLu: number,
  preserveSightlines: boolean,
): boolean {
  if (audienceIndices.length === 0) return false;

  const leftIndices = audienceIndices.filter(
    (index) => placementRect(placements[index]!).centerX < roomWidthLu / 2,
  );
  const rightIndices = audienceIndices.filter(
    (index) => placementRect(placements[index]!).centerX >= roomWidthLu / 2,
  );

  if (leftIndices.length === 0 || rightIndices.length === 0) {
    return tightenAudienceGroup(
      placements,
      audienceIndices,
      roomWidthLu,
      roomDepthLu,
      preserveSightlines,
    );
  }

  return (
    tightenAudienceGroup(placements, leftIndices, roomWidthLu, roomDepthLu, preserveSightlines) ||
    tightenAudienceGroup(placements, rightIndices, roomWidthLu, roomDepthLu, preserveSightlines)
  );
}

function buffetPerimeterCandidates(
  placement: MutablePlacement,
  roomWidthLu: number,
  roomDepthLu: number,
  marginLu: number,
  frontMinY: number,
): ReadonlyArray<Readonly<{ x: number; y: number }>> {
  const rect = placementRect(placement);
  const rearY = roundLu(roomDepthLu - rect.depthLu - marginLu);
  const leftX = marginLu;
  const rightX = roundLu(roomWidthLu - rect.widthLu - marginLu);
  const candidates: Array<{ x: number; y: number }> = [];

  for (
    let tryX = marginLu;
    tryX <= roomWidthLu - rect.widthLu - marginLu;
    tryX += Math.max(2, rect.widthLu * 0.35)
  ) {
    candidates.push({ x: roundLu(tryX), y: rearY });
  }
  for (
    let tryY = frontMinY;
    tryY <= roomDepthLu - rect.depthLu - marginLu;
    tryY += Math.max(3, rect.depthLu + 2)
  ) {
    candidates.push({ x: leftX, y: roundLu(tryY) });
    candidates.push({ x: rightX, y: roundLu(tryY) });
  }

  return candidates;
}

function moveBuffetToPerimeterWithoutOverlap(
  placements: MutablePlacement[],
  buffetIndices: readonly number[],
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  if (buffetIndices.length === 0) return false;

  const marginLu = 2;
  const buffetSet = new Set(buffetIndices);
  const frontMinY = roundLu(frontMaxY(placements) + 4);
  const sorted = sortedIndicesByYThenX(placements, buffetIndices);
  let changed = false;

  for (const index of sorted) {
    const placement = placements[index]!;
    const originX = placement.xLu;
    const originY = placement.yLu;
    const candidates = [...buffetPerimeterCandidates(
      placement,
      roomWidthLu,
      roomDepthLu,
      marginLu,
      frontMinY,
    )].sort((left, right) => {
      const leftDistance = Math.hypot(left.x - originX, left.y - originY);
      const rightDistance = Math.hypot(right.x - originX, right.y - originY);
      return leftDistance - rightDistance;
    });

    for (const candidate of candidates) {
      if (placementOverlapsOthers(placements, index, candidate.x, candidate.y, buffetSet)) continue;
      if (Math.abs(candidate.x - placement.xLu) > 0.01 || Math.abs(candidate.y - placement.yLu) > 0.01) {
        placement.xLu = candidate.x;
        placement.yLu = candidate.y;
        clampPlacementToRoom(placement, roomWidthLu, roomDepthLu);
        changed = true;
        break;
      }
    }
  }

  return changed;
}

function createNetworkingLoungePerimeter(
  placements: MutablePlacement[],
  loungeIndices: readonly number[],
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  if (loungeIndices.length === 0) return false;

  const marginLu = 2;
  const minY = roundLu(frontMaxY(placements) + 4);
  let changed = false;

  for (const index of loungeIndices) {
    const placement = placements[index]!;
    const rect = placementRect(placement);
    const distLeft = rect.centerX - marginLu;
    const distRight = roomWidthLu - marginLu - rect.centerX;
    const distTop = Math.max(0, rect.centerY - minY);
    const distBottom = roomDepthLu - marginLu - rect.centerY;
    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    if (minDist <= PERIMETER_ALREADY_NEAR_LU) continue;

    let targetX = placement.xLu;
    let targetY = placement.yLu;

    if (minDist === distLeft) {
      targetX = marginLu;
      targetY = roundLu(clamp(placement.yLu, minY, roomDepthLu - rect.depthLu - marginLu));
    } else if (minDist === distRight) {
      targetX = roundLu(roomWidthLu - rect.widthLu - marginLu);
      targetY = roundLu(clamp(placement.yLu, minY, roomDepthLu - rect.depthLu - marginLu));
    } else if (minDist === distTop) {
      targetY = minY;
      targetX = roundLu(clamp(placement.xLu, marginLu, roomWidthLu - rect.widthLu - marginLu));
    } else {
      targetY = roundLu(roomDepthLu - rect.depthLu - marginLu);
      targetX = roundLu(clamp(placement.xLu, marginLu, roomWidthLu - rect.widthLu - marginLu));
    }

    const nextX = roundLu(nudgeTowardTarget(placement.xLu, targetX, PERIMETER_INCREMENTAL_STEP_LU));
    const nextY = roundLu(nudgeTowardTarget(placement.yLu, targetY, PERIMETER_INCREMENTAL_STEP_LU));
    if (Math.abs(nextX - placement.xLu) > 0.01 || Math.abs(nextY - placement.yLu) > 0.01) {
      placement.xLu = nextX;
      placement.yLu = nextY;
      clampPlacementToRoom(placement, roomWidthLu, roomDepthLu);
      changed = true;
    }
  }

  return changed;
}

export function applySpatialDirectivesToLayout(args: Readonly<{
  placements: readonly RoomSetLayoutPlacement[];
  roomWidthLu: number;
  roomDepthLu: number;
  primaryAudienceComponentId: LayoutSpec["audience"]["primaryComponentId"];
  directives: readonly ApplySpatialDirective[];
}>): ApplySpatialDirectiveResult {
  const mutable: MutablePlacement[] = args.placements.map((placement) => ({ ...placement }));
  const warnings: string[] = [];
  let changed = false;

  const audienceIndices = structuralAudienceIndices(mutable, args.primaryAudienceComponentId);
  const barIndices = mutable.flatMap((placement, index) =>
    placement.componentId === "fnb-portable-bar" ? [index] : [],
  );
  const buffetIndices = mutable.flatMap((placement, index) =>
    BUFFET_COMPONENT_IDS.has(placement.componentId) ? [index] : [],
  );
  const loungeIndices = mutable.flatMap((placement, index) =>
    categoryForPlacement(placement) === "lounge" ? [index] : [],
  );
  const frontSet = preserveSet(frontIndices(mutable));
  const mirrorable = mirrorableIndices(mutable, frontSet);
  const preserveSightlines = args.directives.includes("preserveStageSightlines");

  for (const directive of args.directives) {
    switch (directive) {
      case "centerAudienceBlock": {
        if (audienceIndices.length === 0) {
          warnings.push("No audience block was available to center.");
          break;
        }
        changed = centerAudienceBlock(
          mutable,
          audienceIndices,
          args.roomWidthLu,
          args.roomDepthLu,
        ) || changed;
        break;
      }
      case "splitAudienceIntoBanks": {
        if (audienceIndices.length < 2) {
          warnings.push("Audience bank split requested, but there were not enough audience objects to split.");
          break;
        }
        changed = splitAudienceIntoBanks(
          mutable,
          audienceIndices,
          args.roomWidthLu,
          args.roomDepthLu,
        ) || changed;
        break;
      }
      case "anchorBarsLeftRight": {
        if (barIndices.length === 0) {
          warnings.push("Left/right bar anchoring requested, but no bars were present.");
          break;
        }
        changed = anchorBarsLeftRight(
          mutable,
          barIndices,
          args.roomWidthLu,
          args.roomDepthLu,
        ) || changed;
        break;
      }
      case "preserveCenterAisle": {
        changed = preserveCenterAisle(
          mutable,
          audienceIndices,
          args.roomWidthLu,
          args.roomDepthLu,
        ) || changed;
        break;
      }
      case "tightenSeating": {
        if (audienceIndices.length === 0) {
          warnings.push("Tighter seating requested, but no audience seating was present.");
          break;
        }
        changed = tightenSeating(
          mutable,
          audienceIndices,
          args.roomWidthLu,
          args.roomDepthLu,
          preserveSightlines,
        ) || changed;
        break;
      }
      case "preserveStageSightlines":
        break;
      case "moveBuffetToPerimeterWithoutOverlap": {
        if (buffetIndices.length === 0) {
          warnings.push("Perimeter buffet placement requested, but no buffet objects were present.");
          break;
        }
        changed = moveBuffetToPerimeterWithoutOverlap(
          mutable,
          buffetIndices,
          args.roomWidthLu,
          args.roomDepthLu,
        ) || changed;
        break;
      }
      case "createNetworkingLoungePerimeter": {
        if (loungeIndices.length === 0) {
          warnings.push("Perimeter lounge placement requested, but no lounge objects were present.");
          break;
        }
        changed = createNetworkingLoungePerimeter(
          mutable,
          loungeIndices,
          args.roomWidthLu,
          args.roomDepthLu,
        ) || changed;
        break;
      }
      case "increaseSymmetry": {
        if (audienceIndices.length > 0) {
          changed = centerAudienceBlock(
            mutable,
            audienceIndices,
            args.roomWidthLu,
            args.roomDepthLu,
          ) || changed;
        }
        changed = mirrorGroup(mutable, mirrorable, args.roomWidthLu, args.roomDepthLu, false) || changed;
        break;
      }
      case "enforceMirrorLayout": {
        if (audienceIndices.length > 0) {
          changed = centerAudienceBlock(
            mutable,
            audienceIndices,
            args.roomWidthLu,
            args.roomDepthLu,
          ) || changed;
        }
        if (barIndices.length > 0) {
          changed = anchorBarsLeftRight(
            mutable,
            barIndices,
            args.roomWidthLu,
            args.roomDepthLu,
          ) || changed;
        }
        changed = mirrorGroup(mutable, mirrorable, args.roomWidthLu, args.roomDepthLu, true) || changed;
        break;
      }
    }
  }

  for (const placement of mutable) {
    clampPlacementToRoom(placement, args.roomWidthLu, args.roomDepthLu);
  }

  return {
    placements: mutable,
    changed,
    warnings,
  };
}
