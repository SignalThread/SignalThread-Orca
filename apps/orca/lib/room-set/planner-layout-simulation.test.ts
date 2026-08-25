import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildDefaultPlannerSimulationScenarios,
  renderPlannerSceneSvg,
  runPlannerSimulationScenario,
} from "./planner-layout-simulation";
import { composeLayoutSpec } from "./layout-spec-compose";
import { composeLayoutSpecForApply } from "./layout-spec-apply-compose";
import { applyLayoutPatch } from "./layout-patch-apply";
import {
  buildDeterministicApplyLayoutPatch,
  supplementLayoutPatchSeatingStyleFromPrompt,
} from "./layout-patch-deterministic-fallback";
import {
  composeLayoutSpecWithGracefulFallback,
  failedApplyMessage,
} from "./planner-layout-graceful-fallback";
import { finalizeGenerateLayoutSpec } from "./layout-spec-generate-resolve";
import { normalizeLayoutPatchFromUnknown } from "./layout-patch-normalize";
import type { LayoutSpec } from "./layout-spec";
import type { ComposePlannerLayoutResult } from "./planner-layout-compose";
import { normalizePlannerSceneFromUnknown } from "./planner-scene-io";
import {
  plannerSceneFromGeneratedLayoutPlacements,
  plannerSceneFromLayoutPlacements,
  plannerSceneToLayoutPlacements,
  type PlannerSceneObject,
} from "./planner-scene";
import {
  sumPlatedSeatCapacity,
  plannerValidationIssuesToFailureDetails,
  validatePlannerLayoutPlacements,
} from "./planner-layout-validator";
import {
  analyzeBanquetTableVisualQuality,
  banquetTableVisualOpportunityDemand,
} from "./planner-layout-visual-quality";
import {
  analyzeTheaterAudienceVisualQuality,
  analyzeTownHallAudienceVisualQuality,
} from "./planner-row-audience-visual-quality";
import {
  formatComponentFootprintDimensions,
  formatRoomShellDimensions,
  layoutLuToPx,
  plannerLuRectToPxRect,
} from "./room-units";
import {
  plannerSeatPositionsForChairBlock,
  plannerSeatPositionsForTable,
} from "./planner-seat-positions";
import { normalizeRoomSetLayoutStylePreference } from "./planner-intent-shared";
import {
  layoutStyleOptionsForIntent,
  ROOM_SET_PROMPT_STYLE_HINT_OPTIONS,
} from "./layout-style-options";
import {
  getRoomSetComponent,
  groupRoomSetComponentsByCategory,
  ROOM_SET_COMPONENTS,
  searchRoomSetComponents,
  type RoomSetComponentId,
} from "./component-library";
import {
  plannerTheaterSeatCountFromCapacity,
  plannerTheaterSeatMarkersFromCapacity,
} from "./planner-shape-utils";

function componentCount(
  summary: Readonly<{
    byComponent: readonly Readonly<{ componentId: string; count: number }>[];
  }>,
  componentId: string,
): number {
  return summary.byComponent.find((entry) => entry.componentId === componentId)?.count ?? 0;
}

function rowPlacementCount(placements: readonly { componentId: string }[]): number {
  return placements.filter(
    (placement) =>
      placement.componentId === "seating-theater-row" ||
      placement.componentId === "seating-chair-row-5" ||
      placement.componentId === "seating-chair-row-10" ||
      placement.componentId === "seating-chair-block-20" ||
      placement.componentId === "seating-chair-block-custom",
  ).length;
}

function averageCenterAisleGap(
  placements: readonly { componentId: string; xLu: number; yLu: number }[],
  roomWidthLu: number,
): number {
  const roomCenter = roomWidthLu / 2;
  const rows = placements
    .flatMap((placement) => {
      const def = getRoomSetComponent(placement.componentId as RoomSetComponentId);
      if (!def || def.domainKind !== "chair_block") return [];
      return [{ ...placement, widthLu: def.widthLu, depthLu: def.depthLu }];
    })
    .sort((left, right) => left.yLu - right.yLu || left.xLu - right.xLu);
  const bands: Array<typeof rows> = [];
  const tolerance = Math.max(0.8, Math.max(...rows.map((row) => row.depthLu), 0) * 0.55);
  for (const row of rows) {
    const current = bands[bands.length - 1];
    if (!current) {
      bands.push([row]);
      continue;
    }
    const currentY = current.reduce((sum, entry) => sum + entry.yLu, 0) / current.length;
    if (Math.abs(row.yLu - currentY) <= tolerance) current.push(row);
    else bands.push([row]);
  }
  const gaps = bands.flatMap((band) => {
    const left = band.filter((row) => row.xLu + row.widthLu / 2 < roomCenter).at(-1);
    const right = band.find((row) => row.xLu + row.widthLu / 2 >= roomCenter);
    if (!left || !right) return [];
    return [right.xLu - (left.xLu + left.widthLu)];
  });
  return gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
}

function gracefulFallbackBaseSpec(overrides: Partial<LayoutSpec> = {}): LayoutSpec {
  const base: LayoutSpec = {
    version: 1,
    source: "ai-generate",
    eventIntent: "general_session",
    layoutType: "theater",
    attendeeTarget: 100,
    densityPreference: "balanced",
    audienceStyle: "grid",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      stage: { componentId: "stage-small", count: 1, zoneRole: "front" },
      av: [{ componentId: "av-speaker-stack", count: 2, zoneRole: "front" }],
    },
    audience: {
      primaryComponentId: "seating-theater-row",
      primaryComponentCapacity: 14,
      requiredPrimaryComponents: 8,
    },
    secondary: [],
  };
  return { ...base, ...overrides };
}

function mockComposeResult(ok: boolean, code = "compose_failed"): ComposePlannerLayoutResult {
  return {
    ok,
    scene: null,
    placements: ok
      ? [{ componentId: "stage-small", xLu: 2, yLu: 2, rotationDeg: 0 }]
      : [],
    issues: ok ? [] : [{ code, message: code }],
    warnings: [],
  };
}

function clusterByCoordinate<T>(
  items: readonly T[],
  coordinate: (item: T) => number,
  tolerance: number,
): T[][] {
  const sorted = [...items].sort((a, b) => coordinate(a) - coordinate(b));
  const clusters: T[][] = [];
  for (const item of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current) {
      clusters.push([item]);
      continue;
    }
    const mean = current.reduce((sum, entry) => sum + coordinate(entry), 0) / current.length;
    if (Math.abs(coordinate(item) - mean) <= tolerance) {
      current.push(item);
    } else {
      clusters.push([item]);
    }
  }
  return clusters;
}

function placementFootprint(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  componentIds: readonly string[],
): Readonly<{ width: number; depth: number; area: number }> {
  const targetIds = new Set(componentIds);
  const targetPlacements = placements.filter((placement) => targetIds.has(placement.componentId));
  assert.equal(targetPlacements.length > 0, true, `expected placements for ${componentIds.join(",")}`);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const placement of targetPlacements) {
    const component = ROOM_SET_COMPONENTS.find((entry) => entry.id === placement.componentId);
    assert.ok(component, placement.componentId);
    minX = Math.min(minX, placement.xLu);
    minY = Math.min(minY, placement.yLu);
    maxX = Math.max(maxX, placement.xLu + component.widthLu);
    maxY = Math.max(maxY, placement.yLu + component.depthLu);
  }

  const width = maxX - minX;
  const depth = maxY - minY;
  return { width, depth, area: width * depth };
}

function maxAlignedColumnCount(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  componentId: string,
): number {
  const component = ROOM_SET_COMPONENTS.find((entry) => entry.id === componentId);
  assert.ok(component, componentId);
  const centers = placementCenters(placements, componentId).sort((left, right) => left.x - right.x);
  const tolerance = Math.max(0.75, component.widthLu * 0.18);
  const clusters: Array<Array<Readonly<{ x: number; y: number }>>> = [];
  for (const center of centers) {
    const cluster = clusters.find((entry) => {
      const mean = entry.reduce((sum, item) => sum + item.x, 0) / entry.length;
      return Math.abs(mean - center.x) <= tolerance;
    });
    if (cluster) {
      cluster.push(center);
    } else {
      clusters.push([center]);
    }
  }
  return Math.max(0, ...clusters.map((cluster) => cluster.length));
}

function rowLeftOffsetSpread(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  componentId: string,
): number {
  const component = ROOM_SET_COMPONENTS.find((entry) => entry.id === componentId);
  assert.ok(component, componentId);
  const rows = clusterByCoordinate(
    placementsForComponent(placements, componentId),
    (placement) => placement.yLu + component.depthLu / 2,
    Math.max(0.8, component.depthLu * 0.32),
  ).filter((row) => row.length >= 2);
  if (rows.length <= 1) return 0;
  const leftEdges = rows.map((row) => Math.min(...row.map((placement) => placement.xLu)));
  return Math.max(...leftEdges) - Math.min(...leftEdges);
}

function placementsForComponent(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  componentId: string,
) {
  return placements.filter((placement) => placement.componentId === componentId);
}

function specSecondaryCount(spec: LayoutSpec, componentId: RoomSetComponentId): number {
  return spec.secondary.find((item) => item.componentId === componentId)?.count ?? 0;
}

function assertBanquetRemarksSupportPackage(spec: LayoutSpec): void {
  assert.equal(specSecondaryCount(spec, "fnb-buffet-line"), 1);
  assert.equal(specSecondaryCount(spec, "fnb-portable-bar"), 2);
  assert.equal(specSecondaryCount(spec, "registration-desk"), 1);
}

function assertBanquetRemarksSupportPlacements(
  placements: ComposePlannerLayoutResult["placements"],
): void {
  assert.equal(placementsForComponent(placements, "fnb-buffet-line").length, 1);
  assert.equal(placementsForComponent(placements, "fnb-portable-bar").length, 2);
  assert.equal(placementsForComponent(placements, "registration-desk").length, 1);
}

function nearestNeighborStats(
  placements: readonly Readonly<{ xLu: number; yLu: number }>[],
  componentId: string,
): Readonly<{ min: number; max: number }> {
  const component = ROOM_SET_COMPONENTS.find((entry) => entry.id === componentId);
  assert.ok(component, componentId);
  const centers = placements.map((placement) => ({
    x: placement.xLu + component.widthLu / 2,
    y: placement.yLu + component.depthLu / 2,
  }));
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (let index = 0; index < centers.length; index += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let otherIndex = 0; otherIndex < centers.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const current = centers[index]!;
      const other = centers[otherIndex]!;
      nearest = Math.min(nearest, Math.hypot(current.x - other.x, current.y - other.y));
    }
    if (!Number.isFinite(nearest)) continue;
    min = Math.min(min, nearest);
    max = Math.max(max, nearest);
  }
  return { min, max };
}

function placementCenters(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  componentId: string,
): Array<Readonly<{ x: number; y: number }>> {
  const component = ROOM_SET_COMPONENTS.find((entry) => entry.id === componentId);
  assert.ok(component, componentId);
  return placementsForComponent(placements, componentId).map((placement) => ({
    x: placement.xLu + component.widthLu / 2,
    y: placement.yLu + component.depthLu / 2,
  }));
}

function bucket3(value: number, min: number, size: number): 0 | 1 | 2 {
  const bucket = Math.floor(((value - min) / Math.max(1, size)) * 3);
  if (bucket <= 0) return 0;
  if (bucket >= 2) return 2;
  return 1;
}

function zoneCountsForComponent(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  componentId: string,
  roomWidthLu: number,
  roomDepthLu: number,
): readonly number[] {
  const zones = new Array<number>(9).fill(0);
  for (const center of placementCenters(placements, componentId)) {
    const xBucket = bucket3(center.x, 0, roomWidthLu);
    const yBucket = bucket3(center.y, 0, roomDepthLu);
    zones[yBucket * 3 + xBucket] += 1;
  }
  return zones;
}

function assertBanquetQualityGateMetrics(
  placements: ComposePlannerLayoutResult["placements"],
  room: Readonly<{ widthLu: number; depthLu: number }>,
  pattern: "structured" | "diagonal",
): void {
  const metrics = analyzeBanquetTableVisualQuality(placements, room);
  const demand = banquetTableVisualOpportunityDemand(placements, room);
  const mediumCount = metrics.tableCount >= 16;
  const highCount = metrics.tableCount >= 22;

  assert.equal(metrics.isolatedTableCount, 0, `isolated tables ${metrics.isolatedTableCount}`);
  if (highCount) {
    assert.equal(
      metrics.frontBackContinuityScore >= 0.38,
      true,
      `front/back ${metrics.frontBackContinuityScore}`,
    );
  }
  if (pattern === "structured") {
    if (mediumCount) {
      assert.equal(metrics.rowCoherenceScore >= 0.72, true, `row coherence ${metrics.rowCoherenceScore}`);
    }
  } else if (highCount) {
    assert.equal(
      metrics.diagonalCoherenceScore >= 0.5,
      true,
      `diagonal coherence ${metrics.diagonalCoherenceScore}`,
    );
  }

  if (pattern !== "structured" && highCount && demand >= 0.55) {
    assert.equal(metrics.leftRightBalanceScore >= 0.56, true, `left/right ${metrics.leftRightBalanceScore}`);
    assert.equal(
      metrics.stageSideUtilizationScore >= 0.42,
      true,
      `stage-side ${metrics.stageSideUtilizationScore}`,
    );
    assert.equal(metrics.frontBandCoverageScore >= 0.42, true, `front band ${metrics.frontBandCoverageScore}`);
    assert.equal(metrics.deadZoneRatio <= 0.76, true, `dead zone ${metrics.deadZoneRatio}`);
  }
}

function diagonalCorrelationForComponent(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  componentId: string,
): number {
  const centers = placementCenters(placements, componentId);
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
  return Math.abs(covariance / Math.sqrt(varianceX * varianceY));
}

function occupiedSubzoneCountForComponent(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  componentId: string,
  roomWidthLu: number,
  roomDepthLu: number,
): number {
  const occupied = new Set<number>();
  for (const center of placementCenters(placements, componentId)) {
    const xBucket = Math.max(0, Math.min(3, Math.floor((center.x / roomWidthLu) * 4)));
    const yBucket = Math.max(0, Math.min(3, Math.floor((center.y / roomDepthLu) * 4)));
    occupied.add(yBucket * 4 + xBucket);
  }
  return occupied.size;
}

function banquetRoundsSpec(
  densityPreference: LayoutSpec["densityPreference"],
  attendeeTarget = 250,
): LayoutSpec {
  return {
    version: 1,
    source: "ai-generate",
    eventIntent: "awards_dinner",
    layoutType: "banquet",
    attendeeTarget,
    densityPreference,
    audienceStyle: "grid",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      stage: { componentId: "stage-keynote", count: 1, zoneRole: "front" },
      av: [{ componentId: "av-speaker-stack", count: 2, zoneRole: "front" }],
    },
    audience: {
      primaryComponentId: "table-round-72",
      primaryComponentCapacity: 10,
      requiredPrimaryComponents: Math.ceil(attendeeTarget / 10),
    },
    secondary: [],
  };
}

function stageSideBanquetSpec(
  overrides: Partial<LayoutSpec> = {},
): LayoutSpec {
  return {
    version: 1,
    source: "ai-generate",
    eventIntent: "awards_dinner",
    layoutType: "banquet",
    attendeeTarget: 160,
    densityPreference: "balanced",
    audienceStyle: "scattered",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      stage: { componentId: "stage-keynote", count: 1, zoneRole: "front" },
      av: [],
    },
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 20,
    },
    secondary: [],
    ...overrides,
  };
}

function stageSideTableCount(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  tableComponentId: string,
): number {
  const distribution = stageSideTableDistribution(placements, tableComponentId);
  return distribution.left + distribution.right;
}

function stageSideTableDistribution(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  tableComponentId: string,
): Readonly<{ left: number; right: number }> {
  const stage = placements.find((placement) => placement.componentId === "stage-keynote");
  assert.ok(stage, "expected stage-keynote placement");
  const stageDef = ROOM_SET_COMPONENTS.find((entry) => entry.id === "stage-keynote");
  const tableDef = ROOM_SET_COMPONENTS.find((entry) => entry.id === tableComponentId);
  assert.ok(stageDef, "expected stage-keynote definition");
  assert.ok(tableDef, `expected ${tableComponentId} definition`);
  const stageLeft = stage.xLu;
  const stageRight = stage.xLu + stageDef.widthLu;
  const fullWidthZoneTop = stage.yLu + stageDef.depthLu + 2;
  let left = 0;
  let right = 0;
  for (const placement of placements) {
    if (placement.componentId !== tableComponentId) continue;
    const leftOfStage = placement.xLu + tableDef.widthLu <= stageLeft + 1e-6;
    const rightOfStage = placement.xLu >= stageRight - 1e-6;
    if (placement.yLu >= fullWidthZoneTop - 1e-6) continue;
    if (leftOfStage) left += 1;
    if (rightOfStage) right += 1;
  }
  return { left, right };
}

function frontCenterTableDistribution(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  tableComponentId: string,
  frontGapLu = 3,
): Readonly<{ count: number; minY: number; safeTop: number }> {
  const stage = placements.find((placement) => placement.componentId === "stage-keynote");
  assert.ok(stage, "expected stage-keynote placement");
  const stageDef = ROOM_SET_COMPONENTS.find((entry) => entry.id === "stage-keynote");
  const tableDef = ROOM_SET_COMPONENTS.find((entry) => entry.id === tableComponentId);
  assert.ok(stageDef, "expected stage-keynote definition");
  assert.ok(tableDef, `expected ${tableComponentId} definition`);
  const stageLeft = stage.xLu;
  const stageRight = stage.xLu + stageDef.widthLu;
  const safeTop = stage.yLu + stageDef.depthLu + frontGapLu;
  const safeBottom = safeTop + tableDef.depthLu * 2.5;
  const matches = placements.filter((placement) => {
    if (placement.componentId !== tableComponentId) return false;
    const centerX = placement.xLu + tableDef.widthLu / 2;
    return (
      placement.yLu >= safeTop - 1e-6 &&
      placement.yLu <= safeBottom + 1e-6 &&
      centerX >= stageLeft - 1e-6 &&
      centerX <= stageRight + 1e-6
    );
  });
  return {
    count: matches.length,
    minY: matches.length ? Math.min(...matches.map((placement) => placement.yLu)) : Number.POSITIVE_INFINITY,
    safeTop,
  };
}

function averageNearestCenterDistance(centers: readonly Readonly<{ x: number; y: number }>[]): number {
  if (centers.length <= 1) return 0;
  let total = 0;
  let count = 0;
  for (let index = 0; index < centers.length; index += 1) {
    let nearest = Number.POSITIVE_INFINITY;
    const current = centers[index]!;
    for (let otherIndex = 0; otherIndex < centers.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const other = centers[otherIndex]!;
      nearest = Math.min(nearest, Math.hypot(current.x - other.x, current.y - other.y));
    }
    if (!Number.isFinite(nearest)) continue;
    total += nearest;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function stageSideContinuityMetrics(
  placements: readonly Readonly<{ componentId: string; xLu: number; yLu: number }>[],
  tableComponentId: string,
  frontGapLu = 3,
): Readonly<{
  sideCount: number;
  mainCount: number;
  isolatedSideCount: number;
  averageBridgeDistance: number;
  maxBridgeDistance: number;
  sideToMainDensityRatio: number;
}> {
  const stage = placements.find((placement) => placement.componentId === "stage-keynote");
  assert.ok(stage, "expected stage-keynote placement");
  const stageDef = ROOM_SET_COMPONENTS.find((entry) => entry.id === "stage-keynote");
  const tableDef = ROOM_SET_COMPONENTS.find((entry) => entry.id === tableComponentId);
  assert.ok(stageDef, "expected stage-keynote definition");
  assert.ok(tableDef, `expected ${tableComponentId} definition`);
  const stageLeft = stage.xLu;
  const stageRight = stage.xLu + stageDef.widthLu;
  const safeTop = stage.yLu + stageDef.depthLu + frontGapLu;
  const sideMaxY = safeTop + tableDef.depthLu * 2.25;
  const sideCenters: Array<Readonly<{ x: number; y: number }>> = [];
  const mainCenters: Array<Readonly<{ x: number; y: number }>> = [];
  for (const placement of placements) {
    if (placement.componentId !== tableComponentId) continue;
    const center = {
      x: placement.xLu + tableDef.widthLu / 2,
      y: placement.yLu + tableDef.depthLu / 2,
    };
    const sideStage =
      placement.yLu < sideMaxY &&
      (center.x < stageLeft - 1e-6 || center.x > stageRight + 1e-6);
    if (sideStage) {
      sideCenters.push(center);
    } else {
      mainCenters.push(center);
    }
  }
  const bridgeDistances = sideCenters.map((sideCenter) =>
    Math.min(
      ...mainCenters.map((mainCenter) =>
        Math.hypot(sideCenter.x - mainCenter.x, sideCenter.y - mainCenter.y),
      ),
    ),
  );
  const averageBridgeDistance = bridgeDistances.length
    ? bridgeDistances.reduce((sum, distance) => sum + distance, 0) / bridgeDistances.length
    : 0;
  const maxBridgeDistance = bridgeDistances.length ? Math.max(...bridgeDistances) : 0;
  const sideNearest = averageNearestCenterDistance(sideCenters);
  const mainNearest = averageNearestCenterDistance(mainCenters);
  return {
    sideCount: sideCenters.length,
    mainCount: mainCenters.length,
    isolatedSideCount: bridgeDistances.filter((distance) => distance > tableDef.widthLu * 2.65).length,
    averageBridgeDistance,
    maxBridgeDistance,
    sideToMainDensityRatio: sideNearest > 0 && mainNearest > 0 ? sideNearest / mainNearest : 1,
  };
}

test("graceful fallback reports normal success without adjustments", () => {
  const spec = gracefulFallbackBaseSpec();
  const result = composeLayoutSpecWithGracefulFallback({
    spec,
    roomWidthLu: 120,
    roomDepthLu: 80,
    compose: (candidateSpec) => ({ layoutSpec: candidateSpec, result: mockComposeResult(true) }),
  });

  assert.equal(result.resultStatus, "success");
  assert.equal(result.layoutSpec, spec);
  assert.deepEqual(result.adjustments, []);
});

test("graceful fallback retries compact spacing after compose failure", () => {
  const spec = gracefulFallbackBaseSpec();
  const result = composeLayoutSpecWithGracefulFallback({
    spec,
    roomWidthLu: 120,
    roomDepthLu: 80,
    compose: (candidateSpec) => ({
      layoutSpec: candidateSpec,
      result: mockComposeResult(candidateSpec.densityPreference === "compact"),
    }),
  });

  assert.equal(result.resultStatus, "success_with_adjustments");
  assert.equal(result.layoutSpec?.densityPreference, "compact");
  assert.equal(result.adjustments.includes("Used tighter spacing to fit the room."), true);
});

test("graceful fallback allows reduced capacity at the 80 percent floor", () => {
  const spec = gracefulFallbackBaseSpec({ attendeeTarget: 100 });
  const result = composeLayoutSpecWithGracefulFallback({
    spec,
    roomWidthLu: 120,
    roomDepthLu: 80,
    compose: (candidateSpec) => ({
      layoutSpec: candidateSpec,
      result: mockComposeResult(candidateSpec.attendeeTarget === 80),
    }),
  });

  assert.equal(result.resultStatus, "success_with_adjustments");
  assert.equal(result.layoutSpec?.attendeeTarget, 80);
  assert.equal(result.adjustments.some((line) => line.includes("Requested 100 attendees. Safely placed 80.")), true);
});

test("graceful fallback fails instead of reducing below 80 percent", () => {
  const spec = gracefulFallbackBaseSpec({ attendeeTarget: 100 });
  const seenTargets: number[] = [];
  const result = composeLayoutSpecWithGracefulFallback({
    spec,
    roomWidthLu: 120,
    roomDepthLu: 80,
    compose: (candidateSpec) => {
      seenTargets.push(candidateSpec.attendeeTarget);
      return {
        layoutSpec: candidateSpec,
        result: mockComposeResult(candidateSpec.attendeeTarget === 79),
      };
    },
  });

  assert.equal(result.resultStatus, "failed");
  assert.equal(result.layoutSpec, null);
  assert.equal(seenTargets.includes(79), false);
  assert.equal(Math.min(...seenTargets), 80);
});

test("graceful fallback can drop optional support while preserving core program", () => {
  const spec = gracefulFallbackBaseSpec({
    secondary: [
      { componentId: "fnb-portable-bar", count: 2, zoneRole: "rear" },
      { componentId: "registration-desk", count: 1, zoneRole: "rear" },
    ],
  });
  const result = composeLayoutSpecWithGracefulFallback({
    spec,
    roomWidthLu: 120,
    roomDepthLu: 80,
    compose: (candidateSpec) => ({
      layoutSpec: candidateSpec,
      result: mockComposeResult(candidateSpec.attendeeTarget === 80 && candidateSpec.secondary.length === 0),
    }),
  });

  assert.equal(result.resultStatus, "success_with_adjustments");
  assert.equal(result.layoutSpec?.front.stage?.componentId, "stage-small");
  assert.equal(result.layoutSpec?.front.screen?.componentId, "av-projector-screen");
  assert.equal(result.layoutSpec?.audience.primaryComponentId, "seating-theater-row");
  assert.equal(result.layoutSpec?.secondary.length, 0);
  assert.equal(result.adjustments.some((line) => line.includes("bar service")), true);
  assert.equal(result.adjustments.some((line) => line.includes("registration/check-in")), true);
});

test("graceful fallback explains dropped banquet service when the room cannot fit it", () => {
  const spec = gracefulFallbackBaseSpec({
    eventIntent: "banquet_remarks",
    layoutType: "banquet",
    attendeeTarget: 200,
    audienceStyle: "loose",
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 25,
    },
    secondary: [
      { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
      { componentId: "fnb-portable-bar", count: 2, zoneRole: "rear" },
      { componentId: "registration-desk", count: 1, zoneRole: "rear" },
    ],
  });
  const result = composeLayoutSpecWithGracefulFallback({
    spec,
    roomWidthLu: 80,
    roomDepthLu: 48,
    compose: (candidateSpec) => ({
      layoutSpec: candidateSpec,
      result: mockComposeResult(candidateSpec.attendeeTarget === 160 && candidateSpec.secondary.length === 0),
    }),
  });

  assert.equal(result.resultStatus, "success_with_adjustments");
  assert.equal(result.layoutSpec?.attendeeTarget, 160);
  assert.equal(result.layoutSpec?.secondary.length, 0);
  assert.equal(result.adjustments.some((line) => line.includes("buffet service")), true);
  assert.equal(result.adjustments.some((line) => line.includes("bar service")), true);
  assert.equal(result.adjustments.some((line) => line.includes("registration/check-in")), true);
});

test("graceful fallback failure returns no replacement layout and apply failure copy preserves layout", () => {
  const spec = gracefulFallbackBaseSpec({ attendeeTarget: 100 });
  const result = composeLayoutSpecWithGracefulFallback({
    spec,
    roomWidthLu: 120,
    roomDepthLu: 80,
    compose: (candidateSpec) => ({
      layoutSpec: candidateSpec,
      result: mockComposeResult(false),
    }),
  });
  const applyFailure = failedApplyMessage("compose_failed");

  assert.equal(result.resultStatus, "failed");
  assert.equal(result.layoutSpec, null);
  assert.equal(result.composed, null);
  assert.equal(applyFailure.resultStatus, "failed");
  assert.equal(applyFailure.userMessageTitle, "Apply Failed");
  assert.equal(applyFailure.userMessageBody.includes("current layout"), true);
});

test("failed apply messages surface structured backend validation details", () => {
  const validated = validatePlannerLayoutPlacements(
    [
      {
        componentId: "stage-small",
        xLu: 45,
        yLu: 10,
        rotationDeg: 0,
        label: "Awards stage",
      },
    ],
    50,
    24,
  );
  assert.equal(validated.ok, false);

  const reason = "validation_failed: " + validated.issues.map((issue) => issue.message).join(" ");
  const details = plannerValidationIssuesToFailureDetails(validated.issues, {
    code: "validation_failed",
    reason,
  });
  const message = failedApplyMessage(reason, details);

  assert.equal(message.resultStatus, "failed");
  assert.equal(message.userMessageTitle, "Apply Failed");
  assert.equal(message.userMessageBody, reason);
  assert.equal(message.failureDetails?.code, "validation_failed");
  assert.deepEqual(message.failureDetails?.failedValidationChecks, [
    "room_bounds: Placement 1: stage-small at (45, 10) with size 24 ft × 12 ft extends outside the 50 ft × 24 ft room.",
  ]);
  assert.deepEqual(message.failureDetails?.affectedObjects, [
    {
      placementIndex: 1,
      componentId: "stage-small",
      name: "Awards stage",
    },
  ]);
});

function samplePlanLayoutResponsePlacements52() {
  const placements = [];
  for (let index = 0; index < 45; index += 1) {
    placements.push({
      componentId: "table-round-60" as const,
      xLu: 12 + (index % 9) * 10,
      yLu: 28 + Math.floor(index / 9) * 11,
      rotationDeg: 0,
    });
  }
  placements.push(
    { componentId: "av-projector-screen" as const, xLu: 90, yLu: 4, rotationDeg: 0 },
    { componentId: "stage-small" as const, xLu: 88, yLu: 8, rotationDeg: 0 },
    { componentId: "av-speaker-stack" as const, xLu: 82, yLu: 12, rotationDeg: 0 },
    { componentId: "av-speaker-stack" as const, xLu: 114, yLu: 12, rotationDeg: 0 },
    { componentId: "registration-desk" as const, xLu: 88, yLu: 138, rotationDeg: 0 },
    { componentId: "fnb-portable-bar" as const, xLu: 12, yLu: 140, rotationDeg: 0 },
    { componentId: "fnb-buffet-line" as const, xLu: 172, yLu: 102, rotationDeg: 0 },
  );
  assert.equal(placements.length, 52);
  return placements;
}

test("generate simulation produces a valid 200-person general session", () => {
  const scenario = buildDefaultPlannerSimulationScenarios().find(
    (entry) => entry.id === "generate-general-session-200",
  );
  assert.ok(scenario);

  const result = runPlannerSimulationScenario(scenario);
  assert.equal(result.steps.length, 1);

  const step = result.steps[0]!;
  assert.equal(step.kind, "generate");
  assert.equal(step.after.attendeeTarget, 200);
  assert.equal(step.diagnostics.afterOverlapCount, 0);
  assert.equal(step.diagnostics.afterOutOfBoundsCount, 0);
  assert.equal(step.after.placementCounts.total > 0, true);
  assert.equal(
    step.after.placements.every(
      (placement) => Number.isFinite(placement.xLu) && Number.isFinite(placement.yLu),
    ),
    true,
  );
  assert.equal(
    step.after.placements.some((placement) => placement.xLu !== 0 || placement.yLu !== 0),
    true,
  );
});

test("top-panel preset simulation scenarios generate expected layouts", () => {
  const scenarios = buildDefaultPlannerSimulationScenarios().filter(
    (entry) => entry.id.startsWith("preset-") && entry.tags?.includes("presets"),
  );
  assert.equal(scenarios.length, 8);

  for (const scenario of scenarios) {
    const result = runPlannerSimulationScenario(scenario);
    assert.equal(result.failCount, 0, scenario.id);
    assert.equal(result.steps.length, 1, scenario.id);
    const step = result.steps[0]!;
    assert.equal(step.status, "pass", scenario.id);
    assert.equal(step.diagnostics.afterOverlapCount, 0, scenario.id);
    assert.equal(step.diagnostics.afterOutOfBoundsCount, 0, scenario.id);
    assert.equal(step.expectationFailures.length, 0, scenario.id);
  }
});

test("top-panel apply simulation scenarios cover seating, support, and chained workflows", () => {
  const scenarioIds = [
    "apply-seating-training-to-rounds",
    "apply-seating-theater-to-rounds",
    "apply-seating-banquet-to-classroom",
    "apply-seating-banquet-to-networking",
    "apply-support-add-bars",
    "apply-support-bars-opposite-sides",
    "chain-training-workflow",
    "chain-banquet-workflow",
  ] as const;

  for (const scenarioId of scenarioIds) {
    const scenario = buildDefaultPlannerSimulationScenarios().find(
      (entry) => entry.id === scenarioId,
    );
    assert.ok(scenario, scenarioId);
    const result = runPlannerSimulationScenario(scenario);
    assert.equal(result.failCount, 0, scenarioId);
    assert.equal(
      result.steps.every((step) => step.diagnostics.afterOverlapCount === 0),
      true,
      scenarioId,
    );
    assert.equal(
      result.steps.every((step) => step.diagnostics.afterOutOfBoundsCount === 0),
      true,
      scenarioId,
    );
    assert.equal(
      result.steps.every((step) => step.expectationFailures.length === 0),
      true,
      scenarioId,
    );
  }
});

test("manual aligned layout style keeps banquet rounds in rows even when AI suggests arc", () => {
  const aiSpec: LayoutSpec = {
    version: 1,
    source: "ai-generate",
    eventIntent: "awards_dinner",
    layoutType: "banquet",
    attendeeTarget: 250,
    densityPreference: "compact",
    audienceStyle: "arc",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      stage: { componentId: "stage-keynote", count: 1, zoneRole: "front" },
      av: [{ componentId: "av-speaker-stack", count: 2, zoneRole: "front" }],
    },
    audience: {
      primaryComponentId: "table-round-72",
      primaryComponentCapacity: 10,
      requiredPrimaryComponents: 25,
    },
    secondary: [],
  };

  const finalized = finalizeGenerateLayoutSpec({
    spec: aiSpec,
    prompt: "Awards dinner for 250 attendees with stage.",
    sidebarCount: 250,
    sidebarLayoutStyle: "aligned",
  });

  assert.equal(finalized.spec.audienceStyle, "grid");
  assert.equal(finalized.spec.audience.primaryComponentId, "table-round-72");
  assert.equal(finalized.spec.audience.primaryComponentCapacity, 10);
  assert.equal(finalized.spec.audience.requiredPrimaryComponents, 25);

  const result = composeLayoutSpec({
    spec: finalized.spec,
    roomWidthLu: 120,
    roomDepthLu: 90,
  });
  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);

  const tables = result.placements.filter(
    (placement) => placement.componentId === "table-round-72",
  );
  assert.equal(tables.length, 25);

  const rows = clusterByCoordinate(tables, (placement) => placement.yLu, 0.2);
  const rowCounts = rows.map((row) => row.length);
  assert.equal(rows.length >= 2 && rows.length <= 4, true, `unexpected row counts ${rowCounts.join(",")}`);
  assert.equal(
    rowCounts.slice(0, -1).every((count) => count >= 6),
    true,
    `front rows should stay full enough for a readable banquet grid: ${rowCounts.join(",")}`,
  );
  assert.equal(new Set(tables.map((placement) => placement.yLu.toFixed(2))).size, rows.length);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 90 }, "structured");

  for (const row of rows) {
    const sorted = [...row].sort((a, b) => a.xLu - b.xLu);
    const gaps = sorted.slice(1).map((placement, index) => placement.xLu - sorted[index]!.xLu);
    if (gaps.length <= 1) continue;
    assert.equal(
      Math.max(...gaps) - Math.min(...gaps) <= 0.2,
      true,
      `row gaps should be consistent: ${gaps.map((gap) => gap.toFixed(2)).join(",")}`,
    );
  }

  const validated = validatePlannerLayoutPlacements(result.placements, 120, 90);
  assert.equal(validated.ok, true);
});

test("auto layout style resolves preset topology defaults", () => {
  const banquet = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 120),
    prompt: "Banquet with remarks for 120 attendees.",
    sidebarCount: 120,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 140,
    roomDepthLu: 96,
  });
  const networking = finalizeGenerateLayoutSpec({
    spec: {
      ...banquetRoundsSpec("balanced", 120),
      eventIntent: "networking_reception",
      layoutType: "reception",
      audience: {
        primaryComponentId: "table-cocktail-cluster",
        primaryComponentCapacity: 4,
        requiredPrimaryComponents: 30,
      },
    },
    prompt: "Networking reception for 120 attendees.",
    sidebarCount: 120,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 140,
    roomDepthLu: 96,
  });
  const general = finalizeGenerateLayoutSpec({
    spec: {
      ...banquetRoundsSpec("balanced", 120),
      eventIntent: "general_session",
      layoutType: "theater",
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: 9,
      },
    },
    prompt: "General session for 120 attendees.",
    sidebarCount: 120,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 140,
    roomDepthLu: 96,
  });

  assert.equal(banquet.spec.audienceStyle, "loose");
  assert.equal(networking.spec.layoutType, "reception");
  assert.equal(networking.spec.audienceStyle, "scattered");
  assert.equal(general.spec.layoutType, "theater");
  assert.equal(general.spec.audienceStyle, "grid");
});

test("layout style preference normalizer accepts old and new labels", () => {
  assert.equal(normalizeRoomSetLayoutStylePreference("aligned"), "aligned");
  assert.equal(normalizeRoomSetLayoutStylePreference("structured"), "aligned");
  assert.equal(normalizeRoomSetLayoutStylePreference("staggered"), "staggered");
  assert.equal(normalizeRoomSetLayoutStylePreference("organic"), "staggered");
  assert.equal(normalizeRoomSetLayoutStylePreference("clusters"), "clusters");
  assert.equal(normalizeRoomSetLayoutStylePreference("scattered"), "clusters");
  assert.equal(normalizeRoomSetLayoutStylePreference("Classic rows"), "theater_classic");
  assert.equal(normalizeRoomSetLayoutStylePreference("Center aisle"), "theater_center_aisle");
  assert.equal(normalizeRoomSetLayoutStylePreference("Chevron"), "theater_chevron");
  assert.equal(normalizeRoomSetLayoutStylePreference("Diagonal rows"), "theater_diagonal");
  assert.equal(normalizeRoomSetLayoutStylePreference("Q&A aisles"), "townhall_qa_aisles");
  assert.equal(normalizeRoomSetLayoutStylePreference("Social zones"), "reception_social_zones");
});

test("room-set layout style dropdown is preset-aware for theater and banquet", () => {
  const workspaceSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const styleControlSource = workspaceSource.slice(
    workspaceSource.indexOf("const hasPromptStyleContextLedger"),
    workspaceSource.indexOf("const [componentSearchLedger"),
  );
  const styleDropdownSource = workspaceSource.slice(
    workspaceSource.indexOf("function RoomSetStyleDropdownLedger"),
    workspaceSource.indexOf("const ROOM_SET_LAYER_TOGGLES"),
  );

  const theaterOptions = layoutStyleOptionsForIntent("general_session");
  const townHallOptions = layoutStyleOptionsForIntent("town_hall");
  const banquetOptions = layoutStyleOptionsForIntent("banquet_remarks");

  assert.deepEqual(theaterOptions.map((option) => option.label), ["Auto", "Rows", "Center aisle", "Chevron"]);
  assert.deepEqual(townHallOptions.map((option) => option.label), ["Auto", "Rows", "Center aisle", "Chevron"]);
  assert.deepEqual(banquetOptions.map((option) => option.label), ["Auto", "Structured", "Staggered", "Clusters"]);
  assert.equal(ROOM_SET_PROMPT_STYLE_HINT_OPTIONS.some((option) => option.group === "Audience"), true);
  assert.equal(ROOM_SET_PROMPT_STYLE_HINT_OPTIONS.some((option) => option.group === "Banquet"), true);
  assert.equal(ROOM_SET_PROMPT_STYLE_HINT_OPTIONS.some((option) => option.group === "Reception / Expo"), true);
  assert.equal(ROOM_SET_PROMPT_STYLE_HINT_OPTIONS.some((option) => option.group === "Workshop"), true);
  assert.equal(styleControlSource.includes("styleControlDisabledLedger = !stylePresetIntentLedger && !hasPromptStyleContextLedger"), true);
  assert.equal(workspaceSource.includes("Pick a preset or enter a prompt to unlock style options."), true);
  assert.equal(styleControlSource.includes('hasPromptStyleContextLedger ? "Style hint"'), true);
  assert.equal(workspaceSource.includes("layoutStyleOptionsForIntent(stylePresetIntentLedger)"), true);
  assert.equal(styleDropdownSource.includes("role=\"listbox\""), true);
  assert.equal(styleDropdownSource.includes("aria-haspopup=\"listbox\""), true);
});

test("manual layout style controls banquet and reception topology", () => {
  const aligned = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 160),
    prompt: "Awards dinner for 160 attendees.",
    sidebarCount: 160,
    sidebarLayoutStyle: "aligned",
  });
  const staggered = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 160),
    prompt: "Awards dinner for 160 attendees.",
    sidebarCount: 160,
    sidebarLayoutStyle: "staggered",
  });
  const clusters = finalizeGenerateLayoutSpec({
    spec: {
      ...banquetRoundsSpec("balanced", 160),
      eventIntent: "networking_reception",
      layoutType: "reception",
      audience: {
        primaryComponentId: "table-cocktail-cluster",
        primaryComponentCapacity: 4,
        requiredPrimaryComponents: 40,
      },
    },
    prompt: "Networking reception for 160 attendees.",
    sidebarCount: 160,
    sidebarLayoutStyle: "clusters",
  });

  assert.equal(aligned.spec.audienceStyle, "grid");
  assert.equal(staggered.spec.audienceStyle, "loose");
  assert.equal(clusters.spec.audienceStyle, "scattered");

  const alignedResult = composeLayoutSpec({
    spec: aligned.spec,
    roomWidthLu: 150,
    roomDepthLu: 110,
  });
  const staggeredResult = composeLayoutSpec({
    spec: staggered.spec,
    roomWidthLu: 150,
    roomDepthLu: 110,
  });
  const clustersResult = composeLayoutSpec({
    spec: clusters.spec,
    roomWidthLu: 150,
    roomDepthLu: 110,
  });

  assert.equal(alignedResult.ok, true);
  assert.equal(staggeredResult.ok, true);
  assert.equal(clustersResult.ok, true);

  const alignedTables = alignedResult.placements.filter(
    (placement) => placement.componentId === "table-round-72",
  );
  const staggeredTables = staggeredResult.placements.filter(
    (placement) => placement.componentId === "table-round-72",
  );
  const alignedYCount = new Set(alignedTables.map((placement) => placement.yLu.toFixed(2))).size;
  const staggeredYCount = new Set(staggeredTables.map((placement) => placement.yLu.toFixed(2))).size;
  assert.equal(staggeredYCount > alignedYCount, true);

  const clustersFootprint = placementFootprint(clustersResult.placements, ["table-cocktail-cluster"]);
  assert.equal(clustersFootprint.width >= 70, true, `clusters width ${clustersFootprint.width}`);
  assert.equal(clustersFootprint.depth >= 40, true, `clusters depth ${clustersFootprint.depth}`);
  assert.equal(validatePlannerLayoutPlacements(alignedResult.placements, 150, 110).ok, true);
  assert.equal(validatePlannerLayoutPlacements(staggeredResult.placements, 150, 110).ok, true);
  assert.equal(validatePlannerLayoutPlacements(clustersResult.placements, 150, 110).ok, true);
});

test("clusters control maps banquet rounds into deterministic scattered placement", () => {
  const banquet = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 160),
    prompt: "Awards dinner for 160 attendees.",
    sidebarCount: 160,
    sidebarLayoutStyle: "clusters",
  });

  assert.equal(banquet.spec.layoutType, "banquet");
  assert.equal(banquet.spec.audienceStyle, "scattered");

  const result = composeLayoutSpec({ spec: banquet.spec, roomWidthLu: 150, roomDepthLu: 110 });
  assert.equal(result.ok, true);
  const metrics = analyzeBanquetTableVisualQuality(result.placements, {
    widthLu: 150,
    depthLu: 110,
  });
  assert.equal(metrics.isolatedTableCount, 0);
  assert.equal(metrics.diagonalCoherenceScore >= 0.5, true, `diagonal ${metrics.diagonalCoherenceScore}`);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 150, 110).ok, true);
});

test("generate prompt locks 200 person 60 inch rounds in 120 by 72 to gated banquet field", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: stageSideBanquetSpec({
      attendeeTarget: 160,
      densityPreference: "balanced",
      audienceStyle: "grid",
      audience: {
        primaryComponentId: "table-round-72",
        primaryComponentCapacity: 10,
        requiredPrimaryComponents: 16,
      },
    }),
    prompt: "200 person banquet with 60 inch rounds in a 120 by 72 room",
    sidebarCount: 160,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  assert.equal(finalized.spec.layoutType, "banquet");
  assert.equal(finalized.spec.attendeeTarget, 200);
  assert.equal(finalized.spec.audience.primaryComponentId, "table-round-60");
  assert.equal(finalized.spec.audience.requiredPrimaryComponents, 25);

  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 25);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 72 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("banquet with remarks compact retains preset service package and cohesive table field", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: {
      ...stageSideBanquetSpec({
        attendeeTarget: 200,
        densityPreference: "balanced",
        audienceStyle: "grid",
        audience: {
          primaryComponentId: "table-round-60",
          primaryComponentCapacity: 8,
          requiredPrimaryComponents: 25,
        },
      }),
      eventIntent: "banquet_remarks",
      secondary: [],
    },
    prompt: "Banquet with remarks for 200 attendees.",
    sidebarCount: 200,
    sidebarDensityPreference: "compact",
    sidebarLayoutStyle: "staggered",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  assert.equal(finalized.spec.densityPreference, "compact");
  assert.equal(finalized.spec.audienceStyle, "loose");
  assertBanquetRemarksSupportPackage(finalized.spec);

  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 25);
  assertBanquetRemarksSupportPlacements(result.placements);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 72 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("banquet with remarks auto retains preset service package", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: {
      ...stageSideBanquetSpec({
        attendeeTarget: 200,
        densityPreference: "balanced",
        audienceStyle: "grid",
        audience: {
          primaryComponentId: "table-round-60",
          primaryComponentCapacity: 8,
          requiredPrimaryComponents: 25,
        },
      }),
      eventIntent: "banquet_remarks",
      secondary: [],
    },
    prompt: "Banquet with remarks for 200 attendees.",
    sidebarCount: 200,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  assertBanquetRemarksSupportPackage(finalized.spec);
  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 25);
  assertBanquetRemarksSupportPlacements(result.placements);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 72 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("banquet with remarks explicit no-service prompt does not add preset support", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: {
      ...stageSideBanquetSpec({
        attendeeTarget: 200,
        densityPreference: "balanced",
        audienceStyle: "grid",
        audience: {
          primaryComponentId: "table-round-60",
          primaryComponentCapacity: 8,
          requiredPrimaryComponents: 25,
        },
      }),
      eventIntent: "banquet_remarks",
      secondary: [],
    },
    prompt: "Banquet with remarks for 200 attendees, no food service or registration.",
    sidebarCount: 200,
    sidebarDensityPreference: "compact",
    sidebarLayoutStyle: "staggered",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  assert.equal(specSecondaryCount(finalized.spec, "fnb-buffet-line"), 0);
  assert.equal(specSecondaryCount(finalized.spec, "fnb-portable-bar"), 0);
  assert.equal(specSecondaryCount(finalized.spec, "registration-desk"), 0);
});

test("generate prompt preserves staggered banquet style with small stage", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: {
      ...stageSideBanquetSpec({
        attendeeTarget: 200,
        densityPreference: "balanced",
        audienceStyle: "grid",
        front: {
          screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
          stage: { componentId: "stage-small", count: 1, zoneRole: "front" },
          av: [],
        },
        audience: {
          primaryComponentId: "table-round-60",
          primaryComponentCapacity: 8,
          requiredPrimaryComponents: 25,
        },
      }),
      eventIntent: "banquet_remarks",
    },
    prompt: "Staggered banquet seating for 200 with a small stage",
    sidebarCount: 200,
    sidebarDensityPreference: "balanced",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  assert.equal(finalized.spec.audienceStyle, "loose");
  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 25);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 72 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("generate prompt preserves structured banquet style as aligned rows", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: stageSideBanquetSpec({
      attendeeTarget: 160,
      densityPreference: "balanced",
      audienceStyle: "loose",
      audience: {
        primaryComponentId: "table-round-60",
        primaryComponentCapacity: 8,
        requiredPrimaryComponents: 20,
      },
    }),
    prompt: "Structured banquet seating for 160",
    sidebarCount: 160,
    sidebarDensityPreference: "balanced",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  assert.equal(finalized.spec.audienceStyle, "grid");
  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 20);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 72 }, "structured");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("generate prompt scattered layout for 200 uses deterministic planner-quality field", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: stageSideBanquetSpec({
      attendeeTarget: 200,
      densityPreference: "premium",
      audienceStyle: "grid",
      audience: {
        primaryComponentId: "table-round-60",
        primaryComponentCapacity: 8,
        requiredPrimaryComponents: 25,
      },
    }),
    prompt: "Scattered layout for 200 banquet guests",
    sidebarCount: 200,
    sidebarDensityPreference: "premium",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  assert.equal(finalized.spec.audienceStyle, "scattered");
  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 25);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 72 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("apply recomposition preserves selected scattered banquet style", () => {
  const baseSpec = stageSideBanquetSpec({
    attendeeTarget: 160,
    densityPreference: "premium",
    audienceStyle: "scattered",
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 20,
    },
  });
  const editedSpec: LayoutSpec = {
    ...baseSpec,
    attendeeTarget: 200,
    audience: {
      ...baseSpec.audience,
      requiredPrimaryComponents: 25,
    },
  };

  const applied = composeLayoutSpecForApply({
    spec: editedSpec,
    roomWidthLu: 120,
    roomDepthLu: 72,
    applyContext: {
      baseSpec,
      prompt: "Increase attendee count to 200.",
      sidebarAttendeeCount: 200,
      sidebarDensityPreference: baseSpec.densityPreference,
    },
  });

  assert.equal(applied.layoutSpec.audienceStyle, "scattered");
  assert.equal(applied.applyAudienceStyle, "scattered");
  assert.equal(applied.result.ok, true);
  assert.equal(placementsForComponent(applied.result.placements, "table-round-60").length, 25);
  assertBanquetQualityGateMetrics(applied.result.placements, { widthLu: 120, depthLu: 72 }, "diagonal");
});

test("support objects do not force high-count banquet tables into sparse islands", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: {
      ...stageSideBanquetSpec({
        attendeeTarget: 200,
        densityPreference: "premium",
        audienceStyle: "scattered",
        audience: {
          primaryComponentId: "table-round-60",
          primaryComponentCapacity: 8,
          requiredPrimaryComponents: 25,
        },
      }),
      secondary: [
        { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
        { componentId: "fnb-portable-bar", count: 2, zoneRole: "perimeter" },
        { componentId: "registration-desk", count: 1, zoneRole: "rear" },
      ],
    },
    prompt: "Scattered banquet layout for 200 with buffet, bars, and registration",
    sidebarCount: 200,
    sidebarDensityPreference: "premium",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 140,
    roomDepthLu: 84,
  });

  assert.equal(finalized.spec.audienceStyle, "scattered");
  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 140, roomDepthLu: 84 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 25);
  assert.equal(result.placements.some((placement) => placement.componentId === "fnb-buffet-line"), true);
  assert.equal(result.placements.some((placement) => placement.componentId === "fnb-portable-bar"), true);
  assert.equal(result.placements.some((placement) => placement.componentId === "registration-desk"), true);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 140, depthLu: 84 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 140, 84).ok, true);
});

test("explicit prompt primary object count overrides attendee-derived table count", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 100),
    prompt: "25 banquet rounds",
    sidebarCount: 100,
    sidebarLayoutStyle: "auto",
    sidebarDensityPreference: "auto",
    roomWidthLu: 150,
    roomDepthLu: 110,
  });

  assert.equal(finalized.spec.attendeeTarget, 100);
  assert.equal(finalized.spec.audience.primaryComponentId, "table-round-60");
  assert.equal(finalized.spec.audience.requiredPrimaryComponents, 25);
  assert.equal(finalized.promptPrimaryObjectCount?.count, 25);

  const result = composeLayoutSpec({
    spec: finalized.spec,
    roomWidthLu: 150,
    roomDepthLu: 110,
  });
  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 25);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 150, 110).ok, true);
});

test("explicit attendee and object counts both survive generate finalization", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 100),
    prompt: "250 attendees with 25 banquet rounds",
    sidebarCount: 100,
    sidebarLayoutStyle: "auto",
    sidebarDensityPreference: "auto",
    roomWidthLu: 150,
    roomDepthLu: 110,
  });

  assert.equal(finalized.spec.attendeeTarget, 250);
  assert.equal(finalized.spec.audience.requiredPrimaryComponents, 25);
  assert.equal(finalized.spec.audience.primaryComponentCapacity, 8);
});

test("prompt topology intent overrides manual aligned layout style", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 160),
    prompt: "Scatter the rounds across the room",
    sidebarCount: 160,
    sidebarLayoutStyle: "aligned",
  });

  assert.equal(finalized.spec.layoutType, "banquet");
  assert.equal(finalized.spec.audienceStyle, "scattered");
});

test("manual staggered produces non-grid banquet placement while aligned stays aligned", () => {
  const aligned = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 180),
    prompt: "Awards dinner for 180 attendees.",
    sidebarCount: 180,
    sidebarLayoutStyle: "aligned",
  });
  const staggered = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 180),
    prompt: "Awards dinner for 180 attendees.",
    sidebarCount: 180,
    sidebarLayoutStyle: "staggered",
  });

  const alignedResult = composeLayoutSpec({
    spec: aligned.spec,
    roomWidthLu: 150,
    roomDepthLu: 110,
  });
  const staggeredResult = composeLayoutSpec({
    spec: staggered.spec,
    roomWidthLu: 150,
    roomDepthLu: 110,
  });

  assert.equal(alignedResult.ok, true);
  assert.equal(staggeredResult.ok, true);
  const alignedTables = placementsForComponent(alignedResult.placements, "table-round-72");
  const staggeredTables = placementsForComponent(staggeredResult.placements, "table-round-72");
  const alignedRows = clusterByCoordinate(alignedTables, (placement) => placement.yLu, 0.35);
  const staggeredRows = clusterByCoordinate(staggeredTables, (placement) => placement.yLu, 0.35);
  const alignedMaxRow = Math.max(...alignedRows.map((row) => row.length));
  const staggeredMaxRow = Math.max(...staggeredRows.map((row) => row.length));
  const alignedMetrics = analyzeBanquetTableVisualQuality(alignedResult.placements, {
    widthLu: 150,
    depthLu: 110,
  });
  const staggeredMetrics = analyzeBanquetTableVisualQuality(staggeredResult.placements, {
    widthLu: 150,
    depthLu: 110,
  });

  assert.equal(staggered.spec.audienceStyle, "loose");
  assert.equal(alignedMaxRow >= 5, true, `aligned max row ${alignedMaxRow}`);
  assert.equal(
    staggeredMetrics.diagonalCoherenceScore > alignedMetrics.diagonalCoherenceScore,
    true,
    `expected staggered offset rows to increase diagonal coherence: aligned ${alignedMetrics.diagonalCoherenceScore}, staggered ${staggeredMetrics.diagonalCoherenceScore}`,
  );
  assert.equal(staggeredMetrics.isolatedTableCount, 0);
  assertBanquetQualityGateMetrics(staggeredResult.placements, { widthLu: 150, depthLu: 110 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(alignedResult.placements, 150, 110).ok, true);
  assert.equal(validatePlannerLayoutPlacements(staggeredResult.placements, 150, 110).ok, true);
});

test("premium staggered banquet uses safe stage-side space and broader footprint than aligned", () => {
  const aligned = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 250),
    prompt: "Banquet with remarks for 250 attendees.",
    sidebarCount: 250,
    sidebarDensityPreference: "premium",
    sidebarLayoutStyle: "aligned",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });
  const staggered = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 250),
    prompt: "Banquet with remarks for 250 attendees.",
    sidebarCount: 250,
    sidebarDensityPreference: "premium",
    sidebarLayoutStyle: "staggered",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  const alignedResult = composeLayoutSpec({ spec: aligned.spec, roomWidthLu: 120, roomDepthLu: 72 });
  const staggeredResult = composeLayoutSpec({ spec: staggered.spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(alignedResult.ok, true);
  assert.equal(staggeredResult.ok, true);
  assert.equal(staggered.spec.audienceStyle, "loose");
  const componentId = staggered.spec.audience.primaryComponentId;
  const distribution = stageSideTableDistribution(staggeredResult.placements, componentId);
  const metrics = analyzeBanquetTableVisualQuality(staggeredResult.placements, {
    widthLu: 120,
    depthLu: 72,
  });
  const alignedFootprint = placementFootprint(alignedResult.placements, [componentId]);
  const staggeredFootprint = placementFootprint(staggeredResult.placements, [componentId]);
  assert.equal(distribution.left > 0, true, `expected left stage-side use, saw ${distribution.left}`);
  assert.equal(distribution.right > 0, true, `expected right stage-side use, saw ${distribution.right}`);
  assert.equal(
    metrics.stageSideUtilizationScore >= 0.75,
    true,
    `expected high-count staggered to use front-side opportunity, saw ${metrics.stageSideUtilizationScore}`,
  );
  assert.equal(
    staggeredFootprint.area > alignedFootprint.area,
    true,
    `expected staggered area ${staggeredFootprint.area} > aligned ${alignedFootprint.area}`,
  );
  assert.equal(metrics.diagonalCoherenceScore >= 0.65, true, `diagonal coherence ${metrics.diagonalCoherenceScore}`);
  assert.equal(metrics.isolatedTableCount, 0);
  assert.equal(validatePlannerLayoutPlacements(staggeredResult.placements, 120, 72).ok, true);
});

test("premium staggered banquet does not collapse into a centered below-stage band", () => {
  const aligned = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 250),
    prompt: "Banquet with remarks for 250 attendees.",
    sidebarCount: 250,
    sidebarDensityPreference: "premium",
    sidebarLayoutStyle: "aligned",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });
  const staggered = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 250),
    prompt: "Banquet with remarks for 250 attendees.",
    sidebarCount: 250,
    sidebarDensityPreference: "premium",
    sidebarLayoutStyle: "staggered",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  const alignedResult = composeLayoutSpec({ spec: aligned.spec, roomWidthLu: 120, roomDepthLu: 72 });
  const staggeredResult = composeLayoutSpec({ spec: staggered.spec, roomWidthLu: 120, roomDepthLu: 72 });
  assert.equal(alignedResult.ok, true);
  assert.equal(staggeredResult.ok, true);

  const componentId = staggered.spec.audience.primaryComponentId;
  const distribution = stageSideTableDistribution(staggeredResult.placements, componentId);
  const alignedFootprint = placementFootprint(alignedResult.placements, [componentId]);
  const staggeredFootprint = placementFootprint(staggeredResult.placements, [componentId]);
  const metrics = analyzeBanquetTableVisualQuality(staggeredResult.placements, {
    widthLu: 120,
    depthLu: 72,
  });
  const rowOffsetSpread = rowLeftOffsetSpread(staggeredResult.placements, componentId);

  assert.equal(distribution.left > 0, true, `expected left stage-side use, saw ${distribution.left}`);
  assert.equal(distribution.right > 0, true, `expected right stage-side use, saw ${distribution.right}`);
  assert.equal(
    metrics.stageSideUtilizationScore >= 0.75,
    true,
    `expected staggered front-side utilization, saw ${metrics.stageSideUtilizationScore}`,
  );
  assert.equal(
    staggeredFootprint.area > alignedFootprint.area,
    true,
    `expected staggered area ${staggeredFootprint.area} > aligned ${alignedFootprint.area}`,
  );
  assert.equal(
    rowOffsetSpread >= 3,
    true,
    `expected meaningful staggered row offset spread, saw ${rowOffsetSpread}`,
  );
  assert.equal(metrics.isolatedTableCount, 0);
  assert.equal(validatePlannerLayoutPlacements(staggeredResult.placements, 120, 72).ok, true);
});

test("premium staggered banquet fills safe front-center space below the stage", () => {
  const staggered = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 250),
    prompt: "Banquet with remarks for 250 attendees.",
    sidebarCount: 250,
    sidebarDensityPreference: "premium",
    sidebarLayoutStyle: "staggered",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  const result = composeLayoutSpec({ spec: staggered.spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  const componentId = staggered.spec.audience.primaryComponentId;
  const sideDistribution = stageSideTableDistribution(result.placements, componentId);
  const frontCenterDistribution = frontCenterTableDistribution(result.placements, componentId);
  const metrics = analyzeBanquetTableVisualQuality(result.placements, {
    widthLu: 120,
    depthLu: 72,
  });
  assert.equal(sideDistribution.left > 0, true, `expected left stage-side use, saw ${sideDistribution.left}`);
  assert.equal(sideDistribution.right > 0, true, `expected right stage-side use, saw ${sideDistribution.right}`);
  assert.equal(
    frontCenterDistribution.count > 0,
    true,
    `expected front-center occupancy below stage, saw ${frontCenterDistribution.count}`,
  );
  assert.equal(
    frontCenterDistribution.minY <= frontCenterDistribution.safeTop + 2,
    true,
    `expected earliest safe front-center band near ${frontCenterDistribution.safeTop}, saw ${frontCenterDistribution.minY}`,
  );
  assert.equal(metrics.frontBandCoverageScore >= 0.75, true, `front band ${metrics.frontBandCoverageScore}`);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("compact staggered banquet keeps side-stage tables connected to the main field", () => {
  const staggered = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 250),
    prompt: "Banquet with remarks for 250 attendees.",
    sidebarCount: 250,
    sidebarDensityPreference: "compact",
    sidebarLayoutStyle: "staggered",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  const result = composeLayoutSpec({ spec: staggered.spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  const componentId = staggered.spec.audience.primaryComponentId;
  const distribution = stageSideTableDistribution(result.placements, componentId);
  const metrics = analyzeBanquetTableVisualQuality(result.placements, {
    widthLu: 120,
    depthLu: 72,
  });
  assert.equal(
    distribution.left + distribution.right > 0,
    true,
    `expected compact high-count staggered to use some safe side space, saw ${distribution.left}/${distribution.right}`,
  );
  assert.equal(metrics.isolatedTableCount, 0);
  assert.equal(metrics.rowCoherenceScore >= 0.75, true, `row coherence ${metrics.rowCoherenceScore}`);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("manual staggered overrides classroom scenario default and staggers audience rows", () => {
  const base: LayoutSpec = {
    version: 1,
    source: "ai-generate",
    eventIntent: "training_session",
    layoutType: "classroom",
    attendeeTarget: 120,
    densityPreference: "balanced",
    audienceStyle: "grid",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      stage: { componentId: "stage-small", count: 1, zoneRole: "front" },
      av: [{ componentId: "av-speaker-stack", count: 2, zoneRole: "front" }],
    },
    audience: {
      primaryComponentId: "seating-classroom-row",
      primaryComponentCapacity: 12,
      requiredPrimaryComponents: 10,
    },
    secondary: [],
  };
  const aligned = finalizeGenerateLayoutSpec({
    spec: base,
    prompt: "Training session for 120 attendees.",
    sidebarCount: 120,
    sidebarLayoutStyle: "auto",
  });
  const staggered = finalizeGenerateLayoutSpec({
    spec: base,
    prompt: "Training session for 120 attendees.",
    sidebarCount: 120,
    sidebarLayoutStyle: "staggered",
  });

  assert.equal(aligned.spec.audienceStyle, "grid");
  assert.equal(staggered.spec.audienceStyle, "loose");
  const alignedResult = composeLayoutSpec({ spec: aligned.spec, roomWidthLu: 150, roomDepthLu: 96 });
  const staggeredResult = composeLayoutSpec({ spec: staggered.spec, roomWidthLu: 150, roomDepthLu: 96 });
  assert.equal(alignedResult.ok, true);
  assert.equal(staggeredResult.ok, true);
  assert.equal(
    maxAlignedColumnCount(staggeredResult.placements, "seating-classroom-row") <
      maxAlignedColumnCount(alignedResult.placements, "seating-classroom-row"),
    true,
  );
  assert.equal(validatePlannerLayoutPlacements(staggeredResult.placements, 150, 96).ok, true);
});

test("staggered regression scenario is present in the default simulation suite", () => {
  const scenario = buildDefaultPlannerSimulationScenarios().find(
    (entry) => entry.id === "staggered-high-capacity-stage-side-regression",
  );
  assert.ok(scenario, "expected targeted Staggered regression simulation scenario");

  const result = runPlannerSimulationScenario(scenario);
  assert.equal(result.status, "pass");
  assert.equal(result.steps.length, 2);
  assert.equal(result.steps[1]?.after.spec?.audienceStyle, "loose");
  assert.equal(result.steps[1]?.diagnostics.afterOverlapCount, 0);
  assert.equal(result.steps[1]?.diagnostics.afterOutOfBoundsCount, 0);
});

test("scattered banquet can use safe stage-side space in shallow rooms", () => {
  const spec = stageSideBanquetSpec({
    attendeeTarget: 160,
    densityPreference: "balanced",
    audienceStyle: "scattered",
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 20,
    },
  });

  const result = composeLayoutSpec({ spec, roomWidthLu: 90, roomDepthLu: 45 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 20);
  assert.equal(
    stageSideTableCount(result.placements, "table-round-60") > 0,
    true,
    "expected at least one round table in safe stage-side space",
  );
  assert.equal(validatePlannerLayoutPlacements(result.placements, 90, 45).ok, true);
});

test("scattered banquet uses safe left and right stage-side space when available", () => {
  const spec = stageSideBanquetSpec({
    densityPreference: "balanced",
    audienceStyle: "scattered",
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 20,
    },
  });

  const result = composeLayoutSpec({ spec, roomWidthLu: 120, roomDepthLu: 62 });

  assert.equal(result.ok, true);
  const metrics = analyzeBanquetTableVisualQuality(result.placements, {
    widthLu: 120,
    depthLu: 62,
  });
  assert.equal(metrics.isolatedTableCount, 0);
  assert.equal(metrics.diagonalCoherenceScore >= 0.55, true, `diagonal ${metrics.diagonalCoherenceScore}`);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 62).ok, true);
});

test("premium scattered banquet uses broader footprint including stage-side space", () => {
  const spec = stageSideBanquetSpec({
    densityPreference: "premium",
    audienceStyle: "scattered",
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 16,
    },
  });

  const result = composeLayoutSpec({ spec, roomWidthLu: 110, roomDepthLu: 60 });

  assert.equal(result.ok, true);
  assert.equal(stageSideTableCount(result.placements, "table-round-60") > 0, true);
  const footprint = placementFootprint(result.placements, ["table-round-60"]);
  assert.equal(footprint.width > 70, true, `expected broad premium footprint, saw ${footprint.width}`);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 110, 60).ok, true);
});

test("low-count scattered banquet stays cohesive instead of sparse and random", () => {
  const spec = stageSideBanquetSpec({
    attendeeTarget: 120,
    densityPreference: "premium",
    audienceStyle: "scattered",
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 15,
    },
  });

  const result = composeLayoutSpec({ spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  const tables = placementsForComponent(result.placements, "table-round-60");
  const footprint = placementFootprint(result.placements, ["table-round-60"]);
  const metrics = analyzeBanquetTableVisualQuality(result.placements, {
    widthLu: 120,
    depthLu: 72,
  });
  assert.equal(tables.length, 15);
  assert.equal(footprint.width >= 84, true, `expected broad low-count width, saw ${footprint.width}`);
  assert.equal(footprint.depth >= 40, true, `expected broad low-count depth, saw ${footprint.depth}`);
  assert.equal(metrics.isolatedTableCount <= 1, true, `isolated tables ${metrics.isolatedTableCount}`);
  assert.equal(metrics.diagonalCoherenceScore >= 0.55, true, `diagonal ${metrics.diagonalCoherenceScore}`);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("high-count scattered banquet keeps broad full-room distribution", () => {
  const spec = stageSideBanquetSpec({
    attendeeTarget: 200,
    densityPreference: "premium",
    audienceStyle: "scattered",
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 25,
    },
  });

  const result = composeLayoutSpec({ spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  const footprint = placementFootprint(result.placements, ["table-round-60"]);
  const tables = placementsForComponent(result.placements, "table-round-60");
  const metrics = analyzeBanquetTableVisualQuality(result.placements, {
    widthLu: 120,
    depthLu: 72,
  });
  assert.equal(tables.length, 25);
  assert.equal(footprint.width >= 95, true, `expected broad high-count width, saw ${footprint.width}`);
  assert.equal(footprint.depth >= 50, true, `expected broad high-count depth, saw ${footprint.depth}`);
  assert.equal(metrics.isolatedTableCount, 0);
  assert.equal(metrics.diagonalCoherenceScore >= 0.7, true, `diagonal ${metrics.diagonalCoherenceScore}`);
  assert.equal(metrics.stageSideUtilizationScore >= 0.75, true, `stage side ${metrics.stageSideUtilizationScore}`);
  assert.equal(metrics.frontBandCoverageScore >= 0.75, true, `front band ${metrics.frontBandCoverageScore}`);
  assert.equal(metrics.deadZoneRatio <= 0.5, true, `dead zone ${metrics.deadZoneRatio}`);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 72 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("sparse-island fallback cannot pass banquet quality gate just because it fits", () => {
  const spec = stageSideBanquetSpec({
    attendeeTarget: 200,
    densityPreference: "premium",
    audienceStyle: "scattered",
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 25,
    },
  });

  const result = composeLayoutSpec({ spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 25);
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 72 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("25 scattered banquet rounds occupy balanced zones when the full room is available", () => {
  const spec = stageSideBanquetSpec({
    attendeeTarget: 120,
    densityPreference: "premium",
    audienceStyle: "scattered",
    front: { av: [] },
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 25,
    },
  });

  const result = composeLayoutSpec({ spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  const tables = placementsForComponent(result.placements, "table-round-60");
  const footprint = placementFootprint(result.placements, ["table-round-60"]);
  const metrics = analyzeBanquetTableVisualQuality(result.placements, {
    widthLu: 120,
    depthLu: 72,
  });
  assert.equal(tables.length, 25);
  assert.equal(footprint.width >= 95, true, `expected broad full-room width, saw ${footprint.width}`);
  assert.equal(footprint.depth >= 46, true, `expected broad full-room depth, saw ${footprint.depth}`);
  assert.equal(metrics.isolatedTableCount, 0);
  assert.equal(metrics.diagonalCoherenceScore >= 0.7, true, `diagonal ${metrics.diagonalCoherenceScore}`);
  assert.equal(metrics.leftRightBalanceScore >= 0.8, true, `left/right ${metrics.leftRightBalanceScore}`);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("scattered banquet maps to a deterministic diagonal field", () => {
  const staggered = composeLayoutSpec({
    spec: stageSideBanquetSpec({
      densityPreference: "balanced",
      audienceStyle: "loose",
      audience: {
        primaryComponentId: "table-round-60",
        primaryComponentCapacity: 8,
        requiredPrimaryComponents: 20,
      },
    }),
    roomWidthLu: 130,
    roomDepthLu: 82,
  });
  const scattered = composeLayoutSpec({
    spec: stageSideBanquetSpec({
      densityPreference: "balanced",
      audienceStyle: "scattered",
      audience: {
        primaryComponentId: "table-round-60",
        primaryComponentCapacity: 8,
        requiredPrimaryComponents: 20,
      },
    }),
    roomWidthLu: 130,
    roomDepthLu: 82,
  });

  assert.equal(staggered.ok, true);
  assert.equal(scattered.ok, true);
  const metrics = analyzeBanquetTableVisualQuality(scattered.placements, {
    widthLu: 130,
    depthLu: 82,
  });
  assert.equal(metrics.isolatedTableCount, 0);
  assert.equal(metrics.diagonalCoherenceScore >= 0.65, true, `diagonal ${metrics.diagonalCoherenceScore}`);
  assert.equal(metrics.rowCoherenceScore >= 0.75, true, `row coherence ${metrics.rowCoherenceScore}`);
  assert.equal(validatePlannerLayoutPlacements(staggered.placements, 130, 82).ok, true);
  assert.equal(validatePlannerLayoutPlacements(scattered.placements, 130, 82).ok, true);
});

test("aligned banquet keeps full-width front clearance when main zone works", () => {
  const spec = stageSideBanquetSpec({
    densityPreference: "balanced",
    audienceStyle: "grid",
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 12,
    },
  });

  const result = composeLayoutSpec({ spec, roomWidthLu: 120, roomDepthLu: 80 });

  assert.equal(result.ok, true);
  assert.equal(stageSideTableCount(result.placements, "table-round-60"), 0);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 12);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 80).ok, true);
});

test("explicit tight classroom prompt overrides premium density control", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: {
      ...banquetRoundsSpec("premium", 120),
      eventIntent: "training_session",
      layoutType: "classroom",
      audience: {
        primaryComponentId: "seating-classroom-row",
        primaryComponentCapacity: 12,
        requiredPrimaryComponents: 10,
      },
    },
    prompt: "Use tight classroom rows",
    sidebarCount: 120,
    sidebarDensityPreference: "premium",
    sidebarLayoutStyle: "auto",
  });

  assert.equal(finalized.spec.layoutType, "classroom");
  assert.equal(finalized.spec.audienceStyle, "grid");
  assert.equal(finalized.spec.densityPreference, "compact");
});

test("density auto resolves concrete density and staggered premium uses more space than compact", () => {
  const compactAuto = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 220),
    prompt: "Compact banquet with remarks for 220 attendees.",
    sidebarCount: 220,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "staggered",
    roomWidthLu: 130,
    roomDepthLu: 90,
  });
  const premiumStaggered = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 200),
    prompt: "Awards dinner for 200 attendees.",
    sidebarCount: 200,
    sidebarDensityPreference: "premium",
    sidebarLayoutStyle: "staggered",
  });
  const compactStaggered = finalizeGenerateLayoutSpec({
    spec: banquetRoundsSpec("balanced", 200),
    prompt: "Awards dinner for 200 attendees.",
    sidebarCount: 200,
    sidebarDensityPreference: "compact",
    sidebarLayoutStyle: "staggered",
  });

  assert.equal(compactAuto.spec.densityPreference, "compact");
  const premiumResult = composeLayoutSpec({
    spec: premiumStaggered.spec,
    roomWidthLu: 160,
    roomDepthLu: 120,
  });
  const compactResult = composeLayoutSpec({
    spec: compactStaggered.spec,
    roomWidthLu: 160,
    roomDepthLu: 120,
  });
  assert.equal(premiumResult.ok, true);
  assert.equal(compactResult.ok, true);
  const premiumFootprint = placementFootprint(premiumResult.placements, ["table-round-72"]);
  const compactFootprint = placementFootprint(compactResult.placements, ["table-round-72"]);
  assert.equal(premiumFootprint.area > compactFootprint.area, true);
  assert.equal(validatePlannerLayoutPlacements(premiumResult.placements, 160, 120).ok, true);
  assert.equal(validatePlannerLayoutPlacements(compactResult.placements, 160, 120).ok, true);
});

test("banquet density controls audience footprint utilization", () => {
  const room = { roomWidthLu: 160, roomDepthLu: 120 };
  const premium = composeLayoutSpec({ spec: banquetRoundsSpec("premium"), ...room });
  const balanced = composeLayoutSpec({ spec: banquetRoundsSpec("balanced"), ...room });
  const compact = composeLayoutSpec({ spec: banquetRoundsSpec("compact"), ...room });

  assert.equal(premium.ok, true);
  assert.equal(balanced.ok, true);
  assert.equal(compact.ok, true);

  const premiumFootprint = placementFootprint(premium.placements, ["table-round-72"]);
  const balancedFootprint = placementFootprint(balanced.placements, ["table-round-72"]);
  const compactFootprint = placementFootprint(compact.placements, ["table-round-72"]);

  assert.equal(
    premiumFootprint.depth > balancedFootprint.depth,
    true,
    `premium depth ${premiumFootprint.depth} should exceed balanced ${balancedFootprint.depth}`,
  );
  assert.equal(
    balancedFootprint.depth > compactFootprint.depth,
    true,
    `balanced depth ${balancedFootprint.depth} should exceed compact ${compactFootprint.depth}`,
  );
  assert.equal(
    premiumFootprint.area > balancedFootprint.area,
    true,
    `premium area ${premiumFootprint.area} should exceed balanced ${balancedFootprint.area}`,
  );
  assert.equal(
    balancedFootprint.area > compactFootprint.area,
    true,
    `balanced area ${balancedFootprint.area} should exceed compact ${compactFootprint.area}`,
  );

  assert.equal(validatePlannerLayoutPlacements(premium.placements, room.roomWidthLu, room.roomDepthLu).ok, true);
  assert.equal(validatePlannerLayoutPlacements(balanced.placements, room.roomWidthLu, room.roomDepthLu).ok, true);
  assert.equal(validatePlannerLayoutPlacements(compact.placements, room.roomWidthLu, room.roomDepthLu).ok, true);
});

test("balanced banquet rounds use available depth instead of compressing into a tiny block", () => {
  const result = composeLayoutSpec({
    spec: banquetRoundsSpec("balanced", 250),
    roomWidthLu: 160,
    roomDepthLu: 120,
  });

  assert.equal(result.ok, true);
  const footprint = placementFootprint(result.placements, ["table-round-72"]);
  assert.equal(
    footprint.depth >= 42,
    true,
    `balanced banquet depth should use available room depth, got ${footprint.depth}`,
  );
  assert.equal(validatePlannerLayoutPlacements(result.placements, 160, 120).ok, true);
});

test("theater and classroom layouts remain valid with density utilization", () => {
  const theater = composeLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      layoutType: "theater",
      attendeeTarget: 180,
      densityPreference: "balanced",
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(180 / 14),
      },
    }),
    roomWidthLu: 140,
    roomDepthLu: 96,
  });
  const classroom = composeLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      layoutType: "classroom",
      attendeeTarget: 120,
      densityPreference: "balanced",
      audience: {
        primaryComponentId: "seating-classroom-row",
        primaryComponentCapacity: 12,
        requiredPrimaryComponents: 10,
      },
    }),
    roomWidthLu: 140,
    roomDepthLu: 96,
  });

  assert.equal(theater.ok, true);
  assert.equal(classroom.ok, true);
  assert.equal(theater.placements.some((placement) => placement.componentId === "seating-theater-row"), true);
  assert.equal(classroom.placements.some((placement) => placement.componentId === "seating-classroom-row"), true);
  assert.equal(validatePlannerLayoutPlacements(theater.placements, 140, 96).ok, true);
  assert.equal(validatePlannerLayoutPlacements(classroom.placements, 140, 96).ok, true);
});

test("general session generates clean forward-facing theater rows", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      eventIntent: "general_session",
      layoutType: "theater",
      attendeeTarget: 200,
      audienceStyle: "grid",
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(200 / 14),
      },
    }),
    prompt: "Create a general session theater keynote for 200 people.",
    sidebarCount: 200,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });
  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });
  const metrics = analyzeTheaterAudienceVisualQuality(result.placements, { widthLu: 120, depthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(finalized.spec.eventIntent, "general_session");
  assert.equal(finalized.spec.layoutType, "theater");
  assert.equal(finalized.spec.audienceStyle, "grid");
  assert.equal(rowPlacementCount(result.placements), finalized.spec.audience.requiredPrimaryComponents);
  assert.equal(metrics.rowCoherenceScore >= 0.85, true, `row coherence ${metrics.rowCoherenceScore}`);
  assert.equal(metrics.focalAlignmentScore >= 0.85, true, `focal alignment ${metrics.focalAlignmentScore}`);
  assert.equal(metrics.frontBackContinuityScore >= 0.85, true, `front/back ${metrics.frontBackContinuityScore}`);
  assert.equal(metrics.frontClearanceScore >= 0.55, true, `front clearance ${metrics.frontClearanceScore}`);
});

test("general session 200 in a 120 by 72 room repeatedly resolves to high-capacity theater rows", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      eventIntent: "general_session",
      layoutType: "theater",
      attendeeTarget: 200,
      audienceStyle: "grid",
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(200 / 14),
      },
    }),
    prompt: "General session for 200 attendees in a 120 by 72 room.",
    sidebarCount: 200,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });
  const signatures = new Set<string>();

  for (let run = 0; run < 8; run += 1) {
    const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });
    const capacity = sumPlatedSeatCapacity(result.placements);
    const rowSignature = result.placements
      .filter((placement) => placement.componentId === "seating-theater-row")
      .map((placement) => `${placement.xLu.toFixed(3)},${placement.yLu.toFixed(3)}`)
      .join("|");

    assert.equal(result.ok, true);
    assert.equal(capacity >= 196, true, `capacity ${capacity}`);
    signatures.add(rowSignature);
  }

  assert.equal(signatures.size, 1);
});

test("general session ignores stale generic staggered sidebar style", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      eventIntent: "general_session",
      layoutType: "theater",
      attendeeTarget: 200,
      audienceStyle: "grid",
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(200 / 14),
      },
    }),
    prompt: "General session for 200 attendees.",
    sidebarCount: 200,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "staggered",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });

  assert.equal(finalized.spec.layoutType, "theater");
  assert.equal(finalized.spec.audienceStyle, "grid");
});

test("low-capacity theater subsets cannot beat a higher-capacity gated theater candidate", () => {
  const spec = gracefulFallbackBaseSpec({
    eventIntent: "general_session",
    layoutType: "theater",
    attendeeTarget: 200,
    densityPreference: "balanced",
    audienceStyle: "grid",
    audience: {
      primaryComponentId: "seating-theater-row",
      primaryComponentCapacity: 14,
      requiredPrimaryComponents: Math.ceil(200 / 14),
    },
  });
  const result = composeLayoutSpec({ spec, roomWidthLu: 120, roomDepthLu: 72 });
  const capacity = sumPlatedSeatCapacity(result.placements);

  assert.equal(result.ok, true);
  assert.equal(capacity >= 196, true, `capacity ${capacity}`);
  assert.notEqual(capacity, 56);
});

test("theater prompt with staggered rows maps to mirrored chevron banks", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      eventIntent: "general_session",
      layoutType: "theater",
      attendeeTarget: 200,
      audienceStyle: "grid",
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(200 / 14),
      },
    }),
    prompt: "General session for 200 with staggered rows.",
    sidebarCount: 200,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });
  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });
  const metrics = analyzeTheaterAudienceVisualQuality(result.placements, { widthLu: 120, depthLu: 72 });
  const chairBanks = result.placements.filter(
    (placement) => placement.componentId === "seating-theater-row" && Math.abs(placement.rotationDeg) === 7,
  );
  const rotations = new Set(chairBanks.map((placement) => placement.rotationDeg));

  assert.equal(finalized.spec.layoutType, "theater");
  assert.equal(finalized.spec.audienceStyle, "loose");
  assert.equal(result.ok, true);
  assert.equal(chairBanks.length >= 14, true, `chair banks ${chairBanks.length}`);
  assert.equal(rotations.has(-7), true);
  assert.equal(rotations.has(7), true);
  assert.equal(averageCenterAisleGap(result.placements, 120) >= 5, true, `center gap ${averageCenterAisleGap(result.placements, 120)}`);
  assert.equal(metrics.aisleCoherenceScore >= 0.45, true, `aisle ${metrics.aisleCoherenceScore}`);
  assert.equal(sumPlatedSeatCapacity(result.placements) >= 196, true, `capacity ${sumPlatedSeatCapacity(result.placements)}`);
});

test("general session chevron style produces paired banks and avoids tiny capacity", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      eventIntent: "general_session",
      layoutType: "theater",
      attendeeTarget: 200,
      audienceStyle: "grid",
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(200 / 14),
      },
    }),
    prompt: "General session for 200 attendees.",
    sidebarCount: 200,
    sidebarDensityPreference: "balanced",
    sidebarLayoutStyle: "theater_chevron",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });
  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });
  const banks = result.placements.filter(
    (placement) => placement.componentId === "seating-theater-row" && Math.abs(placement.rotationDeg) === 7,
  );
  const bands = clusterByCoordinate(banks, (placement) => placement.yLu, 0.4);
  const capacity = sumPlatedSeatCapacity(result.placements);

  assert.equal(result.ok, true);
  assert.equal(finalized.spec.audienceStyle, "loose");
  assert.equal(capacity >= 196, true, `capacity ${capacity}`);
  assert.equal(banks.length >= 14, true, `bank count ${banks.length}`);
  assert.equal(bands.every((band) => band.length === 2), true, `bands ${bands.map((band) => band.length).join(",")}`);
  assert.equal(averageCenterAisleGap(result.placements, 120) >= 5, true, `center gap ${averageCenterAisleGap(result.placements, 120)}`);
  assert.equal(new Set(banks.map((placement) => placement.rotationDeg)).has(-7), true);
  assert.equal(new Set(banks.map((placement) => placement.rotationDeg)).has(7), true);
});

test("AI audience style variance does not destabilize unstyled general-session generation", () => {
  const capacities: number[] = [];
  for (const aiAudienceStyle of ["grid", "loose", "scattered", "arc"] as const) {
    const finalized = finalizeGenerateLayoutSpec({
      spec: gracefulFallbackBaseSpec({
        eventIntent: "general_session",
        layoutType: "theater",
        attendeeTarget: 200,
        audienceStyle: aiAudienceStyle,
        audience: {
          primaryComponentId: "seating-theater-row",
          primaryComponentCapacity: 14,
          requiredPrimaryComponents: Math.ceil(200 / 14),
        },
      }),
      prompt: "General session for 200 attendees.",
      sidebarCount: 200,
      sidebarDensityPreference: "auto",
      sidebarLayoutStyle: "auto",
      roomWidthLu: 120,
      roomDepthLu: 72,
    });
    const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });

    assert.equal(finalized.spec.layoutType, "theater");
    assert.equal(finalized.spec.audienceStyle, "grid");
    assert.equal(result.ok, true);
    capacities.push(sumPlatedSeatCapacity(result.placements));
  }

  assert.deepEqual(capacities.map((capacity) => capacity >= 196), [true, true, true, true]);
});

test("theater diagonal rows produce intentional deterministic row geometry", () => {
  const finalized = finalizeGenerateLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      eventIntent: "general_session",
      layoutType: "theater",
      attendeeTarget: 200,
      audienceStyle: "grid",
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(200 / 14),
      },
    }),
    prompt: "Create a theater layout with diagonal rows for 200 people.",
    sidebarCount: 200,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });
  const result = composeLayoutSpec({ spec: finalized.spec, roomWidthLu: 120, roomDepthLu: 72 });
  const metrics = analyzeTheaterAudienceVisualQuality(result.placements, { widthLu: 120, depthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(finalized.spec.audienceStyle, "arc");
  assert.equal(rowPlacementCount(result.placements), finalized.spec.audience.requiredPrimaryComponents);
  assert.equal(metrics.diagonalCoherenceScore >= 0.7, true, `diagonal ${metrics.diagonalCoherenceScore}`);
  assert.equal(metrics.rowCoherenceScore >= 0.85, true, `row coherence ${metrics.rowCoherenceScore}`);
  assert.equal(metrics.focalAlignmentScore >= 0.8, true, `focal alignment ${metrics.focalAlignmentScore}`);
});

test("town hall generates distinct speaker and Q&A access geometry", () => {
  const townHall = finalizeGenerateLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      eventIntent: "town_hall",
      layoutType: "theater",
      attendeeTarget: 200,
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(200 / 14),
      },
    }),
    prompt: "Town hall speaker session with Q&A for 200 people.",
    sidebarCount: 200,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });
  const theater = finalizeGenerateLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      eventIntent: "general_session",
      layoutType: "theater",
      attendeeTarget: 200,
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(200 / 14),
      },
    }),
    prompt: "General session theater keynote for 200 people.",
    sidebarCount: 200,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  });
  const townHallResult = composeLayoutSpec({ spec: townHall.spec, roomWidthLu: 120, roomDepthLu: 72 });
  const theaterResult = composeLayoutSpec({ spec: theater.spec, roomWidthLu: 120, roomDepthLu: 72 });
  const townHallMetrics = analyzeTownHallAudienceVisualQuality(townHallResult.placements, {
    widthLu: 120,
    depthLu: 72,
  });

  assert.equal(townHallResult.ok, true);
  assert.equal(townHall.spec.eventIntent, "town_hall");
  assert.equal(townHall.spec.layoutType, "theater");
  assert.equal(rowPlacementCount(townHallResult.placements), townHall.spec.audience.requiredPrimaryComponents);
  assert.equal(townHallMetrics.qaAccessScore >= 0.58, true, `Q&A access ${townHallMetrics.qaAccessScore}`);
  assert.equal(townHallMetrics.frontZoneUsabilityScore >= 0.62, true, `front zone ${townHallMetrics.frontZoneUsabilityScore}`);
  assert.equal(
    averageCenterAisleGap(townHallResult.placements, 120) > averageCenterAisleGap(theaterResult.placements, 120) + 1.5,
    true,
    `town hall aisle ${averageCenterAisleGap(townHallResult.placements, 120)} theater aisle ${averageCenterAisleGap(theaterResult.placements, 120)}`,
  );
});

test("apply flow preserves town hall preset and chevron row style", () => {
  const baseSpec = finalizeGenerateLayoutSpec({
    spec: gracefulFallbackBaseSpec({
      eventIntent: "town_hall",
      layoutType: "theater",
      attendeeTarget: 160,
      audience: {
        primaryComponentId: "seating-theater-row",
        primaryComponentCapacity: 14,
        requiredPrimaryComponents: Math.ceil(160 / 14),
      },
    }),
    prompt: "Town hall speaker session for 160 people.",
    sidebarCount: 160,
    sidebarDensityPreference: "auto",
    sidebarLayoutStyle: "auto",
    roomWidthLu: 120,
    roomDepthLu: 72,
  }).spec;
  const applied = composeLayoutSpecForApply({
    spec: baseSpec,
    roomWidthLu: 120,
    roomDepthLu: 72,
    applyContext: {
      baseSpec,
      prompt: "Use staggered rows for the Q&A audience.",
      sidebarAttendeeCount: 160,
      sidebarDensityPreference: "auto",
      sidebarLayoutStyle: "auto",
    },
  });
  const metrics = analyzeTownHallAudienceVisualQuality(applied.result.placements, { widthLu: 120, depthLu: 72 });
  const chairBanks = applied.result.placements.filter(
    (placement) => placement.componentId === "seating-theater-row" && Math.abs(placement.rotationDeg) === 7,
  );

  assert.equal(applied.result.ok, true);
  assert.equal(applied.layoutSpec.eventIntent, "town_hall");
  assert.equal(applied.layoutSpec.layoutType, "theater");
  assert.equal(applied.layoutSpec.audienceStyle, "loose");
  assert.equal(chairBanks.length >= 12, true, `chair banks ${chairBanks.length}`);
  assert.equal(averageCenterAisleGap(applied.result.placements, 120) >= 5, true, `center gap ${averageCenterAisleGap(applied.result.placements, 120)}`);
  assert.equal(metrics.qaAccessScore >= 0.55, true, `Q&A access ${metrics.qaAccessScore}`);
});

test("theater graceful fallback rejects severe low-capacity row fallback", () => {
  const spec = gracefulFallbackBaseSpec({
    eventIntent: "general_session",
    layoutType: "theater",
    attendeeTarget: 200,
    densityPreference: "balanced",
    audience: {
      primaryComponentId: "seating-theater-row",
      primaryComponentCapacity: 14,
      requiredPrimaryComponents: Math.ceil(200 / 14),
    },
  });
  const fallback = composeLayoutSpecWithGracefulFallback({
    spec,
    roomWidthLu: 120,
    roomDepthLu: 72,
    compose: (candidateSpec) => {
      if (candidateSpec.densityPreference !== "compact") {
        return {
          layoutSpec: candidateSpec,
          result: {
            ok: false,
            scene: null,
            placements: [],
            issues: [{ code: "forced_first_candidate_failure", message: "Force fallback candidate." }],
            warnings: [],
          },
        };
      }
      return {
        layoutSpec: candidateSpec,
        result: {
          ok: true,
          scene: null,
          placements: [{ componentId: "seating-theater-row", xLu: 8, yLu: 24, rotationDeg: 0 }],
          issues: [],
          warnings: [],
        },
      };
    },
  });
  assert.equal(fallback.resultStatus, "failed");
  assert.equal(fallback.composed, null);
  assert.equal(fallback.appliedSeatCapacity, 0);
  assert.match(fallback.debugReason ?? "", /compose_rows_failed/);
});

test("networking reception clusters remain distributed", () => {
  const spec: LayoutSpec = {
    version: 1,
    source: "ai-generate",
    eventIntent: "networking_reception",
    layoutType: "reception",
    attendeeTarget: 160,
    densityPreference: "balanced",
    audienceStyle: "loose",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      av: [],
    },
    audience: {
      primaryComponentId: "table-cocktail-cluster",
      primaryComponentCapacity: 4,
      requiredPrimaryComponents: 24,
    },
    secondary: [{ componentId: "lounge-chair", count: 6, zoneRole: "perimeter" }],
  };
  const result = composeLayoutSpec({ spec, roomWidthLu: 150, roomDepthLu: 100 });

  assert.equal(result.ok, true);
  const footprint = placementFootprint(result.placements, ["table-cocktail-cluster"]);
  assert.equal(footprint.width >= 70, true, `networking footprint width ${footprint.width}`);
  assert.equal(footprint.depth >= 25, true, `networking footprint depth ${footprint.depth}`);
  assert.equal(validatePlannerLayoutPlacements(result.placements, 150, 100).ok, true);
});

test("apply density prompts adjust banquet utilization directionally", () => {
  const baseSpec = banquetRoundsSpec("balanced", 200);
  const spread = composeLayoutSpecForApply({
    spec: baseSpec,
    roomWidthLu: 150,
    roomDepthLu: 110,
    applyContext: {
      baseSpec,
      prompt: "Spread the tables out more",
      sidebarAttendeeCount: baseSpec.attendeeTarget,
      sidebarDensityPreference: baseSpec.densityPreference,
    },
  });
  const tighter = composeLayoutSpecForApply({
    spec: baseSpec,
    roomWidthLu: 150,
    roomDepthLu: 110,
    applyContext: {
      baseSpec,
      prompt: "Make the room tighter",
      sidebarAttendeeCount: baseSpec.attendeeTarget,
      sidebarDensityPreference: baseSpec.densityPreference,
    },
  });

  assert.equal(spread.result.ok, true);
  assert.equal(tighter.result.ok, true);
  const spreadFootprint = placementFootprint(spread.result.placements, ["table-round-72"]);
  const tighterFootprint = placementFootprint(tighter.result.placements, ["table-round-72"]);
  assert.equal(
    spreadFootprint.area > tighterFootprint.area,
    true,
    `spread area ${spreadFootprint.area} should exceed tighter ${tighterFootprint.area}`,
  );
  assert.equal(validatePlannerLayoutPlacements(spread.result.placements, 150, 110).ok, true);
  assert.equal(validatePlannerLayoutPlacements(tighter.result.placements, 150, 110).ok, true);
});

test("room-set result copy does not render Fit fits", () => {
  const source = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.equal(source.includes("Fit {generationValidationLedger.fitStatus.replaceAll"), false);
  assert.equal(source.includes("· fit ${validationLedger.fitStatus.replaceAll"), false);
  assert.equal(source.includes("formatFitStatusCopy"), true);
});

test("room-set UI source keeps component adder wide and selected object delete enabled", () => {
  const workspaceSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.equal(workspaceSource.includes('renderComponentAdderLedger("max-w-2xl")'), false);
  assert.equal(workspaceSource.includes('renderComponentAdderLedger("w-full")'), true);
  assert.equal(workspaceSource.includes("md:grid-cols-2 xl:grid-cols-3"), true);
  assert.equal(workspaceSource.includes("componentAdderScrollRef"), true);
  assert.equal(workspaceSource.includes('if (activeWorkspaceTabLedger === "component-adder") return;'), true);
  assert.equal(workspaceSource.includes("const componentAdderScrollTopLedger"), true);
  assert.equal(workspaceSource.includes("reviseControlsExpandedLedger(true);"), true);
  assert.equal(workspaceSource.includes("componentAdderScrollRef.current.scrollTop = componentAdderScrollTopLedger"), true);
  assert.equal(canvasSource.includes('event.key !== "Delete" && event.key !== "Backspace"'), true);
  assert.equal(canvasSource.includes("onKeyDown={handleKeyDown}"), true);
  assert.equal(canvasSource.includes("setDraftScene((prior) =>"), true);
  assert.equal(canvasSource.includes("showLabel ?"), true);
  assert.equal(canvasSource.includes("title={isDragging ? undefined : accessibleLabel}"), true);
  assert.equal(canvasSource.includes("PlantClusterAdornment"), true);
});

test("room-set workspace syncs live canvas edits before component add can replay stale snapshots", () => {
  const workspaceSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const insertHandlerSource = workspaceSource.slice(
    workspaceSource.indexOf("const handleInsertComponentLedger"),
    workspaceSource.indexOf("useEffect(() => {", workspaceSource.indexOf("const handleInsertComponentLedger")),
  );

  assert.equal(workspaceSource.includes("const handlePrototypeDraftSceneChangeLedger"), true);
  assert.equal(workspaceSource.includes("onDraftSceneChange={handlePrototypeDraftSceneChangeLedger}"), true);
  assert.equal(workspaceSource.includes("scene={prototypeSceneLedger}"), true);
  assert.equal(workspaceSource.includes("selectionClearNonce={prototypeSelectionClearNonceLedger}"), true);
  assert.equal(insertHandlerSource.includes("resolveCurrentPrototypeSceneLedger();"), true);
  assert.equal(insertHandlerSource.includes("revisePrototypeSceneLedger({"), true);
  assert.equal(insertHandlerSource.includes("objects: [...sceneLedger.objects, manualObjectLedger]"), true);
});

test("room-set workspace suppresses snapshot hydration from overwriting dirty local deletes", () => {
  const workspaceSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const hydrationSource = workspaceSource.slice(
    workspaceSource.indexOf("const hydratePrototypeSceneFromDocument"),
    workspaceSource.indexOf("const resolveCurrentPrototypeSceneLedger"),
  );

  assert.equal(workspaceSource.includes("hydratePrototypeSceneFromDocument(documentLedger);"), true);
  assert.equal(hydrationSource.includes("documentLedgerHost.plannerScenes?.[documentLedgerHost.activeLayoutId]"), true);
  assert.equal(hydrationSource.includes("parsePlannerSceneJson(JSON.stringify(rawPlannerSceneLedger))"), true);
  assert.equal(hydrationSource.includes("blankPlannerSceneFromBoundary"), true);
  assert.equal(hydrationSource.includes("revisePrototypeSceneLedger(nextSceneLedger);"), true);
});

test("room-set numeric inputs use draft text state and commit only after editing", () => {
  const draftInputSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/draft-number-input.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const workspaceSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const generatePanelSource = workspaceSource.slice(
    workspaceSource.indexOf("const renderGeneratePanelLedger"),
    workspaceSource.indexOf("const renderOperationalPanelLedger"),
  );

  assert.equal(draftInputSource.includes("useState"), true);
  assert.equal(draftInputSource.includes('type="text"'), true);
  assert.equal(draftInputSource.includes('inputMode="decimal"'), true);
  assert.equal(draftInputSource.includes('trimmed === ""'), true);
  assert.equal(draftInputSource.includes('trimmed === "."'), true);
  assert.equal(draftInputSource.includes('event.key === "Enter"'), true);
  assert.equal(draftInputSource.includes('event.key === "Escape"'), true);
  assert.equal(draftInputSource.includes("onCommit(next)"), true);
  assert.equal(workspaceSource.includes("DraftNumberInput"), true);
  assert.equal(generatePanelSource.includes("DraftNumberInput"), true);
  assert.equal(canvasSource.includes("data-chair-edit-controls=\"true\""), true);
  assert.equal(canvasSource.includes("selectedEditConfig?.properties.includes(\"rotation\")"), true);
  assert.equal(canvasSource.includes("DraftNumberInput"), true);
  assert.equal(canvasSource.includes("const editNumber ="), false);
  assert.equal(workspaceSource.includes("Number(evtLedger.target.value) || 1"), false);
});

test("prototype renderer has distinct lounge chair, 6ft table, and readable hover label rendering", () => {
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.equal(canvasSource.includes("function isLoungeChairObject"), true);
  assert.equal(canvasSource.includes('object.componentId === "lounge-chair"'), true);
  assert.equal(canvasSource.includes("isLoungeChairObject(object)"), true);
  assert.equal(canvasSource.includes("bg-rose-400/72"), true);
  assert.equal(canvasSource.includes("function isRectangularBanquetTableObject"), true);
  assert.equal(canvasSource.includes('object.componentId === "table-banquet-6ft"'), true);
  assert.match(canvasSource, /<TableSeatMarkers[\s\S]*object=\{object\}[\s\S]*shape="rectangle"[\s\S]*\/>/);
  assert.equal(canvasSource.includes("labelUi.callout"), true);
  assert.equal(canvasSource.includes("top-full mt-1.5"), true);
  assert.equal(canvasSource.includes("WebkitLineClamp: labelUi.callout ? 3 : 2"), true);
  assert.equal(canvasSource.includes("function shouldShowPermanentTypeBadge"), true);
  assert.equal(canvasSource.includes("if (object.capacity.seated > 0) return false"), true);
  assert.equal(canvasSource.includes("const showLabel = !isDragging && (isHovered || isSelected || isFocused);"), true);
  assert.equal(canvasSource.includes("onFocus={() => setIsFocused(true)}"), true);
  assert.equal(canvasSource.includes("onBlur={() => setIsFocused(false)}"), true);
  assert.equal(canvasSource.includes("showBadgeRail"), true);
  assert.equal(canvasSource.includes("function shouldShowCapacityBadge"), true);
  assert.equal(canvasSource.includes("return `${object.capacity.staff} staff`;"), true);
  assert.equal(canvasSource.includes("return `Staff ${object.capacity.staff}`;"), false);
  assert.equal(canvasSource.includes("max-w-[42%]"), true);
  assert.equal(canvasSource.includes("max-w-[58%]"), true);
  assert.equal(canvasSource.includes("whitespace-nowrap"), true);
  assert.equal(canvasSource.includes("absolute z-50"), true);
  assert.equal(canvasSource.includes("isStaffBadge"), true);
  assert.equal(canvasSource.includes("bg-slate-950/92 text-white"), true);
  assert.equal(
    canvasSource.indexOf("ObjectAdornment object={object}") < canvasSource.indexOf("{showBadgeRail ?"),
    true,
  );
});

test("prototype renderer gives self check-in kiosk a recognizable event-tech silhouette", () => {
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const kioskSource = canvasSource.slice(
    canvasSource.indexOf('object.metadata.visualVariant === "kiosk"'),
    canvasSource.indexOf("return null;", canvasSource.indexOf('object.metadata.visualVariant === "kiosk"')),
  );

  assert.equal(kioskSource.includes('data-kiosk-part="screen-face"'), true);
  assert.equal(kioskSource.includes('data-kiosk-part="body"'), true);
  assert.equal(kioskSource.includes('data-kiosk-part="pedestal"'), true);
  assert.equal(kioskSource.includes('data-kiosk-part="base"'), true);
  assert.equal(kioskSource.includes("bg-slate-950/96"), true);
  assert.equal(kioskSource.includes("inset-x-[18%] top-[8%] h-[50%]"), true);
  assert.equal(kioskSource.includes("linear-gradient(160deg"), true);
  assert.equal(canvasSource.includes("const showLabel = !isDragging && (isHovered || isSelected || isFocused);"), true);
  assert.equal(canvasSource.includes("top-full mt-1.5"), true);
  assert.equal(canvasSource.includes("absolute z-50"), true);
});

test("prototype renderer gives queue lane recognizable stanchion and belt rendering", () => {
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const queueSource = canvasSource.slice(
    canvasSource.indexOf("function QueueLaneAdornment"),
    canvasSource.indexOf("function ObjectAdornment", canvasSource.indexOf("function QueueLaneAdornment")),
  );
  const zoneRenderSource = canvasSource.slice(
    canvasSource.indexOf("const isQueueLane"),
    canvasSource.indexOf("{showBadgeRail ?"),
  );

  assert.equal(canvasSource.includes('object.componentId === "registration-queue-lane"'), true);
  assert.equal(queueSource.includes('data-queue-part="stanchion-post"'), true);
  assert.equal(queueSource.includes('data-queue-part="flow-line"'), true);
  assert.equal(queueSource.includes('data-queue-part="flow-dash"'), true);
  assert.equal(queueSource.includes('data-queue-part="flow-cue"'), true);
  assert.equal(queueSource.includes("Array.from({ length: 4 })"), true);
  assert.equal(zoneRenderSource.includes("isQueueLane ?"), true);
  assert.equal(zoneRenderSource.includes("<QueueLaneAdornment />"), true);
  assert.equal(zoneRenderSource.includes("border-cyan-100/20"), true);
  assert.equal(canvasSource.includes("const showLabel = !isDragging && (isHovered || isSelected || isFocused);"), true);
});

test("door entry component is cataloged for manual placement without capacity", () => {
  const door = getRoomSetComponent("door-entry");
  assert.ok(door);
  assert.equal(door.category, "walls");
  assert.equal(door.capacitySeated, 0);
  assert.equal(door.capacityStaff, 0);
  assert.equal(door.visualVariant, "door");
  assert.equal(door.widthLu > 0, true);
  assert.equal(door.depthLu > 0, true);

  const grouped = groupRoomSetComponentsByCategory(ROOM_SET_COMPONENTS);
  assert.equal(grouped.get("walls")?.some((component) => component.id === "door-entry"), true);
});

test("manual chair components are cataloged for seating workflows and search", () => {
  const expected = [
    ["seating-chair-single", 1],
    ["seating-chair-row-5", 5],
    ["seating-chair-row-10", 10],
    ["seating-chair-block-20", 20],
    ["seating-chair-block-custom", 12],
  ] as const;

  for (const [componentId, capacity] of expected) {
    const component = getRoomSetComponent(componentId);
    assert.ok(component);
    assert.equal(component.category, "seating");
    assert.equal(component.domainKind, "chair_block");
    assert.equal(component.capacitySeated, capacity);
    assert.equal(component.capacityStaff, 0);
  }

  const grouped = groupRoomSetComponentsByCategory(ROOM_SET_COMPONENTS);
  const seatingIds = new Set(grouped.get("seating")?.map((component) => component.id));
  for (const [componentId] of expected) assert.equal(seatingIds.has(componentId), true);

  const searchIds = new Set(searchRoomSetComponents("chair").map((component) => component.id));
  for (const [componentId] of expected) assert.equal(searchIds.has(componentId), true);
});

test("table catalog capacities match displayed table semantics", () => {
  const round60 = getRoomSetComponent("table-round-60");
  const round72 = getRoomSetComponent("table-round-72");
  const banquet6ft = getRoomSetComponent("table-banquet-6ft");
  const classroomRow = getRoomSetComponent("seating-classroom-row");

  assert.ok(round60);
  assert.ok(round72);
  assert.ok(banquet6ft);
  assert.ok(classroomRow);
  assert.equal(round60.capacitySeated, 8);
  assert.equal(round72.capacitySeated, 10);
  assert.equal(banquet6ft.capacitySeated, 6);
  assert.equal(banquet6ft.visualVariant, "rect");
  assert.equal(banquet6ft.description.includes("Two-sided"), true);
  assert.equal(classroomRow.capacitySeated, 12);
  assert.equal(getRoomSetComponent("table-banquet-8ft" as RoomSetComponentId), undefined);
});

test("door and configurable component edits persist in PlannerScene state while seating remains fixed-size", () => {
  const scene = normalizePlannerSceneFromUnknown({
    roomShell: {
      widthLu: 80,
      depthLu: 50,
      bounds: { xLu: 0, yLu: 0, widthLu: 80, depthLu: 50 },
    },
    objects: [
      {
        id: "door-1",
        componentId: "door-entry",
        objectType: "aisle_zone",
        name: "Door / entry",
        label: "Main entry",
        capacity: { seated: 0, staff: 0 },
        source: { kind: "manual" },
        transform: { xLu: 4, yLu: 0, widthLu: 9, depthLu: 1.2, rotationDeg: 90 },
        metadata: {
          componentCategory: "walls",
          visualVariant: "door",
          neutralNote: "Manual room entry marker",
        },
      },
      {
        id: "stage-1",
        componentId: "stage-small",
        objectType: "stage",
        name: "Small stage",
        label: "Remarks stage",
        capacity: { seated: 0, staff: 0 },
        source: { kind: "manual" },
        transform: { xLu: 20, yLu: 4, widthLu: 30, depthLu: 14, rotationDeg: 0 },
        metadata: {
          componentCategory: "stages",
          visualVariant: "rect",
          neutralNote: "",
        },
      },
      {
        id: "round-1",
        componentId: "table-round-60",
        objectType: "banquet_table",
        name: "60in round",
        label: null,
        capacity: { seated: 8, staff: 0 },
        source: { kind: "manual" },
        transform: { xLu: 32, yLu: 24, widthLu: 6.1, depthLu: 6.1, rotationDeg: 0 },
        metadata: {
          componentCategory: "tables",
          visualVariant: "round",
          neutralNote: "",
        },
      },
    ],
  });

  assert.ok(scene);
  const door = scene.objects.find((object) => object.componentId === "door-entry");
  const stage = scene.objects.find((object) => object.componentId === "stage-small");
  const round = scene.objects.find((object) => object.componentId === "table-round-60");
  assert.ok(door);
  assert.ok(stage);
  assert.ok(round);
  assert.equal(door.label, "Main entry");
  assert.equal(door.transform.widthLu, 9);
  assert.equal(door.transform.rotationDeg, 90);
  assert.equal(door.capacity.seated, 0);
  assert.equal(stage.transform.widthLu, 30);
  assert.equal(stage.transform.depthLu, 14);
  assert.equal(round.transform.widthLu, getRoomSetComponent("table-round-60")?.widthLu);

  const placements = plannerSceneToLayoutPlacements(scene);
  assert.equal(placements.some((placement) => placement.componentId === "door-entry"), true);
  assert.equal(placements.find((placement) => placement.componentId === "door-entry")?.rotationDeg, 90);
});

test("door entries support arbitrary rotation and wider clear openings in canvas state", () => {
  const rotations = [17, 42, 135, 315] as const;
  const scene = normalizePlannerSceneFromUnknown({
    roomShell: {
      widthLu: 90,
      depthLu: 50,
      bounds: { xLu: 0, yLu: 0, widthLu: 90, depthLu: 50 },
    },
    objects: rotations.map((rotationDeg, index) => ({
      id: `door-wide-${rotationDeg}`,
      componentId: "door-entry",
      objectType: "aisle_zone",
      name: "Door / entry",
      label: `Entry ${rotationDeg}`,
      capacity: { seated: 0, staff: 0 },
      source: { kind: "manual" },
      transform: {
        xLu: 2 + index * 10,
        yLu: 2,
        widthLu: index === 0 ? 22 : 40,
        depthLu: 1.2,
        rotationDeg,
      },
      metadata: {
        componentCategory: "walls",
        visualVariant: "door",
        neutralNote: "Manual room entry marker",
      },
    })),
  });

  assert.ok(scene);
  for (const rotationDeg of rotations) {
    const door: PlannerSceneObject | undefined = scene.objects.find(
      (object) => object.id === `door-wide-${rotationDeg}`,
    );
    assert.ok(door);
    assert.equal(door.transform.rotationDeg, rotationDeg);
    assert.equal(door.transform.widthLu > 16, true);
    assert.equal(door.capacity.seated, 0);
    assert.equal(door.capacity.staff, 0);
  }

  const placements = plannerSceneToLayoutPlacements(scene);
  for (const rotationDeg of rotations) {
    assert.equal(
      placements.find((placement) => placement.label === `Entry ${rotationDeg}`)?.rotationDeg,
      rotationDeg,
    );
  }
});

test("prototype editor allows free door rotation and movable pipe drape", () => {
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const editConfigSource = canvasSource.slice(
    canvasSource.indexOf("function editableConfigForObject"),
    canvasSource.indexOf("function objectPalette"),
  );
  const rotationEditorSource = canvasSource.slice(
    canvasSource.indexOf('selectedEditConfig?.properties.includes("rotation")'),
    canvasSource.indexOf("{selectedCatalogComponent ?"),
  );

  assert.equal(canvasSource.includes('if (object.componentId === "wall-pipe-drape") return true'), true);
  assert.equal(canvasSource.includes("normalizeRotationDeg"), true);
  assert.equal(editConfigSource.includes("maxWidthLu: 40"), true);
  assert.equal(editConfigSource.includes('object.componentId === "wall-pipe-drape"'), true);
  assert.equal(rotationEditorSource.includes("DraftNumberInput"), true);
  assert.equal(rotationEditorSource.includes("max={359}"), true);
  assert.equal(rotationEditorSource.includes("[0, 90, 180, 270].map"), true);
  assert.equal(rotationEditorSource.includes("<select"), false);
  assert.equal(canvasSource.includes("labelCounterRotationDeg"), true);
  assert.equal(canvasSource.includes("pointer-events-none absolute z-50"), true);
});

test("pipe drape sizing and moved position persist in PlannerScene state", () => {
  const scene = normalizePlannerSceneFromUnknown({
    roomShell: {
      widthLu: 90,
      depthLu: 50,
      bounds: { xLu: 0, yLu: 0, widthLu: 90, depthLu: 50 },
    },
    objects: [
      {
        id: "pipe-drape-1",
        componentId: "wall-pipe-drape",
        objectType: "aisle_zone",
        name: "Pipe & drape",
        label: "Backdrop drape",
        capacity: { seated: 0, staff: 0 },
        source: { kind: "manual" },
        transform: { xLu: 24, yLu: 16, widthLu: 36, depthLu: 2, rotationDeg: 17 },
        metadata: {
          componentCategory: "walls",
          visualVariant: "wall",
          neutralNote: "Temporary divider",
        },
      },
    ],
  });

  assert.ok(scene);
  const drape = scene.objects.find((object) => object.componentId === "wall-pipe-drape");
  assert.ok(drape);
  assert.equal(drape.transform.xLu, 24);
  assert.equal(drape.transform.yLu, 16);
  assert.equal(drape.transform.widthLu, 36);
  assert.equal(drape.transform.depthLu, 2);
  assert.equal(drape.transform.rotationDeg, 17);

  const placement = plannerSceneToLayoutPlacements(scene).find(
    (entry) => entry.componentId === "wall-pipe-drape",
  );
  assert.ok(placement);
  assert.equal(placement.xLu, 24);
  assert.equal(placement.yLu, 16);
  assert.equal(placement.rotationDeg, 17);
});

test("prototype property editor exposes only focused configurable component controls", () => {
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.equal(canvasSource.includes('componentId === "door-entry"'), true);
  assert.equal(canvasSource.includes('object.objectType === "stage"'), true);
  assert.equal(canvasSource.includes('object.objectType === "screen"'), true);
  assert.equal(canvasSource.includes('object.metadata.componentCategory === "booths"'), true);
  assert.equal(canvasSource.includes('object.componentId === "decor-plant-cluster"'), true);
  const editConfigSource = canvasSource.slice(
    canvasSource.indexOf("function editableConfigForObject"),
    canvasSource.indexOf("function objectPalette"),
  );
  assert.equal(editConfigSource.includes('object.componentId === "table-round-60"'), false);
  assert.equal(editConfigSource.includes('object.componentId === "table-round-72"'), false);
  assert.equal(editConfigSource.includes('componentId === "table-banquet-6ft"'), false);
});

test("decor plant clusters distribute around low-conflict edges without disrupting banquet field", () => {
  const spec: LayoutSpec = {
    ...stageSideBanquetSpec({
      attendeeTarget: 160,
      densityPreference: "balanced",
      audienceStyle: "loose",
      audience: {
        primaryComponentId: "table-round-60",
        primaryComponentCapacity: 8,
        requiredPrimaryComponents: 20,
      },
    }),
    eventIntent: "banquet_remarks",
    secondary: [
      { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
      { componentId: "fnb-portable-bar", count: 2, zoneRole: "rear" },
      { componentId: "registration-desk", count: 1, zoneRole: "rear" },
      { componentId: "decor-plant-cluster", count: 4, zoneRole: "perimeter" },
    ],
  };

  const result = composeLayoutSpec({ spec, roomWidthLu: 120, roomDepthLu: 72 });

  assert.equal(result.ok, true);
  assert.equal(placementsForComponent(result.placements, "table-round-60").length, 20);
  const plants = placementsForComponent(result.placements, "decor-plant-cluster");
  assert.equal(plants.length, 4);
  assert.equal(new Set(plants.map((plant) => `${plant.xLu.toFixed(2)}:${plant.yLu.toFixed(2)}`)).size, 4);
  const plantFootprint = placementFootprint(result.placements, ["decor-plant-cluster"]);
  assert.equal(
    plantFootprint.width >= 40 || plantFootprint.depth >= 36,
    true,
    `expected plants to distribute around edges, saw ${plantFootprint.width} x ${plantFootprint.depth}`,
  );
  assert.equal(
    plants.every((plant) => plant.yLu <= 8 || plant.yLu >= 60 || plant.xLu <= 8 || plant.xLu >= 108),
    true,
    `expected edge plant placement, saw ${plants.map((plant) => `${plant.xLu},${plant.yLu}`).join(" | ")}`,
  );
  assertBanquetQualityGateMetrics(result.placements, { widthLu: 120, depthLu: 72 }, "diagonal");
  assert.equal(validatePlannerLayoutPlacements(result.placements, 120, 72).ok, true);
});

test("225-attendee banquet generation places support components away from origin", () => {
  const spec: LayoutSpec = {
    version: 1,
    source: "ai-generate",
    eventIntent: "awards_dinner",
    layoutType: "banquet",
    attendeeTarget: 225,
    densityPreference: "balanced",
    audienceStyle: "grid",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      stage: { componentId: "stage-small", count: 1, zoneRole: "front" },
      av: [{ componentId: "av-speaker-stack", count: 2, zoneRole: "front" }],
    },
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: Math.ceil(225 / 8),
    },
    secondary: [
      { componentId: "registration-desk", count: 1, zoneRole: "rear" },
      { componentId: "fnb-buffet-line", count: 1, zoneRole: "perimeter" },
      { componentId: "fnb-portable-bar", count: 2, zoneRole: "rear" },
      { componentId: "service-storage-zone", count: 1, zoneRole: "perimeter" },
    ],
  };

  const result = composeLayoutSpec({ spec, roomWidthLu: 100, roomDepthLu: 100 });
  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);

  const supportPlacements = result.placements.filter(
    (placement) => !placement.componentId.startsWith("table-"),
  );
  assert.equal(supportPlacements.length > 0, true);
  assert.equal(
    supportPlacements.every((placement) => !(placement.xLu === 0 && placement.yLu === 0)),
    true,
  );
});

test("successful 52-placement plan-layout response imports into PlannerScene objects", () => {
  const placements = samplePlanLayoutResponsePlacements52();
  const scene = plannerSceneFromGeneratedLayoutPlacements(placements, {
    widthLu: 200,
    depthLu: 150,
  });

  assert.equal(scene.roomShell.widthLu, 200);
  assert.equal(scene.roomShell.depthLu, 150);
  assert.equal(scene.objects.length, 52);
  assert.equal(scene.objects.some((object) => object.componentId === "table-round-60"), true);
  assert.equal(scene.objects.some((object) => object.componentId === "fnb-portable-bar"), true);
});

test("generated banquet tables and support objects render after conversion", () => {
  const scene = plannerSceneFromGeneratedLayoutPlacements(samplePlanLayoutResponsePlacements52(), {
    widthLu: 200,
    depthLu: 150,
  });
  const table = scene.objects.find((object) => object.componentId === "table-round-60");
  const support = scene.objects.find((object) => object.componentId === "registration-desk");
  assert.ok(table);
  assert.ok(support);

  const tableRect = plannerLuRectToPxRect(table.transform);
  const supportRect = plannerLuRectToPxRect(support.transform);
  assert.equal(tableRect.x > 0 && tableRect.y > 0, true);
  assert.equal(supportRect.x > 0 && supportRect.y > 0, true);
});

test("banquet table seat position model returns explicit countable seat targets", () => {
  const capacities = [6, 8, 12] as const;

  for (const capacity of capacities) {
    const roundSeats = plannerSeatPositionsForTable({ capacity, shape: "round" });
    const rectSeats = plannerSeatPositionsForTable({
      capacity,
      shape: "rectangle",
      widthLu: capacity >= 12 ? 12 : 8,
      depthLu: 4,
    });

    assert.equal(roundSeats.length, capacity);
    assert.equal(rectSeats.length, capacity);
    assert.equal(new Set(roundSeats.map((seat) => `${seat.xPct.toFixed(3)},${seat.yPct.toFixed(3)}`)).size, capacity);
    assert.equal(new Set(rectSeats.map((seat) => `${seat.xPct.toFixed(3)},${seat.yPct.toFixed(3)}`)).size, capacity);
    assert.deepEqual(roundSeats.map((seat) => seat.index), Array.from({ length: capacity }, (_, index) => index));
    assert.deepEqual(rectSeats.map((seat) => seat.index), Array.from({ length: capacity }, (_, index) => index));
  }
});

test("chair block seat position model returns stable row-major indexed chair targets", () => {
  const rowSeats = plannerSeatPositionsForChairBlock({
    capacity: 14,
    rows: 1,
    widthLu: 44,
    depthLu: 5.5,
  });
  assert.equal(rowSeats.length, 14);
  assert.deepEqual(rowSeats.map((seat) => seat.index), Array.from({ length: 14 }, (_, index) => index));
  assert.deepEqual(rowSeats.map((seat) => seat.row), Array.from({ length: 14 }, () => 0));
  assert.deepEqual(rowSeats.map((seat) => seat.column), Array.from({ length: 14 }, (_, index) => index));

  const blockSeats = plannerSeatPositionsForChairBlock({
    capacity: 20,
    rows: 2,
    chairsPerRow: 10,
    widthLu: 30,
    depthLu: 10,
  });
  assert.equal(blockSeats.length, 20);
  assert.deepEqual(blockSeats.slice(0, 10).map((seat) => seat.row), Array.from({ length: 10 }, () => 0));
  assert.deepEqual(blockSeats.slice(10).map((seat) => seat.row), Array.from({ length: 10 }, () => 1));
  assert.deepEqual(blockSeats.slice(0, 10).map((seat) => seat.column), Array.from({ length: 10 }, (_, index) => index));
  assert.deepEqual(blockSeats.slice(10).map((seat) => seat.column), Array.from({ length: 10 }, (_, index) => index));
});

test("room-set table rendering emits visible seat markers that match seated capacity", () => {
  const scene = plannerSceneFromLayoutPlacements([], { widthLu: 80, depthLu: 48 });
  const objects: PlannerSceneObject[] = [
    {
      id: "round-12",
      componentId: "table-round-72",
      objectType: "banquet_table",
      name: "72in round",
      label: null,
      capacity: { seated: 12, staff: 0 },
      source: { kind: "manual" },
      transform: { xLu: 8, yLu: 8, widthLu: 7.3, depthLu: 7.3, rotationDeg: 0 },
      metadata: {
        componentCategory: "tables",
        visualVariant: "round",
        neutralNote: "",
      },
    },
    {
      id: "round-8",
      componentId: "table-round-60",
      objectType: "banquet_table",
      name: "60in round",
      label: null,
      capacity: { seated: 8, staff: 0 },
      source: { kind: "manual" },
      transform: { xLu: 24, yLu: 8, widthLu: 6.1, depthLu: 6.1, rotationDeg: 0 },
      metadata: {
        componentCategory: "tables",
        visualVariant: "round",
        neutralNote: "",
      },
    },
    {
      id: "rect-6",
      componentId: "table-banquet-6ft",
      objectType: "classroom_table",
      name: "6ft banquet",
      label: null,
      capacity: { seated: 6, staff: 0 },
      source: { kind: "manual" },
      transform: { xLu: 40, yLu: 8, widthLu: 7.3, depthLu: 2.4, rotationDeg: 0 },
      metadata: {
        componentCategory: "tables",
        visualVariant: "rect",
        neutralNote: "",
      },
    },
    {
      id: "rect-12",
      componentId: "seating-classroom-row",
      objectType: "classroom_table",
      name: "Classroom row",
      label: null,
      capacity: { seated: 12, staff: 0 },
      source: { kind: "manual" },
      transform: { xLu: 8, yLu: 24, widthLu: 32, depthLu: 8, rotationDeg: 0 },
      metadata: {
        componentCategory: "seating",
        visualVariant: "row",
        neutralNote: "",
      },
    },
  ];
  const svg = renderPlannerSceneSvg({ ...scene, objects }, "table seat rendering");
  const seatCountForObject = (objectId: string) =>
    (svg.match(new RegExp(`data-table-seat="true" data-object-id="${objectId}"`, "g")) ?? []).length;

  assert.equal(seatCountForObject("round-12"), 12);
  assert.equal(seatCountForObject("round-8"), 8);
  assert.equal(seatCountForObject("rect-6"), 6);
  assert.equal(seatCountForObject("rect-12"), 12);
});

test("room-set theater row rendering emits indexed chair markers that match seated capacity", () => {
  const scene = plannerSceneFromLayoutPlacements([], { widthLu: 80, depthLu: 48 });
  const objects: PlannerSceneObject[] = [
    {
      id: "theater-row-14",
      componentId: "seating-theater-row",
      objectType: "chair_block",
      name: "Theater row",
      label: null,
      capacity: { seated: 14, staff: 0 },
      source: { kind: "manual" },
      transform: { xLu: 8, yLu: 8, widthLu: 44, depthLu: 5.5, rotationDeg: 0 },
      metadata: {
        componentCategory: "seating",
        visualVariant: "row",
        neutralNote: "",
      },
    },
  ];
  const svg = renderPlannerSceneSvg({ ...scene, objects }, "chair row rendering");
  const chairMarkers =
    svg.match(/data-chair-seat="true" data-chair-facing="front" data-seat-kind="chair" data-object-id="theater-row-14"/g) ?? [];
  assert.equal(chairMarkers.length, 14);
  assert.equal(objects[0].capacity.seated, chairMarkers.length);
  for (let index = 0; index < 14; index += 1) {
    assert.equal(svg.includes(`data-seat-index="${index}"`), true);
  }
});

test("edited and rotated chair rows preserve visible count, badge capacity, and stable seat indexes", () => {
  const scene = plannerSceneFromLayoutPlacements([], { widthLu: 80, depthLu: 48 });
  const objects: PlannerSceneObject[] = [
    {
      id: "edited-chair-row-12",
      componentId: "seating-chair-row-10",
      objectType: "chair_block",
      name: "10-chair row",
      label: null,
      capacity: { seated: 12, staff: 0 },
      source: { kind: "manual" },
      transform: { xLu: 8, yLu: 8, widthLu: 36, depthLu: 4.5, rotationDeg: 37 },
      metadata: {
        componentCategory: "seating",
        visualVariant: "row",
        neutralNote: "",
      },
    },
  ];
  const svg = renderPlannerSceneSvg({ ...scene, objects }, "edited chair row rendering");
  const chairMarkers =
    svg.match(/data-chair-seat="true" data-chair-facing="front" data-seat-kind="chair" data-object-id="edited-chair-row-12"/g) ?? [];

  assert.equal(chairMarkers.length, 12);
  assert.equal(objects[0].capacity.seated, chairMarkers.length);
  assert.equal(svg.includes("transform=\"rotate(37"), true);
  for (let index = 0; index < 12; index += 1) {
    assert.equal(svg.includes(`data-seat-index="${index}"`), true);
  }
});

test("prototype table renderer uses indexed capacity-derived seat markers", () => {
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.equal(canvasSource.includes("function TableSeatMarkers"), true);
  assert.equal(canvasSource.includes("plannerSeatPositionsForTable"), true);
  assert.equal(canvasSource.includes('data-table-seat="true"'), true);
  assert.equal(canvasSource.includes("data-seat-index={seat.index}"), true);
  assert.match(canvasSource, /<TableSeatMarkers[\s\S]*object=\{object\}[\s\S]*shape="round"[\s\S]*\/>/);
  assert.match(canvasSource, /<TableSeatMarkers[\s\S]*object=\{object\}[\s\S]*shape="rectangle"[\s\S]*\/>/);
});

test("prototype theater row renderer uses indexed capacity-derived chair markers", () => {
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.equal(canvasSource.includes("function ChairBlockSeatMarkers"), true);
  assert.equal(canvasSource.includes("plannerSeatPositionsForChairBlock"), true);
  assert.equal(canvasSource.includes('data-chair-seat="true"'), true);
  assert.equal(canvasSource.includes('data-chair-facing="front"'), true);
  assert.equal(canvasSource.includes('data-seat-kind="chair"'), true);
  assert.equal(canvasSource.includes("data-seat-index={seat.index}"), true);
  assert.equal(canvasSource.includes('orientation="bottom"'), true);
  assert.match(canvasSource, /<ChairBlockSeatMarkers[\s\S]*object=\{object\}[\s\S]*\/>/);
  assert.equal(canvasSource.includes("Array.from({ length: 7 })"), false);
});

test("prototype chair editor exposes assignment-ready chair controls without eager numeric parsing", () => {
  const canvasSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const inspectorSource = canvasSource.slice(
    canvasSource.indexOf("{selectedEditConfig?.properties.includes(\"chairCount\") ?"),
    canvasSource.indexOf("<div className=\"mt-3 grid grid-cols-2 gap-2\">"),
  );

  assert.equal(canvasSource.includes("function isEditableChairObject"), true);
  assert.equal(canvasSource.includes('object.componentId.startsWith("seating-chair-")'), true);
  assert.equal(canvasSource.includes('object.componentId === "seating-theater-row"'), true);
  assert.equal(canvasSource.includes("capacitySeated?: number"), true);
  assert.equal(canvasSource.includes("next.capacity.seated !== object.capacity.seated"), true);
  assert.equal(inspectorSource.includes('data-chair-edit-controls="true"'), true);
  assert.equal(inspectorSource.includes("Chair count"), true);
  assert.equal(inspectorSource.includes("Rows"), true);
  assert.equal(inspectorSource.includes("Chairs / row"), true);
  assert.equal(inspectorSource.includes("Chair spacing"), true);
  assert.equal(inspectorSource.includes("Row spacing"), true);
  assert.equal((inspectorSource.match(/DraftNumberInput/g)?.length ?? 0) >= 5, true);
  assert.equal(canvasSource.includes("chairFootprintForEdit"), true);
  assert.equal(canvasSource.includes("updateSelectedChairLayout({ chairCount: nextValue })"), true);
});

test("theater row seat helpers derive count from capacity and face the stage/front", () => {
  assert.equal(plannerTheaterSeatCountFromCapacity(14), 14);
  assert.equal(plannerTheaterSeatCountFromCapacity(13.6), 14);
  assert.equal(plannerTheaterSeatCountFromCapacity(0), 1);
  assert.equal(plannerTheaterSeatCountFromCapacity(200), 80);

  const markers = plannerTheaterSeatMarkersFromCapacity(3);
  assert.deepEqual(markers, [
    { facing: "front", seatKind: "chair", seatIndex: 0 },
    { facing: "front", seatKind: "chair", seatIndex: 1 },
    { facing: "front", seatKind: "chair", seatIndex: 2 },
  ]);
});

test("tables and support objects use the same layout-to-pixel conversion helper", () => {
  const scene = plannerSceneFromLayoutPlacements(
    [
      { componentId: "table-round-72", xLu: 12, yLu: 20, rotationDeg: 0 },
      { componentId: "fnb-portable-bar", xLu: 66, yLu: 88, rotationDeg: 0 },
    ],
    { widthLu: 100, depthLu: 100 },
  );
  const table = scene.objects.find((object) => object.componentId === "table-round-72");
  const support = scene.objects.find((object) => object.componentId === "fnb-portable-bar");
  assert.ok(table);
  assert.ok(support);

  const tableRect = plannerLuRectToPxRect(table.transform);
  const supportRect = plannerLuRectToPxRect(support.transform);
  assert.equal(tableRect.x, layoutLuToPx(table.transform.xLu));
  assert.equal(tableRect.y, layoutLuToPx(table.transform.yLu));
  assert.equal(supportRect.x, layoutLuToPx(support.transform.xLu));
  assert.equal(supportRect.y, layoutLuToPx(support.transform.yLu));
});

test("visible room and component dimensions are formatted in real-world units", () => {
  assert.equal(formatRoomShellDimensions(100, 100), "100 ft × 100 ft");
  assert.equal(
    formatComponentFootprintDimensions({
      id: "table-round-72",
      label: "72in round",
      widthLu: 7.3,
      depthLu: 7.3,
      visualVariant: "round",
    }),
    "72 in round",
  );
  assert.equal(
    formatComponentFootprintDimensions({
      id: "stage-small",
      label: "Small stage",
      widthLu: 24,
      depthLu: 12,
      visualVariant: "rect",
    }),
    "24 ft × 12 ft",
  );
});

test("invalid component coordinates do not render stacked at origin", () => {
  const scene = plannerSceneFromLayoutPlacements(
    [
      { componentId: "fnb-portable-bar", xLu: Number.NaN, yLu: 0, rotationDeg: 0 },
      { componentId: "stage-small", xLu: 999, yLu: 999, rotationDeg: 0 },
    ],
    { widthLu: 100, depthLu: 100 },
  );
  assert.equal(scene.objects.length, 1);
  assert.equal(scene.objects[0]!.componentId, "stage-small");
  assert.notDeepEqual(
    { xLu: scene.objects[0]!.transform.xLu, yLu: scene.objects[0]!.transform.yLu },
    { xLu: 0, yLu: 0 },
  );

  const imported = normalizePlannerSceneFromUnknown({
    roomShell: { widthLu: 100, depthLu: 100, bounds: { xLu: 0, yLu: 0 } },
    objects: [
      {
        componentId: "fnb-portable-bar",
        transform: { xLu: "bad", yLu: null, widthLu: 8, depthLu: 3 },
      },
    ],
  });
  assert.ok(imported);
  assert.equal(imported.objects.length, 0);
});

test("apply seating-style change from classroom to round tables preserves program", () => {
  const prompt = "Change the seating style to round tables";
  const baseSpec: LayoutSpec = {
    version: 1,
    source: "ai-generate",
    eventIntent: "training_session",
    layoutType: "classroom",
    attendeeTarget: 96,
    densityPreference: "balanced",
    audienceStyle: "grid",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      stage: { componentId: "stage-riser", count: 1, zoneRole: "front" },
      av: [{ componentId: "av-foh-control", count: 1, zoneRole: "front" }],
    },
    audience: {
      primaryComponentId: "seating-classroom-row",
      primaryComponentCapacity: 12,
      requiredPrimaryComponents: 8,
    },
    secondary: [
      { componentId: "registration-desk", count: 1, zoneRole: "rear", placementPreference: "rear" },
      { componentId: "fnb-coffee-station", count: 1, zoneRole: "perimeter" },
    ],
  };
  const allowedComponentIds = ROOM_SET_COMPONENTS.map(
    (component) => component.id,
  ) as RoomSetComponentId[];
  const malformedAiPatch = {
    version: 1,
    ops: [{ op: "setAudienceStyle", audienceStyle: "round tables" }],
  };

  const normalizedPatch = normalizeLayoutPatchFromUnknown(malformedAiPatch, allowedComponentIds);
  assert.ok(normalizedPatch);
  assert.deepEqual(normalizedPatch.ops, [{ op: "setLayoutType", layoutType: "banquet" }]);

  const deterministicPatch = buildDeterministicApplyLayoutPatch({
    prompt,
    currentTopologyRows: null,
    baseLayoutType: baseSpec.layoutType,
  });
  assert.ok(deterministicPatch);
  assert.deepEqual(deterministicPatch.ops, [{ op: "setLayoutType", layoutType: "banquet" }]);

  const supplementedPatch = supplementLayoutPatchSeatingStyleFromPrompt(normalizedPatch, {
    prompt,
    baseLayoutType: baseSpec.layoutType,
  });
  assert.deepEqual(supplementedPatch.ops, normalizedPatch.ops);

  const patchedSpec = applyLayoutPatch(baseSpec, supplementedPatch);
  const applyComposed = composeLayoutSpecForApply({
    spec: patchedSpec,
    roomWidthLu: 140,
    roomDepthLu: 96,
    applyContext: {
      baseSpec,
      prompt,
      sidebarAttendeeCount: baseSpec.attendeeTarget,
      sidebarDensityPreference: baseSpec.densityPreference,
    },
  });
  assert.equal(applyComposed.result.ok, true);

  const layoutSpec = applyComposed.layoutSpec;
  assert.equal(layoutSpec.layoutType, "banquet");
  assert.equal(layoutSpec.audience.primaryComponentId, "table-round-60");
  assert.equal(layoutSpec.attendeeTarget, baseSpec.attendeeTarget);
  assert.deepEqual(layoutSpec.front, baseSpec.front);
  assert.deepEqual(layoutSpec.secondary, baseSpec.secondary);

  const placements = applyComposed.result.placements;
  assert.equal(placements.some((placement) => placement.componentId === "table-round-60"), true);
  assert.equal(
    placements.some((placement) => placement.componentId === "seating-classroom-row"),
    false,
  );
  assert.equal(placements.some((placement) => placement.componentId === "av-projector-screen"), true);
  assert.equal(placements.some((placement) => placement.componentId === "stage-riser"), true);
  assert.equal(placements.some((placement) => placement.componentId === "av-foh-control"), true);
  assert.equal(placements.some((placement) => placement.componentId === "registration-desk"), true);
  assert.equal(placements.some((placement) => placement.componentId === "fnb-coffee-station"), true);

  const validated = validatePlannerLayoutPlacements(placements, 140, 96);
  assert.equal(validated.ok, true);
});

test("apply simulation adds bars without resetting attendee count", () => {
  const scenario = buildDefaultPlannerSimulationScenarios().find(
    (entry) => entry.id === "apply-add-two-bars",
  );
  assert.ok(scenario);

  const result = runPlannerSimulationScenario(scenario);
  assert.equal(result.steps.length, 2);

  const applyStep = result.steps[1]!;
  assert.equal(applyStep.kind, "apply");
  assert.equal(applyStep.after.attendeeTarget, applyStep.before.attendeeTarget);
  assert.equal(applyStep.diagnostics.capacityResetDetected, false);
  assert.equal(
    componentCount(applyStep.after.placementCounts, "fnb-portable-bar") -
      componentCount(applyStep.before.placementCounts, "fnb-portable-bar"),
    2,
  );
  assert.equal(applyStep.diagnostics.afterOverlapCount, 0);
  assert.equal(applyStep.diagnostics.afterOutOfBoundsCount, 0);

  const barPlacements = applyStep.after.placements.filter(
    (placement) => placement.componentId === "fnb-portable-bar",
  );
  assert.equal(barPlacements.length, 2);
  assert.equal(
    barPlacements.every((placement) => Math.abs(placement.xLu - 2) < 1e-6),
    false,
  );
});

test("apply add lounge chairs by each bar adds lounge chairs without adding bars", () => {
  const scenario = buildDefaultPlannerSimulationScenarios().find(
    (entry) => entry.id === "apply-support-lounge-chairs-by-each-bar",
  );
  assert.ok(scenario);

  const result = runPlannerSimulationScenario(scenario);
  assert.equal(result.steps.length, 2);

  const applyStep = result.steps[1]!;
  assert.equal(applyStep.kind, "apply");
  assert.equal(applyStep.applyPath, "patch");
  assert.equal(applyStep.after.attendeeTarget, applyStep.before.attendeeTarget);
  assert.equal(applyStep.diagnostics.capacityResetDetected, false);

  const beforeBars = componentCount(applyStep.before.placementCounts, "fnb-portable-bar");
  const afterBars = componentCount(applyStep.after.placementCounts, "fnb-portable-bar");
  const beforeLounges = componentCount(applyStep.before.placementCounts, "lounge-chair");
  const afterLounges = componentCount(applyStep.after.placementCounts, "lounge-chair");
  const beforeAudienceRows = componentCount(applyStep.before.placementCounts, "seating-theater-row");
  const afterAudienceRows = componentCount(applyStep.after.placementCounts, "seating-theater-row");

  assert.equal(beforeBars, 2);
  assert.equal(afterBars, beforeBars);
  assert.equal(afterLounges - beforeLounges, 4);
  assert.equal(afterAudienceRows, beforeAudienceRows);
  assert.equal(applyStep.diagnostics.afterOverlapCount, 0);
  assert.equal(applyStep.diagnostics.afterOutOfBoundsCount, 0);

  const addItems = applyStep.patchSummary.filter((entry) => entry.op === "addItems");
  assert.equal(JSON.stringify(addItems).includes("lounge-chair"), true);
  assert.equal(JSON.stringify(addItems).includes("fnb-portable-bar"), false);
});

test("focused apply scenarios infer planner semantic directive keys", () => {
  const scenarioIds = [
    "apply-preserve-center-aisle",
    "apply-tighten-seating-sightlines",
    "apply-move-buffet-perimeter",
    "apply-networking-lounge-perimeter",
  ] as const;

  for (const scenarioId of scenarioIds) {
    const scenario = buildDefaultPlannerSimulationScenarios().find(
      (entry) => entry.id === scenarioId,
    );
    assert.ok(scenario, scenarioId);
    const result = runPlannerSimulationScenario(scenario);
    const applyStep = result.steps[1]!;
    assert.equal(applyStep.kind, "apply");
    assert.equal(applyStep.semanticDirectiveKeys.length > 0, true);
  }
});

test("networking lounge perimeter apply does not stack lounge objects on the left wall", () => {
  const scenario = buildDefaultPlannerSimulationScenarios().find(
    (entry) => entry.id === "apply-networking-lounge-perimeter",
  );
  assert.ok(scenario);

  const result = runPlannerSimulationScenario(scenario);
  const applyStep = result.steps[1]!;
  assert.equal(applyStep.kind, "apply");
  assert.equal(applyStep.diagnostics.afterOverlapCount, 0);
  assert.equal(applyStep.diagnostics.afterOutOfBoundsCount, 0);

  const loungePlacements = applyStep.after.placements.filter(
    (placement) => placement.componentId === "lounge-chair",
  );
  assert.equal(loungePlacements.length > 1, true);
  assert.equal(
    loungePlacements.every((placement) => Math.abs(placement.xLu - 2) < 1e-6),
    false,
  );
});

test("move buffet to perimeter apply avoids overlaps and out-of-bounds placements", () => {
  const scenario = buildDefaultPlannerSimulationScenarios().find(
    (entry) => entry.id === "apply-move-buffet-perimeter",
  );
  assert.ok(scenario);

  const result = runPlannerSimulationScenario(scenario);
  const applyStep = result.steps[1]!;
  assert.equal(applyStep.diagnostics.afterOverlapCount, 0);
  assert.equal(applyStep.diagnostics.afterOutOfBoundsCount, 0);
});

test("chained simulation completes without hard placement failures", () => {
  const scenario = buildDefaultPlannerSimulationScenarios().find(
    (entry) => entry.id === "chain-general-session-regression",
  );
  assert.ok(scenario);

  const result = runPlannerSimulationScenario(scenario);
  assert.equal(result.steps.length, 5);
  assert.equal(result.failCount, 0);
  assert.equal(
    result.steps.every((step) => step.diagnostics.afterOutOfBoundsCount === 0),
    true,
  );
});
