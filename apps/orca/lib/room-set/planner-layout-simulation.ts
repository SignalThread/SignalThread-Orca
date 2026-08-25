import {
  buildDeterministicApplyLayoutPatch,
  supplementLayoutPatchSeatingStyleFromPrompt,
} from "./layout-patch-deterministic-fallback";
import { applyLayoutPatch } from "./layout-patch-apply";
import { summarizeLayoutPatchOps } from "./layout-patch-normalize";
import { supplementLayoutPatchFromPrompt } from "./layout-patch-prompt-supplement";
import { supplementLayoutPatchTopologyFromPrompt } from "./layout-patch-topology-supplement";
import { buildApplyLayoutSummary, composeLayoutSpecForApply } from "./layout-spec-apply-compose";
import type { LayoutPatch, LayoutSpec, LayoutSpecLayoutType } from "./layout-spec";
import { composeLayoutSpec } from "./layout-spec-compose";
import {
  applySpatialDirectivesToLayout,
  inferSpatialApplyDirectives,
  type ApplySpatialDirective,
} from "./layout-spatial-directives";
import { mergePlannerSemanticDirectiveKeys } from "./layout-spec-semantic-directives";
import type { RoomSetLayoutPlacement } from "./planner-layout-schema";
import { inferCapacityTargetFromPrompt } from "./planner-component-requests";
import {
  plannerSceneFromLayoutPlacements,
  type PlannerScene,
  type PlannerSceneObject,
} from "./planner-scene";
import {
  plannerSeatPositionsForChairBlock,
  plannerSeatPositionsForTable,
  type PlannerSeatSurfaceShape,
} from "./planner-seat-positions";
import {
  findPlannerLayoutPlacementOverlaps,
  sumPlatedSeatCapacity,
  validatePlannerLayoutPlacements,
} from "./planner-layout-validator";
import {
  getRoomSetComponent,
  type RoomSetComponentCategoryId,
  type RoomSetComponentId,
} from "./component-library";

export type PlannerSimulationStepDefinition =
  | Readonly<{
      id: string;
      label: string;
      kind: "generate";
      prompt: string;
      roomWidthLu: number;
      roomDepthLu: number;
      spec: LayoutSpec;
      expectations?: PlannerSimulationStepExpectations;
    }>
  | Readonly<{
      id: string;
      label: string;
      kind: "apply";
      prompt: string;
      patch?: LayoutPatch;
      expectations?: PlannerSimulationStepExpectations;
    }>;

export type PlannerSimulationScenarioTag =
  | "presets"
  | "support"
  | "seating"
  | "counts"
  | "chains"
  | "legacy"
  | "general-session-style-audit";

export type PlannerSimulationStepExpectations = Readonly<{
  layoutType?: LayoutSpecLayoutType;
  audienceStyle?: LayoutSpec["audienceStyle"];
  primaryComponentId?: RoomSetComponentId;
  attendeeTarget?: number;
  attendeeUnchanged?: boolean;
  capacityMinRatio?: number;
  capacityMaxRatio?: number;
  requiredComponents?: readonly RoomSetComponentId[];
  requiredCategories?: readonly RoomSetComponentCategoryId[];
  absentComponents?: readonly RoomSetComponentId[];
  expectedApplyPaths?: readonly ("patch" | "spatial" | "spec")[];
  frontPreserved?: boolean;
  secondaryPreserved?: boolean;
  supportPreserved?: boolean;
  noNoOp?: boolean;
  distributedComponents?: readonly RoomSetComponentId[];
  primaryStageSideRegions?: "any" | "both";
  primaryFootprintMinWidth?: number;
  primaryFootprintMinDepth?: number;
  primaryFootprintWiderThanBefore?: boolean;
  primaryFootprintDepthAtLeastBefore?: boolean;
  primaryMaxAlignedColumnCount?: number;
  primaryMinRowOffsetSpread?: number;
}>;

export type PlannerSimulationScenarioDefinition = Readonly<{
  id: string;
  label: string;
  tags?: readonly PlannerSimulationScenarioTag[];
  steps: readonly PlannerSimulationStepDefinition[];
}>;

export type PlannerSimulationStatus = "pass" | "warn" | "fail";

export type PlannerSimulationPlacementCountSummary = Readonly<{
  total: number;
  byComponent: readonly Readonly<{ componentId: RoomSetComponentId; count: number }>[];
  byCategory: readonly Readonly<{ category: string; count: number }>[];
}>;

export type PlannerSimulationSnapshot = Readonly<{
  roomWidthLu: number;
  roomDepthLu: number;
  attendeeTarget: number;
  appliedSeatCapacity: number;
  placementCounts: PlannerSimulationPlacementCountSummary;
  scene: PlannerScene;
  placements: readonly RoomSetLayoutPlacement[];
  spec: LayoutSpec | null;
}>;

export type PlannerSimulationMovement = Readonly<{
  componentId: RoomSetComponentId;
  category: string;
  beforeXLu: number;
  beforeYLu: number;
  afterXLu: number;
  afterYLu: number;
  deltaXLu: number;
  deltaYLu: number;
  distanceLu: number;
  thresholdLu: number;
  label: string | null;
}>;

export type PlannerSimulationDiagnostics = Readonly<{
  beforeOverlapCount: number;
  afterOverlapCount: number;
  beforeOutOfBoundsCount: number;
  afterOutOfBoundsCount: number;
  attendeeCountDelta: number;
  appliedSeatCapacityDelta: number;
  capacityResetDetected: boolean;
  noVisibleChangeDetected: boolean;
  largeObjectJumps: readonly PlannerSimulationMovement[];
  unrelatedObjectMutations: readonly PlannerSimulationMovement[];
}>;

export type PlannerSimulationStepResult = Readonly<{
  scenarioId: string;
  scenarioLabel: string;
  stepIndex: number;
  stepId: string;
  stepLabel: string;
  kind: "generate" | "apply";
  prompt: string;
  status: PlannerSimulationStatus;
  before: PlannerSimulationSnapshot;
  after: PlannerSimulationSnapshot;
  diagnostics: PlannerSimulationDiagnostics;
  warnings: readonly string[];
  notes: readonly string[];
  expectationFailures: readonly string[];
  executionError?: string;
  applyPath: "spec" | "patch" | "spatial" | null;
  patchSummary: readonly Record<string, unknown>[];
  spatialDirectives: readonly ApplySpatialDirective[];
  semanticDirectiveKeys: readonly string[];
}>;

export type PlannerSimulationScenarioResult = Readonly<{
  id: string;
  label: string;
  status: PlannerSimulationStatus;
  steps: readonly PlannerSimulationStepResult[];
  warningCount: number;
  failCount: number;
}>;

export type PlannerSimulationSuiteResult = Readonly<{
  scenarios: readonly PlannerSimulationScenarioResult[];
  summary: Readonly<{
    pass: number;
    warn: number;
    fail: number;
    stepCount: number;
    scenarioCount: number;
  }>;
}>;

type SimulationState = Readonly<{
  roomWidthLu: number;
  roomDepthLu: number;
  spec: LayoutSpec;
  scene: PlannerScene;
  placements: readonly RoomSetLayoutPlacement[];
  attendeeTarget: number;
  appliedSeatCapacity: number;
}>;

type ApplyExecutionResult = Readonly<{
  state: SimulationState;
  warnings: readonly string[];
  applyPath: "patch" | "spatial";
  patch: LayoutPatch;
  patchSummary: readonly Record<string, unknown>[];
  spatialDirectives: readonly ApplySpatialDirective[];
  semanticDirectiveKeys: readonly string[];
}>;

type MutationTargetScope = Readonly<{
  global: boolean;
  targetAudience: boolean;
  targetFront: boolean;
  targetComponentIds: ReadonlySet<RoomSetComponentId>;
  targetCategories: ReadonlySet<string>;
  primaryAudienceComponentId: RoomSetComponentId | null;
}>;

const BUFFET_COMPONENT_IDS = new Set<RoomSetComponentId>([
  "fnb-buffet-line",
  "fnb-coffee-station",
]);

const FRONT_CATEGORY_IDS = new Set<RoomSetComponentCategoryId>(["stages", "av"]);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function categoryForPlacement(placement: RoomSetLayoutPlacement): string {
  return getRoomSetComponent(placement.componentId)?.category ?? "uncategorized";
}

function sortPlacementsForComparison(
  placements: readonly RoomSetLayoutPlacement[],
): RoomSetLayoutPlacement[] {
  return [...placements].sort((left, right) => {
    const labelDelta = (left.label ?? "").localeCompare(right.label ?? "");
    if (labelDelta !== 0) return labelDelta;
    const componentDelta = left.componentId.localeCompare(right.componentId);
    if (componentDelta !== 0) return componentDelta;
    const yDelta = left.yLu - right.yLu;
    if (Math.abs(yDelta) > 0.25) return yDelta;
    return left.xLu - right.xLu;
  });
}

function buildPlacementCountSummary(
  placements: readonly RoomSetLayoutPlacement[],
): PlannerSimulationPlacementCountSummary {
  const byComponent = new Map<RoomSetComponentId, number>();
  const byCategory = new Map<string, number>();

  for (const placement of placements) {
    byComponent.set(
      placement.componentId,
      (byComponent.get(placement.componentId) ?? 0) + 1,
    );
    const category = categoryForPlacement(placement);
    byCategory.set(category, (byCategory.get(category) ?? 0) + 1);
  }

  return {
    total: placements.length,
    byComponent: [...byComponent.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([componentId, count]) => ({ componentId, count })),
    byCategory: [...byCategory.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([category, count]) => ({ category, count })),
  };
}

function createEmptyScene(roomWidthLu: number, roomDepthLu: number): PlannerScene {
  return plannerSceneFromLayoutPlacements([], {
    widthLu: roomWidthLu,
    depthLu: roomDepthLu,
  });
}

function snapshotFromState(state: SimulationState): PlannerSimulationSnapshot {
  return {
    roomWidthLu: state.roomWidthLu,
    roomDepthLu: state.roomDepthLu,
    attendeeTarget: state.attendeeTarget,
    appliedSeatCapacity: state.appliedSeatCapacity,
    placementCounts: buildPlacementCountSummary(state.placements),
    scene: state.scene,
    placements: state.placements,
    spec: state.spec,
  };
}

function emptySnapshot(roomWidthLu: number, roomDepthLu: number): PlannerSimulationSnapshot {
  return {
    roomWidthLu,
    roomDepthLu,
    attendeeTarget: 0,
    appliedSeatCapacity: 0,
    placementCounts: buildPlacementCountSummary([]),
    scene: createEmptyScene(roomWidthLu, roomDepthLu),
    placements: [],
    spec: null,
  };
}

function issueCountByCode(
  placements: readonly RoomSetLayoutPlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
  code: string,
): number {
  return findPlannerLayoutPlacementOverlaps(
    placements,
    roomWidthLu,
    roomDepthLu,
  ).filter((issue) => issue.code === code).length;
}

function mapPlacementsByComponent(
  placements: readonly RoomSetLayoutPlacement[],
): ReadonlyMap<RoomSetComponentId, readonly RoomSetLayoutPlacement[]> {
  const grouped = new Map<RoomSetComponentId, RoomSetLayoutPlacement[]>();
  for (const placement of placements) {
    const bucket = grouped.get(placement.componentId) ?? [];
    bucket.push(placement);
    grouped.set(placement.componentId, bucket);
  }
  return new Map(
    [...grouped.entries()].map(([componentId, bucket]) => [
      componentId,
      sortPlacementsForComparison(bucket),
    ]),
  );
}

function movementThresholdForPlacement(componentId: RoomSetComponentId): number {
  const component = getRoomSetComponent(componentId);
  const width = component?.widthLu ?? 4;
  const depth = component?.depthLu ?? 4;
  return Math.max(8, Math.hypot(width, depth) * 1.4);
}

function comparePlacements(
  before: readonly RoomSetLayoutPlacement[],
  after: readonly RoomSetLayoutPlacement[],
): readonly PlannerSimulationMovement[] {
  const beforeByComponent = mapPlacementsByComponent(before);
  const afterByComponent = mapPlacementsByComponent(after);
  const componentIds = new Set<RoomSetComponentId>([
    ...beforeByComponent.keys(),
    ...afterByComponent.keys(),
  ]);

  const movements: PlannerSimulationMovement[] = [];
  for (const componentId of componentIds) {
    const beforePlacements = beforeByComponent.get(componentId) ?? [];
    const afterPlacements = afterByComponent.get(componentId) ?? [];
    const pairCount = Math.min(beforePlacements.length, afterPlacements.length);
    for (let index = 0; index < pairCount; index += 1) {
      const beforePlacement = beforePlacements[index]!;
      const afterPlacement = afterPlacements[index]!;
      const deltaXLu = roundMetric(afterPlacement.xLu - beforePlacement.xLu);
      const deltaYLu = roundMetric(afterPlacement.yLu - beforePlacement.yLu);
      const distanceLu = roundMetric(Math.hypot(deltaXLu, deltaYLu));
      const thresholdLu = roundMetric(movementThresholdForPlacement(componentId));
      movements.push({
        componentId,
        category: categoryForPlacement(beforePlacement),
        beforeXLu: beforePlacement.xLu,
        beforeYLu: beforePlacement.yLu,
        afterXLu: afterPlacement.xLu,
        afterYLu: afterPlacement.yLu,
        deltaXLu,
        deltaYLu,
        distanceLu,
        thresholdLu,
        label: beforePlacement.label ?? afterPlacement.label ?? null,
      });
    }
  }

  return movements.sort((left, right) => right.distanceLu - left.distanceLu);
}

function inferMutationTargetScope(args: Readonly<{
  beforeSpec: LayoutSpec | null;
  patch: LayoutPatch;
  spatialDirectives: readonly ApplySpatialDirective[];
}>): MutationTargetScope {
  const targetComponentIds = new Set<RoomSetComponentId>();
  const targetCategories = new Set<string>();
  let global = false;
  let targetAudience = false;
  let targetFront = false;

  for (const op of args.patch.ops) {
    switch (op.op) {
      case "addItems":
        for (const item of op.items) {
          targetComponentIds.add(item.componentId);
          targetCategories.add(categoryForPlacement({
            componentId: item.componentId,
            xLu: 0,
            yLu: 0,
            rotationDeg: 0,
          }));
        }
        break;
      case "removeItems":
        targetComponentIds.add(op.componentId);
        targetCategories.add(
          categoryForPlacement({
            componentId: op.componentId,
            xLu: 0,
            yLu: 0,
            rotationDeg: 0,
          }),
        );
        break;
      case "setAudienceStyle":
      case "setAudienceTopology":
      case "setLayoutType":
      case "setAttendeeTarget":
        targetAudience = true;
        break;
      case "setFrontScreen":
      case "setFrontStage":
        targetFront = true;
        break;
      default:
        break;
    }
  }

  for (const directive of args.spatialDirectives) {
    switch (directive) {
      case "centerAudienceBlock":
      case "splitAudienceIntoBanks":
      case "preserveCenterAisle":
        targetAudience = true;
        break;
      case "tightenSeating":
        targetAudience = true;
        break;
      case "preserveStageSightlines":
        targetAudience = true;
        targetFront = true;
        break;
      case "anchorBarsLeftRight":
        targetComponentIds.add("fnb-portable-bar");
        targetCategories.add("fnb");
        break;
      case "moveBuffetToPerimeterWithoutOverlap":
        for (const componentId of BUFFET_COMPONENT_IDS) {
          targetComponentIds.add(componentId);
        }
        targetCategories.add("fnb");
        break;
      case "createNetworkingLoungePerimeter":
        targetCategories.add("lounge");
        break;
      case "increaseSymmetry":
      case "enforceMirrorLayout":
        global = true;
        break;
      default:
        break;
    }
  }

  return {
    global,
    targetAudience,
    targetFront,
    targetComponentIds,
    targetCategories,
    primaryAudienceComponentId:
      args.beforeSpec?.audience.primaryComponentId ?? null,
  };
}

function isMovementTargeted(
  movement: PlannerSimulationMovement,
  scope: MutationTargetScope,
): boolean {
  if (scope.global) return true;
  if (scope.targetComponentIds.has(movement.componentId)) return true;
  if (scope.targetCategories.has(movement.category)) return true;
  if (
    scope.targetAudience &&
    scope.primaryAudienceComponentId &&
    movement.componentId === scope.primaryAudienceComponentId
  ) {
    return true;
  }
  if (scope.targetFront && FRONT_CATEGORY_IDS.has(movement.category as RoomSetComponentCategoryId)) {
    return true;
  }
  return false;
}

function buildDiagnostics(args: Readonly<{
  stepKind: "generate" | "apply";
  prompt: string;
  before: PlannerSimulationSnapshot;
  after: PlannerSimulationSnapshot;
  patch: LayoutPatch;
  spatialDirectives: readonly ApplySpatialDirective[];
}>): PlannerSimulationDiagnostics {
  const movements = comparePlacements(args.before.placements, args.after.placements);
  const largeObjectJumps = movements.filter(
    (movement) => movement.distanceLu > movement.thresholdLu,
  );
  const scope = inferMutationTargetScope({
    beforeSpec: args.before.spec,
    patch: args.patch,
    spatialDirectives: args.spatialDirectives,
  });
  const unrelatedObjectMutations =
    args.stepKind === "apply"
      ? movements.filter(
          (movement) =>
            movement.distanceLu > 2 &&
            !isMovementTargeted(movement, scope),
        )
      : [];
  const capacityResetDetected =
    args.stepKind === "apply" &&
    inferCapacityTargetFromPrompt(args.prompt) == null &&
    args.before.attendeeTarget !== 0 &&
    args.before.attendeeTarget !== args.after.attendeeTarget;
  const spatialAffirmsExistingLayout =
    args.stepKind === "apply" &&
    args.spatialDirectives.includes("createNetworkingLoungePerimeter") &&
    args.spatialDirectives.length === 1;
  const noVisibleChangeDetected =
    !spatialAffirmsExistingLayout &&
    args.before.attendeeTarget === args.after.attendeeTarget &&
    args.before.appliedSeatCapacity === args.after.appliedSeatCapacity &&
    args.before.placementCounts.total === args.after.placementCounts.total &&
    movements.every((movement) => movement.distanceLu <= 0.01);

  return {
    beforeOverlapCount: issueCountByCode(
      args.before.placements,
      args.before.roomWidthLu,
      args.before.roomDepthLu,
      "overlap",
    ),
    afterOverlapCount: issueCountByCode(
      args.after.placements,
      args.after.roomWidthLu,
      args.after.roomDepthLu,
      "overlap",
    ),
    beforeOutOfBoundsCount: issueCountByCode(
      args.before.placements,
      args.before.roomWidthLu,
      args.before.roomDepthLu,
      "out_of_bounds",
    ),
    afterOutOfBoundsCount: issueCountByCode(
      args.after.placements,
      args.after.roomWidthLu,
      args.after.roomDepthLu,
      "out_of_bounds",
    ),
    attendeeCountDelta: args.after.attendeeTarget - args.before.attendeeTarget,
    appliedSeatCapacityDelta:
      args.after.appliedSeatCapacity - args.before.appliedSeatCapacity,
    capacityResetDetected,
    noVisibleChangeDetected,
    largeObjectJumps,
    unrelatedObjectMutations,
  };
}

function deriveStatus(
  diagnostics: PlannerSimulationDiagnostics,
  warnings: readonly string[],
  expectationFailures: readonly string[],
): PlannerSimulationStatus {
  if (expectationFailures.length > 0) return "fail";
  if (
    diagnostics.afterOverlapCount > 0 ||
    diagnostics.afterOutOfBoundsCount > 0 ||
    diagnostics.capacityResetDetected
  ) {
    return "fail";
  }

  if (
    warnings.length > 0 ||
    diagnostics.noVisibleChangeDetected ||
    diagnostics.largeObjectJumps.length > 0 ||
    diagnostics.unrelatedObjectMutations.length > 0
  ) {
    return "warn";
  }

  return "pass";
}

function countComponent(
  snapshot: PlannerSimulationSnapshot,
  componentId: RoomSetComponentId,
): number {
  return snapshot.placementCounts.byComponent.find((entry) => entry.componentId === componentId)?.count ?? 0;
}

function countCategory(
  snapshot: PlannerSimulationSnapshot,
  categoryId: RoomSetComponentCategoryId,
): number {
  return snapshot.placementCounts.byCategory.find((entry) => entry.category === categoryId)?.count ?? 0;
}

function componentDimensions(componentId: RoomSetComponentId): Readonly<{ widthLu: number; depthLu: number }> {
  const component = getRoomSetComponent(componentId);
  return {
    widthLu: component?.widthLu ?? 1,
    depthLu: component?.depthLu ?? 1,
  };
}

function placementsForComponent(
  placements: readonly RoomSetLayoutPlacement[],
  componentId: RoomSetComponentId,
): readonly RoomSetLayoutPlacement[] {
  return placements.filter((placement) => placement.componentId === componentId);
}

function placementCentersForComponent(
  placements: readonly RoomSetLayoutPlacement[],
  componentId: RoomSetComponentId,
): readonly Readonly<{ x: number; y: number }>[] {
  const dimensions = componentDimensions(componentId);
  return placementsForComponent(placements, componentId).map((placement) => ({
    x: placement.xLu + dimensions.widthLu / 2,
    y: placement.yLu + dimensions.depthLu / 2,
  }));
}

function componentFootprint(
  placements: readonly RoomSetLayoutPlacement[],
  componentId: RoomSetComponentId,
): Readonly<{ width: number; depth: number; area: number }> | null {
  const matching = placementsForComponent(placements, componentId);
  if (matching.length === 0) return null;
  const dimensions = componentDimensions(componentId);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const placement of matching) {
    minX = Math.min(minX, placement.xLu);
    minY = Math.min(minY, placement.yLu);
    maxX = Math.max(maxX, placement.xLu + dimensions.widthLu);
    maxY = Math.max(maxY, placement.yLu + dimensions.depthLu);
  }
  const width = maxX - minX;
  const depth = maxY - minY;
  return { width, depth, area: width * depth };
}

function maxAlignedColumnCount(
  placements: readonly RoomSetLayoutPlacement[],
  componentId: RoomSetComponentId,
): number {
  const dimensions = componentDimensions(componentId);
  const centers = [...placementCentersForComponent(placements, componentId)].sort((left, right) => left.x - right.x);
  const tolerance = Math.max(0.75, dimensions.widthLu * 0.18);
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

function clusterCentersByY(
  centers: readonly Readonly<{ x: number; y: number }>[],
  tolerance: number,
): Array<Array<Readonly<{ x: number; y: number }>>> {
  const sorted = [...centers].sort((left, right) => left.y - right.y);
  const clusters: Array<Array<Readonly<{ x: number; y: number }>>> = [];
  for (const center of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current) {
      clusters.push([center]);
      continue;
    }
    const mean = current.reduce((sum, item) => sum + item.y, 0) / current.length;
    if (Math.abs(center.y - mean) <= tolerance) {
      current.push(center);
    } else {
      clusters.push([center]);
    }
  }
  return clusters;
}

function rowOffsetSpread(
  placements: readonly RoomSetLayoutPlacement[],
  componentId: RoomSetComponentId,
): number {
  const dimensions = componentDimensions(componentId);
  const rows = clusterCentersByY(
    placementCentersForComponent(placements, componentId),
    Math.max(0.8, dimensions.depthLu * 0.32),
  ).filter((row) => row.length >= 2);
  if (rows.length <= 1) return 0;
  const leftEdges = rows.map((row) => Math.min(...row.map((center) => center.x - dimensions.widthLu / 2)));
  return Math.max(...leftEdges) - Math.min(...leftEdges);
}

function primaryStageSideDistribution(
  placements: readonly RoomSetLayoutPlacement[],
  componentId: RoomSetComponentId,
): Readonly<{ left: number; right: number }> | null {
  const stage = placements.find((placement) => categoryForPlacement(placement) === "stages");
  if (!stage) return null;
  const stageDimensions = componentDimensions(stage.componentId);
  const primaryDimensions = componentDimensions(componentId);
  const stageLeft = stage.xLu;
  const stageRight = stage.xLu + stageDimensions.widthLu;
  const fullWidthZoneTop = stage.yLu + stageDimensions.depthLu + 2;
  let left = 0;
  let right = 0;
  for (const placement of placementsForComponent(placements, componentId)) {
    if (placement.yLu >= fullWidthZoneTop - 1e-6) continue;
    if (placement.xLu + primaryDimensions.widthLu <= stageLeft + 1e-6) left += 1;
    if (placement.xLu >= stageRight - 1e-6) right += 1;
  }
  return { left, right };
}

function itemCountByComponent(items: readonly Readonly<{ componentId: RoomSetComponentId; count: number }>[]): Map<RoomSetComponentId, number> {
  const counts = new Map<RoomSetComponentId, number>();
  for (const item of items) {
    counts.set(item.componentId, (counts.get(item.componentId) ?? 0) + item.count);
  }
  return counts;
}

function evaluateStepExpectations(args: Readonly<{
  step: PlannerSimulationStepDefinition;
  before: PlannerSimulationSnapshot;
  after: PlannerSimulationSnapshot;
  diagnostics: PlannerSimulationDiagnostics;
  applyPath: "spec" | "patch" | "spatial" | null;
  patchSummary: readonly Record<string, unknown>[];
  spatialDirectives: readonly ApplySpatialDirective[];
  semanticDirectiveKeys: readonly string[];
}>): readonly string[] {
  const expectations = args.step.expectations;
  if (!expectations) return [];

  const failures: string[] = [];
  const afterSpec = args.after.spec;
  const beforeSpec = args.before.spec;

  if (expectations.layoutType && afterSpec?.layoutType !== expectations.layoutType) {
    failures.push(`Expected layoutType ${expectations.layoutType}, got ${afterSpec?.layoutType ?? "none"}.`);
  }
  if (expectations.audienceStyle && afterSpec?.audienceStyle !== expectations.audienceStyle) {
    failures.push(`Expected audienceStyle ${expectations.audienceStyle}, got ${afterSpec?.audienceStyle ?? "none"}.`);
  }
  if (
    expectations.primaryComponentId &&
    afterSpec?.audience.primaryComponentId !== expectations.primaryComponentId
  ) {
    failures.push(
      `Expected primary ${expectations.primaryComponentId}, got ${afterSpec?.audience.primaryComponentId ?? "none"}.`,
    );
  }
  if (expectations.attendeeTarget !== undefined && args.after.attendeeTarget !== expectations.attendeeTarget) {
    failures.push(`Expected attendee target ${expectations.attendeeTarget}, got ${args.after.attendeeTarget}.`);
  }
  if (expectations.attendeeUnchanged && args.before.attendeeTarget !== args.after.attendeeTarget) {
    failures.push(`Expected attendee target unchanged, got ${args.before.attendeeTarget}->${args.after.attendeeTarget}.`);
  }
  if (
    expectations.capacityMinRatio !== undefined &&
    args.after.appliedSeatCapacity < args.after.attendeeTarget * expectations.capacityMinRatio
  ) {
    failures.push(
      `Expected capacity ratio >= ${expectations.capacityMinRatio}, got ${roundMetric(args.after.appliedSeatCapacity / Math.max(1, args.after.attendeeTarget))}.`,
    );
  }
  if (
    expectations.capacityMaxRatio !== undefined &&
    args.after.appliedSeatCapacity > args.after.attendeeTarget * expectations.capacityMaxRatio
  ) {
    failures.push(
      `Expected capacity ratio <= ${expectations.capacityMaxRatio}, got ${roundMetric(args.after.appliedSeatCapacity / Math.max(1, args.after.attendeeTarget))}.`,
    );
  }
  for (const componentId of expectations.requiredComponents ?? []) {
    if (countComponent(args.after, componentId) <= 0) {
      failures.push(`Expected component ${componentId} to be present.`);
    }
  }
  for (const categoryId of expectations.requiredCategories ?? []) {
    if (countCategory(args.after, categoryId) <= 0) {
      failures.push(`Expected category ${categoryId} to be present.`);
    }
  }
  for (const componentId of expectations.absentComponents ?? []) {
    if (countComponent(args.after, componentId) > 0) {
      failures.push(`Expected component ${componentId} to be absent.`);
    }
  }
  if (
    expectations.frontPreserved &&
    beforeSpec &&
    afterSpec &&
    JSON.stringify(beforeSpec.front) !== JSON.stringify(afterSpec.front)
  ) {
    failures.push("Expected front/stage/screen/AV spec to be preserved.");
  }
  if (
    expectations.secondaryPreserved &&
    beforeSpec &&
    afterSpec &&
    JSON.stringify(beforeSpec.secondary) !== JSON.stringify(afterSpec.secondary)
  ) {
    failures.push("Expected secondary/support spec to be preserved.");
  }
  if (expectations.supportPreserved && beforeSpec && afterSpec) {
    const beforeCounts = itemCountByComponent(beforeSpec.secondary);
    const afterCounts = itemCountByComponent(afterSpec.secondary);
    for (const [componentId, beforeCount] of beforeCounts) {
      if ((afterCounts.get(componentId) ?? 0) < beforeCount) {
        failures.push(`Expected support component ${componentId} count to be preserved.`);
      }
    }
  }
  for (const componentId of expectations.distributedComponents ?? []) {
    const placements = args.after.placements.filter((placement) => placement.componentId === componentId);
    if (placements.length <= 1) continue;
    const allLeftWall = placements.every((placement) => Math.abs(placement.xLu - 2) < 1e-6);
    if (allLeftWall) {
      failures.push(`Expected ${componentId} placements not to all stack on the xLu=2 left wall.`);
    }
  }
  const primaryComponentId = afterSpec?.audience.primaryComponentId ?? null;
  if (primaryComponentId) {
    const afterFootprint = componentFootprint(args.after.placements, primaryComponentId);
    const beforeFootprint = componentFootprint(args.before.placements, primaryComponentId);
    if (
      expectations.primaryFootprintMinWidth !== undefined &&
      (!afterFootprint || afterFootprint.width < expectations.primaryFootprintMinWidth)
    ) {
      failures.push(
        `Expected primary footprint width >= ${expectations.primaryFootprintMinWidth}, got ${roundMetric(afterFootprint?.width ?? 0)}.`,
      );
    }
    if (
      expectations.primaryFootprintMinDepth !== undefined &&
      (!afterFootprint || afterFootprint.depth < expectations.primaryFootprintMinDepth)
    ) {
      failures.push(
        `Expected primary footprint depth >= ${expectations.primaryFootprintMinDepth}, got ${roundMetric(afterFootprint?.depth ?? 0)}.`,
      );
    }
    if (
      expectations.primaryFootprintWiderThanBefore &&
      beforeFootprint &&
      afterFootprint &&
      afterFootprint.width <= beforeFootprint.width
    ) {
      failures.push(
        `Expected primary footprint wider than before, got ${roundMetric(beforeFootprint.width)}->${roundMetric(afterFootprint.width)}.`,
      );
    }
    if (
      expectations.primaryFootprintDepthAtLeastBefore &&
      beforeFootprint &&
      afterFootprint &&
      afterFootprint.depth + 1e-6 < beforeFootprint.depth
    ) {
      failures.push(
        `Expected primary footprint depth at least before, got ${roundMetric(beforeFootprint.depth)}->${roundMetric(afterFootprint.depth)}.`,
      );
    }
    if (
      expectations.primaryMaxAlignedColumnCount !== undefined &&
      maxAlignedColumnCount(args.after.placements, primaryComponentId) > expectations.primaryMaxAlignedColumnCount
    ) {
      failures.push(
        `Expected primary aligned column count <= ${expectations.primaryMaxAlignedColumnCount}, got ${maxAlignedColumnCount(args.after.placements, primaryComponentId)}.`,
      );
    }
    if (
      expectations.primaryMinRowOffsetSpread !== undefined &&
      rowOffsetSpread(args.after.placements, primaryComponentId) < expectations.primaryMinRowOffsetSpread
    ) {
      failures.push(
        `Expected primary row offset spread >= ${expectations.primaryMinRowOffsetSpread}, got ${roundMetric(rowOffsetSpread(args.after.placements, primaryComponentId))}.`,
      );
    }
    if (expectations.primaryStageSideRegions) {
      const distribution = primaryStageSideDistribution(args.after.placements, primaryComponentId);
      if (!distribution) {
        failures.push("Expected stage-side primary placement but no stage was present.");
      } else if (
        expectations.primaryStageSideRegions === "both" &&
        (distribution.left <= 0 || distribution.right <= 0)
      ) {
        failures.push(`Expected primary placement left and right of stage, got left=${distribution.left}, right=${distribution.right}.`);
      } else if (
        expectations.primaryStageSideRegions === "any" &&
        distribution.left + distribution.right <= 0
      ) {
        failures.push("Expected primary placement in at least one stage-side region.");
      }
    }
  }

  return failures;
}

function evaluateStepExpectationWarnings(args: Readonly<{
  step: PlannerSimulationStepDefinition;
  diagnostics: PlannerSimulationDiagnostics;
  applyPath: "spec" | "patch" | "spatial" | null;
  patchSummary: readonly Record<string, unknown>[];
  spatialDirectives: readonly ApplySpatialDirective[];
  semanticDirectiveKeys: readonly string[];
}>): readonly string[] {
  const expectations = args.step.expectations;
  if (!expectations) return [];

  const warnings: string[] = [];
  if (
    expectations.expectedApplyPaths &&
    (!args.applyPath || !expectations.expectedApplyPaths.includes(args.applyPath))
  ) {
    warnings.push(
      `Expected applyPath ${expectations.expectedApplyPaths.join("|")}, got ${args.applyPath ?? "none"}.`,
    );
  }
  if (
    expectations.noNoOp &&
    args.diagnostics.noVisibleChangeDetected &&
    args.patchSummary.length === 0 &&
    args.spatialDirectives.length === 0 &&
    args.semanticDirectiveKeys.length === 0
  ) {
    warnings.push("Expected visible or semantic change, but step was a no-op.");
  }
  return warnings;
}

function withSuppressedComposeLogs<T>(fn: () => T): T {
  const priorInfo = console.info;
  const priorWarn = console.warn;
  console.info = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.info = priorInfo;
    console.warn = priorWarn;
  }
}

function executeGenerateStep(
  step: Extract<PlannerSimulationStepDefinition, { kind: "generate" }>,
): SimulationState {
  const composed = withSuppressedComposeLogs(() =>
    composeLayoutSpec({
      spec: step.spec,
      roomWidthLu: step.roomWidthLu,
      roomDepthLu: step.roomDepthLu,
    }),
  );

  if (!composed.ok) {
    throw new Error(
      composed.issues.map((issue) => issue.message).join(" | ") ||
        "Generate simulation failed.",
    );
  }

  const validated = validatePlannerLayoutPlacements(
    composed.placements,
    step.roomWidthLu,
    step.roomDepthLu,
  );
  if (!validated.ok) {
    throw new Error(
      validated.issues.map((issue) => issue.message).join(" | ") ||
        "Generate validation failed.",
    );
  }

  return {
    roomWidthLu: step.roomWidthLu,
    roomDepthLu: step.roomDepthLu,
    spec: step.spec,
    scene:
      composed.scene ??
      plannerSceneFromLayoutPlacements(validated.placements, {
        widthLu: step.roomWidthLu,
        depthLu: step.roomDepthLu,
      }),
    placements: validated.placements,
    attendeeTarget: step.spec.attendeeTarget,
    appliedSeatCapacity: sumPlatedSeatCapacity(validated.placements),
  };
}

function executeApplyStep(
  step: Extract<PlannerSimulationStepDefinition, { kind: "apply" }>,
  state: SimulationState,
): ApplyExecutionResult {
  const topologySummary = withSuppressedComposeLogs(() =>
    buildApplyLayoutSummary(state.spec, state.roomWidthLu, state.roomDepthLu),
  );
  let patch =
    step.patch ??
    buildDeterministicApplyLayoutPatch({
      prompt: step.prompt,
      currentTopologyRows: topologySummary.topologyRows,
      baseLayoutType: state.spec.layoutType,
    }) ??
    { version: 1, ops: [] };

  patch = supplementLayoutPatchFromPrompt(
    patch,
    step.prompt,
    state.spec.attendeeTarget,
    { baseLayoutSpec: state.spec },
  );
  patch = supplementLayoutPatchSeatingStyleFromPrompt(patch, {
    prompt: step.prompt,
    baseLayoutType: state.spec.layoutType,
  });
  patch = supplementLayoutPatchTopologyFromPrompt(
    patch,
    step.prompt,
    topologySummary.topologyRows,
  );

  const patchedSpec = applyLayoutPatch(state.spec, patch);
  const spatialDirectives = inferSpatialApplyDirectives(step.prompt);
  const patchSummary = summarizeLayoutPatchOps(patch);
  const layoutPatchHasStructuralOps = patch.ops.some((op) =>
    op.op === "addItems" ||
    op.op === "removeItems" ||
    op.op === "setAttendeeTarget" ||
    op.op === "setLayoutType" ||
    op.op === "setFrontScreen" ||
    op.op === "setFrontStage",
  );

  if (spatialDirectives.length > 0 && !layoutPatchHasStructuralOps) {
    const spatialApplied = applySpatialDirectivesToLayout({
      placements: state.placements,
      roomWidthLu: state.roomWidthLu,
      roomDepthLu: state.roomDepthLu,
      primaryAudienceComponentId: state.spec.audience.primaryComponentId,
      directives: spatialDirectives,
    });
    const spatialValidated = validatePlannerLayoutPlacements(
      spatialApplied.placements,
      state.roomWidthLu,
      state.roomDepthLu,
    );
    if (spatialValidated.ok) {
      return {
        state: {
          roomWidthLu: state.roomWidthLu,
          roomDepthLu: state.roomDepthLu,
          spec: patchedSpec,
          scene: plannerSceneFromLayoutPlacements(spatialValidated.placements, {
            widthLu: state.roomWidthLu,
            depthLu: state.roomDepthLu,
          }),
          placements: spatialValidated.placements,
          attendeeTarget: patchedSpec.attendeeTarget,
          appliedSeatCapacity: sumPlatedSeatCapacity(spatialValidated.placements),
        },
        warnings: spatialApplied.warnings,
        applyPath: "spatial",
        patch,
        patchSummary,
        spatialDirectives,
        semanticDirectiveKeys: mergePlannerSemanticDirectiveKeys({
          prompt: step.prompt,
          currentTopologyRows: topologySummary.topologyRows,
        }),
      };
    }
  }

  const applyComposed = withSuppressedComposeLogs(() =>
    composeLayoutSpecForApply({
      spec: patchedSpec,
      roomWidthLu: state.roomWidthLu,
      roomDepthLu: state.roomDepthLu,
      applyContext: {
        baseSpec: state.spec,
        prompt: step.prompt,
        sidebarAttendeeCount: state.attendeeTarget,
        sidebarDensityPreference: state.spec.densityPreference,
      },
    }),
  );
  const composed = applyComposed.result;
  if (!composed.ok) {
    throw new Error(
      composed.issues.map((issue) => issue.message).join(" | ") ||
        "Apply compose failed.",
    );
  }
  const validated = validatePlannerLayoutPlacements(
    composed.placements,
    state.roomWidthLu,
    state.roomDepthLu,
  );
  if (!validated.ok) {
    throw new Error(
      validated.issues.map((issue) => issue.message).join(" | ") ||
        "Apply validation failed.",
    );
  }

  return {
    state: {
      roomWidthLu: state.roomWidthLu,
      roomDepthLu: state.roomDepthLu,
      spec: applyComposed.layoutSpec,
      scene:
        composed.scene ??
        plannerSceneFromLayoutPlacements(validated.placements, {
          widthLu: state.roomWidthLu,
          depthLu: state.roomDepthLu,
        }),
      placements: validated.placements,
      attendeeTarget: applyComposed.layoutSpec.attendeeTarget,
      appliedSeatCapacity: sumPlatedSeatCapacity(validated.placements),
    },
    warnings: composed.warnings,
    applyPath: "patch",
    patch,
    patchSummary,
    spatialDirectives,
    semanticDirectiveKeys: mergePlannerSemanticDirectiveKeys({
      prompt: step.prompt,
      topologyDirectives: applyComposed.semanticDirectives,
      currentTopologyRows: topologySummary.topologyRows,
    }),
  };
}

function buildStepNotes(args: Readonly<{
  stepKind: "generate" | "apply";
  diagnostics: PlannerSimulationDiagnostics;
  warnings: readonly string[];
  expectationFailures: readonly string[];
  patchSummary: readonly Record<string, unknown>[];
  spatialDirectives: readonly ApplySpatialDirective[];
  semanticDirectiveKeys: readonly string[];
  applyPath: "spec" | "patch" | "spatial" | null;
}>): readonly string[] {
  const notes: string[] = [];

  if (args.expectationFailures.length > 0) {
    notes.push(`Expectation failures: ${args.expectationFailures.join(" | ")}`);
  }
  if (args.stepKind === "apply" && args.patchSummary.length === 0 && args.spatialDirectives.length === 0) {
    notes.push("No deterministic patch or spatial directives were inferred.");
  }
  if (args.diagnostics.capacityResetDetected) {
    notes.push("Attendee target changed without an explicit capacity prompt.");
  }
  if (args.diagnostics.noVisibleChangeDetected) {
    notes.push("No visible placement or attendee change was detected.");
  }
  if (args.diagnostics.largeObjectJumps.length > 0) {
    notes.push(
      `Large jumps detected: ${args.diagnostics.largeObjectJumps.length} object(s).`,
    );
  }
  if (args.diagnostics.unrelatedObjectMutations.length > 0) {
    notes.push(
      `Unrelated object mutations detected: ${args.diagnostics.unrelatedObjectMutations.length} object(s).`,
    );
  }
  if (args.applyPath) {
    notes.push(`Apply path: ${args.applyPath}.`);
  }
  if (args.semanticDirectiveKeys.length > 0) {
    notes.push(`Semantic directives: ${args.semanticDirectiveKeys.join(", ")}.`);
  }
  if (args.spatialDirectives.length > 0) {
    notes.push(`Spatial directives: ${args.spatialDirectives.join(", ")}.`);
  }
  if (args.warnings.length > 0) {
    notes.push(`Warnings: ${args.warnings.join(" | ")}`);
  }

  return notes;
}

function errorMessageFromUnknown(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runPlannerSimulationScenario(
  scenario: PlannerSimulationScenarioDefinition,
): PlannerSimulationScenarioResult {
  const stepResults: PlannerSimulationStepResult[] = [];
  let currentState: SimulationState | null = null;

  for (let index = 0; index < scenario.steps.length; index += 1) {
    const step = scenario.steps[index]!;
    const before =
      step.kind === "generate"
        ? emptySnapshot(step.roomWidthLu, step.roomDepthLu)
        : currentState
          ? snapshotFromState(currentState)
          : (() => {
              throw new Error(
                `Apply step "${step.id}" requires a prior generate/apply state.`,
              );
            })();

    if (step.kind === "generate") {
      let nextState: SimulationState;
      try {
        nextState = executeGenerateStep(step);
      } catch (error) {
        const errorMessage = errorMessageFromUnknown(error);
        const emptyPatch: LayoutPatch = { version: 1, ops: [] };
        const diagnostics = buildDiagnostics({
          stepKind: step.kind,
          prompt: step.prompt,
          before,
          after: before,
          patch: emptyPatch,
          spatialDirectives: [],
        });
        const expectationFailures = [`Execution failed: ${errorMessage}`];
        const notes = buildStepNotes({
          stepKind: step.kind,
          diagnostics,
          warnings: [],
          expectationFailures,
          patchSummary: [],
          spatialDirectives: [],
          semanticDirectiveKeys: [],
          applyPath: "spec",
        });
        stepResults.push({
          scenarioId: scenario.id,
          scenarioLabel: scenario.label,
          stepIndex: index,
          stepId: step.id,
          stepLabel: step.label,
          kind: step.kind,
          prompt: step.prompt,
          status: "fail",
          before,
          after: before,
          diagnostics,
          warnings: [],
          notes,
          expectationFailures,
          executionError: errorMessage,
          applyPath: "spec",
          patchSummary: [],
          spatialDirectives: [],
          semanticDirectiveKeys: [],
        });
        break;
      }

      currentState = nextState;
      const after = snapshotFromState(currentState);
      const emptyPatch: LayoutPatch = { version: 1, ops: [] };
      const diagnostics = buildDiagnostics({
        stepKind: step.kind,
        prompt: step.prompt,
        before,
        after,
        patch: emptyPatch,
        spatialDirectives: [],
      });
      const expectationFailures = evaluateStepExpectations({
        step,
        before,
        after,
        diagnostics,
        applyPath: "spec",
        patchSummary: [],
        spatialDirectives: [],
        semanticDirectiveKeys: [],
      });
      const expectationWarnings = evaluateStepExpectationWarnings({
        step,
        diagnostics,
        applyPath: "spec",
        patchSummary: [],
        spatialDirectives: [],
        semanticDirectiveKeys: [],
      });
      const notes = buildStepNotes({
        stepKind: step.kind,
        diagnostics,
        warnings: expectationWarnings,
        expectationFailures,
        patchSummary: [],
        spatialDirectives: [],
        semanticDirectiveKeys: [],
        applyPath: "spec",
      });
      const status = deriveStatus(diagnostics, expectationWarnings, expectationFailures);
      stepResults.push({
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        stepIndex: index,
        stepId: step.id,
        stepLabel: step.label,
        kind: step.kind,
        prompt: step.prompt,
        status,
        before,
        after,
        diagnostics,
        warnings: expectationWarnings,
        notes,
        expectationFailures,
        applyPath: "spec",
        patchSummary: [],
        spatialDirectives: [],
        semanticDirectiveKeys: [],
      });
      continue;
    }

    let applied: ApplyExecutionResult;
    try {
      applied = executeApplyStep(step, currentState!);
    } catch (error) {
      const errorMessage = errorMessageFromUnknown(error);
      const emptyPatch: LayoutPatch = { version: 1, ops: [] };
      const diagnostics = buildDiagnostics({
        stepKind: step.kind,
        prompt: step.prompt,
        before,
        after: before,
        patch: emptyPatch,
        spatialDirectives: [],
      });
      const expectationFailures = [`Execution failed: ${errorMessage}`];
      const notes = buildStepNotes({
        stepKind: step.kind,
        diagnostics,
        warnings: [],
        expectationFailures,
        patchSummary: [],
        spatialDirectives: [],
        semanticDirectiveKeys: [],
        applyPath: null,
      });
      stepResults.push({
        scenarioId: scenario.id,
        scenarioLabel: scenario.label,
        stepIndex: index,
        stepId: step.id,
        stepLabel: step.label,
        kind: step.kind,
        prompt: step.prompt,
        status: "fail",
        before,
        after: before,
        diagnostics,
        warnings: [],
        notes,
        expectationFailures,
        executionError: errorMessage,
        applyPath: null,
        patchSummary: [],
        spatialDirectives: [],
        semanticDirectiveKeys: [],
      });
      break;
    }

    currentState = applied.state;
    const after = snapshotFromState(currentState);
    const diagnostics = buildDiagnostics({
      stepKind: step.kind,
      prompt: step.prompt,
      before,
      after,
      patch: applied.patch,
      spatialDirectives: applied.spatialDirectives,
    });
    const expectationFailures = evaluateStepExpectations({
      step,
      before,
      after,
      diagnostics,
      applyPath: applied.applyPath,
      patchSummary: applied.patchSummary,
      spatialDirectives: applied.spatialDirectives,
      semanticDirectiveKeys: applied.semanticDirectiveKeys,
    });
    const expectationWarnings = evaluateStepExpectationWarnings({
      step,
      diagnostics,
      applyPath: applied.applyPath,
      patchSummary: applied.patchSummary,
      spatialDirectives: applied.spatialDirectives,
      semanticDirectiveKeys: applied.semanticDirectiveKeys,
    });
    const warnings = [...applied.warnings, ...expectationWarnings];
    const notes = buildStepNotes({
      stepKind: step.kind,
      diagnostics,
      warnings,
      expectationFailures,
      patchSummary: applied.patchSummary,
      spatialDirectives: applied.spatialDirectives,
      semanticDirectiveKeys: applied.semanticDirectiveKeys,
      applyPath: applied.applyPath,
    });
    const status = deriveStatus(diagnostics, warnings, expectationFailures);
    stepResults.push({
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      stepIndex: index,
      stepId: step.id,
      stepLabel: step.label,
      kind: step.kind,
      prompt: step.prompt,
      status,
      before,
      after,
      diagnostics,
      warnings,
      notes,
      expectationFailures,
      applyPath: applied.applyPath,
      patchSummary: applied.patchSummary,
      spatialDirectives: applied.spatialDirectives,
      semanticDirectiveKeys: applied.semanticDirectiveKeys,
    });
  }

  const failCount = stepResults.filter((step) => step.status === "fail").length;
  const warningCount = stepResults.filter((step) => step.status === "warn").length;
  return {
    id: scenario.id,
    label: scenario.label,
    status: failCount > 0 ? "fail" : warningCount > 0 ? "warn" : "pass",
    steps: stepResults,
    warningCount,
    failCount,
  };
}

export function runPlannerSimulationSuite(
  scenarios: readonly PlannerSimulationScenarioDefinition[],
): PlannerSimulationSuiteResult {
  const results = scenarios.map(runPlannerSimulationScenario);
  const stepResults = results.flatMap((scenario) => scenario.steps);
  return {
    scenarios: results,
    summary: {
      pass: stepResults.filter((step) => step.status === "pass").length,
      warn: stepResults.filter((step) => step.status === "warn").length,
      fail: stepResults.filter((step) => step.status === "fail").length,
      stepCount: stepResults.length,
      scenarioCount: results.length,
    },
  };
}

function sceneColorsForCategory(category: string): Readonly<{
  fill: string;
  stroke: string;
  label: string;
}> {
  switch (category) {
    case "stages":
      return { fill: "#d9b38c", stroke: "#6b4423", label: "#3b2413" };
    case "av":
      return { fill: "#d9e6f8", stroke: "#295089", label: "#17345f" };
    case "fnb":
      return { fill: "#f8ddc6", stroke: "#8a4b21", label: "#5f2f0f" };
    case "registration":
      return { fill: "#e2f0c8", stroke: "#568023", label: "#32550f" };
    case "lounge":
      return { fill: "#f6d7df", stroke: "#9a4760", label: "#69273c" };
    case "booths":
      return { fill: "#d3f1f5", stroke: "#2e7f8e", label: "#1c5660" };
    case "seating":
    case "tables":
      return { fill: "#f6f3ee", stroke: "#74665a", label: "#433a34" };
    default:
      return { fill: "#e9eef5", stroke: "#58697f", label: "#334155" };
  }
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sceneTableSeatShape(object: PlannerSceneObject): PlannerSeatSurfaceShape | null {
  if (
    object.objectType === "banquet_table" &&
    (object.metadata.visualVariant === "round" ||
      object.metadata.visualVariant === "cocktailCluster")
  ) {
    return "round";
  }

  if (
    object.objectType === "classroom_table" ||
    (object.objectType === "banquet_table" && object.metadata.visualVariant === "rect")
  ) {
    return "rectangle";
  }

  return null;
}

function renderTableSeatMarkersSvg(
  object: PlannerSceneObject,
  scale: number,
  shape: PlannerSeatSurfaceShape,
): string[] {
  const x = object.transform.xLu * scale;
  const y = object.transform.yLu * scale;
  const width = object.transform.widthLu * scale;
  const depth = object.transform.depthLu * scale;
  const seats = plannerSeatPositionsForTable({
    capacity: object.capacity.seated,
    shape,
    widthLu: object.transform.widthLu,
    depthLu: object.transform.depthLu,
  });
  const seatSizePct =
    shape === "round"
      ? object.capacity.seated >= 12
        ? 15
        : object.capacity.seated >= 8
          ? 17
          : 20
      : object.capacity.seated >= 12
        ? 13
        : 15;
  const minSeatSize = shape === "rectangle" ? 12 : 4;
  const seatWidth = Math.max(minSeatSize, (width * seatSizePct) / 100);
  const seatDepth = Math.max(minSeatSize, (depth * seatSizePct) / 100);

  return seats.map((seat) => {
    const cx = x + (width * seat.xPct) / 100;
    const cy = y + (depth * seat.yPct) / 100;
    const rx = Math.min(seatWidth, seatDepth) * 0.22;
    return [
      `<g data-table-seat="true" data-object-id="${escapeXml(object.id)}" data-seat-index="${seat.index}" transform="rotate(${roundMetric(
        seat.angleDeg,
      )} ${roundMetric(cx)} ${roundMetric(cy)})">`,
      `<rect x="${roundMetric(cx - seatWidth / 2)}" y="${roundMetric(
        cy - seatDepth / 2,
      )}" width="${roundMetric(seatWidth)}" height="${roundMetric(seatDepth)}" rx="${roundMetric(
        rx,
      )}" ry="${roundMetric(rx)}" fill="#d6d3d1" stroke="#78716c" stroke-width="0.75" />`,
      `<rect x="${roundMetric(cx - seatWidth * 0.34)}" y="${roundMetric(
        cy - seatDepth * 0.05,
      )}" width="${roundMetric(seatWidth * 0.68)}" height="${roundMetric(
        seatDepth * 0.34,
      )}" rx="${roundMetric(rx * 0.8)}" ry="${roundMetric(
        rx * 0.8,
      )}" fill="#fafaf9" stroke="#a8a29e" stroke-width="0.45" />`,
      `</g>`,
    ].join("");
  });
}

function chairBlockRowsForObject(object: PlannerSceneObject): number {
  const capacity = Math.max(0, Math.round(object.capacity.seated));
  if (capacity <= 1) return 1;
  const isBlock =
    object.componentId === "seating-chair-block-20" ||
    object.componentId === "seating-chair-block-custom" ||
    (object.objectType === "chair_block" && object.transform.depthLu >= 7);
  if (!isBlock) return 1;
  return Math.max(2, Math.min(capacity, Math.round(object.transform.depthLu / 5)));
}

function renderChairBlockSeatMarkersSvg(object: PlannerSceneObject, scale: number): string[] {
  if (object.capacity.seated <= 0) return [];

  const x = object.transform.xLu * scale;
  const y = object.transform.yLu * scale;
  const width = object.transform.widthLu * scale;
  const depth = object.transform.depthLu * scale;
  const rows = chairBlockRowsForObject(object);
  const seats = plannerSeatPositionsForChairBlock({
    capacity: object.capacity.seated,
    rows,
    widthLu: object.transform.widthLu,
    depthLu: object.transform.depthLu,
    chairSpacingLu: 2.4,
    rowSpacingLu: 3.2,
  });
  const columns = Math.max(1, Math.ceil(seats.length / rows));
  const seatWidth = Math.max(6, Math.min(width * 0.16, width / Math.max(1, columns) * 0.72));
  const seatDepth = Math.max(7, Math.min(depth * 0.58, depth / Math.max(1, rows) * 0.64));

  return seats.map((seat) => {
    const cx = x + (width * seat.xPct) / 100;
    const cy = y + (depth * seat.yPct) / 100;
    const rx = Math.min(seatWidth, seatDepth) * 0.18;
    return [
      `<g data-chair-seat="true" data-chair-facing="front" data-seat-kind="chair" data-object-id="${escapeXml(object.id)}" data-seat-index="${seat.index}" data-chair-row="${seat.row}" data-chair-column="${seat.column}" transform="rotate(${roundMetric(
        seat.angleDeg,
      )} ${roundMetric(cx)} ${roundMetric(cy)})">`,
      `<rect x="${roundMetric(cx - seatWidth / 2)}" y="${roundMetric(
        cy - seatDepth / 2,
      )}" width="${roundMetric(seatWidth)}" height="${roundMetric(seatDepth)}" rx="${roundMetric(
        rx,
      )}" ry="${roundMetric(rx)}" fill="#eff6ff" stroke="#1d4ed8" stroke-width="0.65" />`,
      `<rect x="${roundMetric(cx - seatWidth * 0.36)}" y="${roundMetric(
        cy - seatDepth * 0.42,
      )}" width="${roundMetric(seatWidth * 0.72)}" height="${roundMetric(
        seatDepth * 0.34,
      )}" rx="${roundMetric(rx * 0.8)}" ry="${roundMetric(
        rx * 0.8,
      )}" fill="#ffffff" stroke="#1e3a8a" stroke-width="0.45" />`,
      `</g>`,
    ].join("");
  });
}

function renderSceneObjectSvg(
  object: PlannerSceneObject,
  scale: number,
): string {
  const x = object.transform.xLu * scale;
  const y = object.transform.yLu * scale;
  const width = object.transform.widthLu * scale;
  const depth = object.transform.depthLu * scale;
  const centerX = x + width / 2;
  const centerY = y + depth / 2;
  const colors = sceneColorsForCategory(object.metadata.componentCategory);
  const label = escapeXml(object.label?.trim() || object.name);
  const transform =
    object.transform.rotationDeg !== 0
      ? ` transform="rotate(${object.transform.rotationDeg} ${roundMetric(centerX)} ${roundMetric(centerY)})"`
      : "";

  let shape = "";
  if (
    object.metadata.visualVariant === "round" ||
    object.metadata.visualVariant === "cocktailCluster"
  ) {
    shape = `<circle cx="${roundMetric(centerX)}" cy="${roundMetric(centerY)}" r="${roundMetric(
      Math.min(width, depth) / 2,
    )}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.25" />`;
  } else {
    const rx =
      object.metadata.visualVariant === "row"
        ? 4
        : object.objectType === "stage"
          ? 2
          : 6;
    shape = `<rect x="${roundMetric(x)}" y="${roundMetric(y)}" width="${roundMetric(
      width,
    )}" height="${roundMetric(depth)}" rx="${rx}" ry="${rx}" fill="${colors.fill}" stroke="${colors.stroke}" stroke-width="1.25" />`;
  }

  const details: string[] = [];
  if (object.objectType === "stage") {
    details.push(
      `<line x1="${roundMetric(x)}" y1="${roundMetric(y + depth * 0.82)}" x2="${roundMetric(
        x + width,
      )}" y2="${roundMetric(y + depth * 0.82)}" stroke="#fff7ed" stroke-width="1" />`,
    );
    details.push(
      `<line x1="${roundMetric(x + width * 0.33)}" y1="${roundMetric(y)}" x2="${roundMetric(
        x + width * 0.33,
      )}" y2="${roundMetric(y + depth)}" stroke="#7c5a37" stroke-width="0.6" opacity="0.45" />`,
    );
    details.push(
      `<line x1="${roundMetric(x + width * 0.66)}" y1="${roundMetric(y)}" x2="${roundMetric(
        x + width * 0.66,
      )}" y2="${roundMetric(y + depth)}" stroke="#7c5a37" stroke-width="0.6" opacity="0.45" />`,
    );
  }
  if (object.metadata.visualVariant === "row") {
    details.push(
      `<line x1="${roundMetric(x + width * 0.1)}" y1="${roundMetric(y + depth * 0.72)}" x2="${roundMetric(
        x + width * 0.9,
      )}" y2="${roundMetric(y + depth * 0.72)}" stroke="#7c6f64" stroke-width="0.8" opacity="0.35" />`,
    );
  }
  if (object.objectType === "bar" || object.objectType === "buffet") {
    details.push(
      `<line x1="${roundMetric(x + width * 0.12)}" y1="${roundMetric(y + depth * 0.24)}" x2="${roundMetric(
        x + width * 0.88,
      )}" y2="${roundMetric(y + depth * 0.24)}" stroke="#ffffff" stroke-width="0.9" opacity="0.7" />`,
    );
  }
  const tableSeatShape = sceneTableSeatShape(object);
  if (tableSeatShape) {
    details.push(...renderTableSeatMarkersSvg(object, scale, tableSeatShape));
  }
  if (
    object.objectType === "chair_block" &&
    object.metadata.componentCategory === "seating"
  ) {
    details.push(...renderChairBlockSeatMarkersSvg(object, scale));
  }

  const labelSvg =
    width >= 40 && depth >= 18
      ? `<text x="${roundMetric(centerX)}" y="${roundMetric(centerY + 3)}" font-size="9" font-family="ui-sans-serif, system-ui" text-anchor="middle" fill="${colors.label}">${label}</text>`
      : "";

  return `<g${transform}>${shape}${details.join("")}${labelSvg}</g>`;
}

export function renderPlannerSceneSvg(
  scene: PlannerScene,
  title: string,
): string {
  const scale = 10;
  const pad = 28;
  const width = scene.roomShell.widthLu * scale + pad * 2;
  const height = scene.roomShell.depthLu * scale + pad * 2 + 26;
  const roomWidth = scene.roomShell.widthLu * scale;
  const roomDepth = scene.roomShell.depthLu * scale;
  const gridStep = 4 * scale;

  const gridLines: string[] = [];
  for (let x = 0; x <= roomWidth; x += gridStep) {
    gridLines.push(
      `<line x1="${pad + x}" y1="${pad}" x2="${pad + x}" y2="${pad + roomDepth}" stroke="#e2e8f0" stroke-width="${x % (gridStep * 5) === 0 ? 1 : 0.6}" />`,
    );
  }
  for (let y = 0; y <= roomDepth; y += gridStep) {
    gridLines.push(
      `<line x1="${pad}" y1="${pad + y}" x2="${pad + roomWidth}" y2="${pad + y}" stroke="#e2e8f0" stroke-width="${y % (gridStep * 5) === 0 ? 1 : 0.6}" />`,
    );
  }

  const objectsSvg = scene.objects
    .map((object) => renderSceneObjectSvg(object, scale))
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${roundMetric(width)}" height="${roundMetric(height)}" viewBox="0 0 ${roundMetric(width)} ${roundMetric(height)}">`,
    `<rect width="100%" height="100%" fill="#f8fafc" />`,
    `<text x="${pad}" y="18" font-size="13" font-family="ui-sans-serif, system-ui" font-weight="700" fill="#0f172a">${escapeXml(
      title,
    )}</text>`,
    `<rect x="${pad}" y="${pad}" width="${roundMetric(roomWidth)}" height="${roundMetric(
      roomDepth,
    )}" rx="8" ry="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.25" />`,
    gridLines.join(""),
    `<g transform="translate(${pad}, ${pad})">${objectsSvg}</g>`,
    `</svg>`,
  ].join("");
}

type RoomShellLu = Readonly<{ widthLu: number; depthLu: number }>;

function primaryForLayoutType(layoutType: LayoutSpecLayoutType): Readonly<{
  componentId: RoomSetComponentId;
  capacity: number;
}> {
  switch (layoutType) {
    case "banquet":
      return { componentId: "table-round-60", capacity: 8 };
    case "classroom":
      return { componentId: "seating-classroom-row", capacity: 12 };
    case "reception":
      return { componentId: "table-cocktail-cluster", capacity: 4 };
    case "theater":
    default:
      return { componentId: "seating-theater-row", capacity: 14 };
  }
}

function roomShellForLayoutType(layoutType: LayoutSpecLayoutType, attendees: number): RoomShellLu {
  if (layoutType === "banquet") {
    return attendees > 180 ? { widthLu: 176, depthLu: 124 } : { widthLu: 152, depthLu: 108 };
  }
  if (layoutType === "classroom") {
    return attendees > 150 ? { widthLu: 156, depthLu: 104 } : { widthLu: 136, depthLu: 92 };
  }
  if (layoutType === "reception") {
    return attendees > 150 ? { widthLu: 168, depthLu: 116 } : { widthLu: 148, depthLu: 100 };
  }
  return attendees > 180 ? { widthLu: 140, depthLu: 88 } : { widthLu: 124, depthLu: 78 };
}

function defaultFrontSpec(): LayoutSpec["front"] {
  return {
    screen: {
      componentId: "av-projector-screen",
      count: 1,
      zoneRole: "front",
    },
    stage: {
      componentId: "stage-riser",
      count: 1,
      zoneRole: "front",
    },
    av: [
      {
        componentId: "av-foh-control",
        count: 1,
        zoneRole: "rear",
        placementPreference: "rear",
      },
    ],
  };
}

function buildLayoutSpec(args: Readonly<{
  eventIntent: LayoutSpec["eventIntent"];
  layoutType: LayoutSpecLayoutType;
  attendees: number;
  densityPreference?: LayoutSpec["densityPreference"];
  audienceStyle?: LayoutSpec["audienceStyle"];
  front?: LayoutSpec["front"];
  secondary?: readonly LayoutSpec["secondary"][number][];
}>): LayoutSpec {
  const primary = primaryForLayoutType(args.layoutType);
  return {
    version: 1,
    source: "ai-generate",
    eventIntent: args.eventIntent,
    layoutType: args.layoutType,
    attendeeTarget: args.attendees,
    densityPreference: args.densityPreference ?? "balanced",
    audienceStyle: args.audienceStyle ?? "grid",
    front: args.front ?? defaultFrontSpec(),
    audience: {
      primaryComponentId: primary.componentId,
      primaryComponentCapacity: primary.capacity,
      requiredPrimaryComponents: Math.max(1, Math.ceil(args.attendees / primary.capacity)),
    },
    secondary: args.secondary ?? [],
  };
}

function buildGeneralSessionSpec(attendees: number): LayoutSpec {
  return buildLayoutSpec({
    eventIntent: "general_session",
    layoutType: "theater",
    attendees,
    secondary: [
      {
        componentId: "fnb-buffet-line",
        count: 1,
        zoneRole: "rear",
        placementPreference: "rear",
      },
      {
        componentId: "registration-desk",
        count: 1,
        zoneRole: "rear",
        placementPreference: "rear",
      },
    ],
  });
}

function buildGeneralSessionWithLoungeSeed(attendees: number): LayoutSpec {
  const base = buildGeneralSessionSpec(attendees);
  return {
    ...base,
    secondary: [
      ...base.secondary,
      {
        componentId: "lounge-chair",
        count: 4,
        zoneRole: "mixed",
      },
    ],
  };
}

function baseStep(
  id: string,
  label: string,
  prompt: string,
  spec: LayoutSpec,
  expectations?: PlannerSimulationStepExpectations,
): Extract<PlannerSimulationStepDefinition, { kind: "generate" }> {
  const shell = roomShellForLayoutType(spec.layoutType, spec.attendeeTarget);
  return {
    id,
    label,
    kind: "generate",
    prompt,
    roomWidthLu: shell.widthLu,
    roomDepthLu: shell.depthLu,
    spec,
    expectations,
  };
}

function applyStep(
  id: string,
  label: string,
  prompt: string,
  expectations?: PlannerSimulationStepExpectations,
  patch?: LayoutPatch,
): Extract<PlannerSimulationStepDefinition, { kind: "apply" }> {
  return {
    id,
    label,
    kind: "apply",
    prompt,
    ...(patch ? { patch } : {}),
    ...(expectations ? { expectations } : {}),
  };
}

function standardGenerateExpectations(spec: LayoutSpec): PlannerSimulationStepExpectations {
  return {
    layoutType: spec.layoutType,
    primaryComponentId: spec.audience.primaryComponentId,
    attendeeTarget: spec.attendeeTarget,
    capacityMinRatio: spec.layoutType === "reception" ? 0.8 : 0.95,
    capacityMaxRatio: 1.35,
  };
}

function buildPresetSpec(
  eventIntent: LayoutSpec["eventIntent"],
  layoutType: LayoutSpecLayoutType,
  attendees = 120,
  secondary: readonly LayoutSpec["secondary"][number][] = [],
): LayoutSpec {
  return buildLayoutSpec({
    eventIntent,
    layoutType,
    attendees,
    secondary,
  });
}

function buildPresetGenerateScenarios(): PlannerSimulationScenarioDefinition[] {
  const rows: readonly Readonly<{
    id: string;
    label: string;
    eventIntent: LayoutSpec["eventIntent"];
    layoutType: LayoutSpecLayoutType;
    secondary?: readonly LayoutSpec["secondary"][number][];
  }>[] = [
    { id: "banquet-with-remarks", label: "Banquet with remarks", eventIntent: "banquet_remarks", layoutType: "banquet" },
    { id: "awards-dinner", label: "Awards dinner", eventIntent: "awards_dinner", layoutType: "banquet" },
    { id: "training-session", label: "Training session", eventIntent: "training_session", layoutType: "classroom" },
    { id: "workshop", label: "Workshop", eventIntent: "workshop", layoutType: "classroom" },
    { id: "general-session", label: "General session", eventIntent: "general_session", layoutType: "theater" },
    {
      id: "networking-reception",
      label: "Networking reception",
      eventIntent: "networking_reception",
      layoutType: "reception",
      secondary: [{ componentId: "lounge-chair", count: 6, zoneRole: "perimeter" }],
    },
    { id: "town-hall", label: "Town hall", eventIntent: "town_hall", layoutType: "theater" },
    {
      id: "expo-lounge",
      label: "Expo lounge",
      eventIntent: "expo_lounge",
      layoutType: "reception",
      secondary: [
        { componentId: "booth-10x10", count: 2, zoneRole: "perimeter" },
        { componentId: "lounge-chair", count: 4, zoneRole: "perimeter" },
      ],
    },
  ];

  return rows.map((row) => {
    const spec = buildPresetSpec(row.eventIntent, row.layoutType, 120, row.secondary ?? []);
    return {
      id: `preset-${row.id}`,
      label: `Preset generate: ${row.label}`,
      tags: ["presets"],
      steps: [
        baseStep(
          "generate",
          row.label,
          `Generate a complete ${row.label} room set for 120 attendees.`,
          spec,
          {
            ...standardGenerateExpectations(spec),
            ...(row.secondary?.some((item) => item.componentId === "lounge-chair")
              ? { requiredComponents: ["lounge-chair"] }
              : {}),
            ...(row.secondary?.some((item) => item.componentId === "booth-10x10")
              ? { requiredComponents: ["booth-10x10"] }
              : {}),
          },
        ),
      ],
    };
  });
}

function buildModifierGenerateScenarios(): PlannerSimulationScenarioDefinition[] {
  const base = buildPresetSpec("general_session", "theater", 140);
  const rows: readonly Readonly<{
    id: string;
    label: string;
    prompt: string;
    spec: LayoutSpec;
    requiredComponents?: readonly RoomSetComponentId[];
    requiredCategories?: readonly RoomSetComponentCategoryId[];
    distributedComponents?: readonly RoomSetComponentId[];
  }>[] = [
    {
      id: "buffet",
      label: "Buffet / F&B",
      prompt: "Generate a general session with buffet / F&B.",
      spec: { ...base, secondary: [{ componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" }] },
      requiredComponents: ["fnb-buffet-line"],
      requiredCategories: ["fnb"],
    },
    {
      id: "bar",
      label: "Bar service",
      prompt: "Generate a general session with bar service.",
      spec: { ...base, secondary: [{ componentId: "fnb-portable-bar", count: 2, zoneRole: "rear" }] },
      requiredComponents: ["fnb-portable-bar"],
      distributedComponents: ["fnb-portable-bar"],
    },
    {
      id: "registration",
      label: "Registration / check-in",
      prompt: "Generate a general session with registration / check-in.",
      spec: { ...base, secondary: [{ componentId: "registration-desk", count: 1, zoneRole: "rear" }] },
      requiredComponents: ["registration-desk"],
      requiredCategories: ["registration"],
    },
    {
      id: "sponsor",
      label: "Sponsor visibility",
      prompt: "Generate a general session with sponsor visibility.",
      spec: { ...base, secondary: [{ componentId: "booth-10x10", count: 2, zoneRole: "perimeter" }] },
      requiredComponents: ["booth-10x10"],
      requiredCategories: ["booths"],
    },
    {
      id: "recording",
      label: "Recording / streaming",
      prompt: "Generate a general session with recording / streaming.",
      spec: {
        ...base,
        front: {
          ...base.front,
          av: [...base.front.av, { componentId: "av-confidence-monitor", count: 1, zoneRole: "front" }],
        },
      },
      requiredComponents: ["av-confidence-monitor"],
      requiredCategories: ["av"],
    },
    {
      id: "networking",
      label: "Networking emphasis",
      prompt: "Generate a general session with networking emphasis.",
      spec: { ...base, secondary: [{ componentId: "lounge-chair", count: 6, zoneRole: "perimeter" }] },
      requiredComponents: ["lounge-chair"],
      requiredCategories: ["lounge"],
      distributedComponents: ["lounge-chair"],
    },
  ];

  return rows.map((row) => ({
    id: `modifier-${row.id}`,
    label: `Modifier generate: ${row.label}`,
    tags: ["support", "presets"],
    steps: [
      baseStep("generate", row.label, row.prompt, row.spec, {
        ...standardGenerateExpectations(row.spec),
        requiredComponents: row.requiredComponents,
        requiredCategories: row.requiredCategories,
        distributedComponents: row.distributedComponents,
      }),
    ],
  }));
}

function buildPromptOverrideScenarios(): PlannerSimulationScenarioDefinition[] {
  const scenarios: PlannerSimulationScenarioDefinition[] = [];
  const trainingToRounds = buildPresetSpec("training_session", "banquet", 120);
  scenarios.push({
    id: "prompt-override-training-round-tables",
    label: "Prompt override: training to round tables",
    tags: ["presets", "seating"],
    steps: [
      baseStep(
        "generate",
        "Training session + round tables prompt",
        "Change the seating style to round tables.",
        trainingToRounds,
        standardGenerateExpectations(trainingToRounds),
      ),
    ],
  });

  const generalToClassroom = buildPresetSpec("general_session", "classroom", 120);
  scenarios.push({
    id: "prompt-override-general-classroom-rows",
    label: "Prompt override: general session to classroom rows",
    tags: ["presets", "seating"],
    steps: [
      baseStep(
        "generate",
        "General session + classroom rows prompt",
        "Use classroom rows.",
        generalToClassroom,
        standardGenerateExpectations(generalToClassroom),
      ),
    ],
  });

  const banquetToReception = buildPresetSpec("networking_reception", "reception", 120, [
    { componentId: "lounge-chair", count: 8, zoneRole: "perimeter" },
  ]);
  scenarios.push({
    id: "prompt-override-banquet-networking-reception",
    label: "Prompt override: banquet to networking reception",
    tags: ["presets", "support"],
    steps: [
      baseStep(
        "generate",
        "Banquet preset + networking reception prompt",
        "Make this a networking reception with lounge clusters.",
        banquetToReception,
        {
          ...standardGenerateExpectations(banquetToReception),
          requiredComponents: ["lounge-chair"],
          requiredCategories: ["lounge"],
        },
      ),
    ],
  });

  return scenarios;
}

function buildApplySeatingScenarios(): PlannerSimulationScenarioDefinition[] {
  const training = buildPresetSpec("training_session", "classroom", 120, [
    { componentId: "registration-desk", count: 1, zoneRole: "rear" },
  ]);
  const general = buildPresetSpec("general_session", "theater", 140, [
    { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
  ]);
  const banquet = buildPresetSpec("banquet_remarks", "banquet", 120, [
    { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
    { componentId: "registration-desk", count: 1, zoneRole: "rear" },
  ]);

  return [
    {
      id: "apply-seating-training-to-rounds",
      label: "Apply seating: training to round tables",
      tags: ["seating"],
      steps: [
        baseStep("generate", "Generate training", "Generate a training session for 120 attendees.", training, standardGenerateExpectations(training)),
        applyStep("rounds", "Apply round tables", "Change the seating style to round tables.", {
          layoutType: "banquet",
          primaryComponentId: "table-round-60",
          attendeeUnchanged: true,
          frontPreserved: true,
          supportPreserved: true,
          expectedApplyPaths: ["patch"],
        }),
      ],
    },
    {
      id: "apply-seating-theater-to-rounds",
      label: "Apply seating: theater to round tables",
      tags: ["seating"],
      steps: [
        baseStep("generate", "Generate general session", "Generate a general session for 140 attendees.", general, standardGenerateExpectations(general)),
        applyStep("rounds", "Apply round tables", "Change the seating style to round tables.", {
          layoutType: "banquet",
          primaryComponentId: "table-round-60",
          attendeeUnchanged: true,
          frontPreserved: true,
          supportPreserved: true,
          expectedApplyPaths: ["patch"],
        }),
      ],
    },
    {
      id: "apply-seating-banquet-to-classroom",
      label: "Apply seating: banquet to classroom rows",
      tags: ["seating"],
      steps: [
        baseStep("generate", "Generate banquet", "Generate banquet with remarks for 120 attendees.", banquet, standardGenerateExpectations(banquet)),
        applyStep(
          "classroom",
          "Apply classroom rows",
          "Change the seating style to classroom rows.",
          {
            layoutType: "classroom",
            primaryComponentId: "seating-classroom-row",
            attendeeUnchanged: true,
            frontPreserved: true,
            supportPreserved: true,
            expectedApplyPaths: ["patch"],
          },
          { version: 1, ops: [{ op: "setLayoutType", layoutType: "classroom" }] },
        ),
      ],
    },
    {
      id: "apply-seating-banquet-to-networking",
      label: "Apply seating: banquet to networking reception",
      tags: ["seating", "support"],
      steps: [
        baseStep("generate", "Generate banquet", "Generate banquet with remarks for 120 attendees.", banquet, standardGenerateExpectations(banquet)),
        applyStep(
          "networking",
          "Apply networking reception",
          "Make this a networking reception with lounge clusters.",
          {
            layoutType: "reception",
            primaryComponentId: "table-cocktail-cluster",
            attendeeUnchanged: true,
            frontPreserved: true,
            supportPreserved: true,
            requiredComponents: ["lounge-chair"],
            expectedApplyPaths: ["patch"],
          },
          {
            version: 1,
            ops: [
              { op: "setLayoutType", layoutType: "reception" },
              { op: "addItems", items: [{ componentId: "lounge-chair", count: 6, zoneRole: "perimeter" }] },
            ],
          },
        ),
      ],
    },
  ];
}

function buildApplyCountDensityScenarios(): PlannerSimulationScenarioDefinition[] {
  const general = buildPresetSpec("general_session", "theater", 120);
  const banquet = buildPresetSpec("banquet_remarks", "banquet", 160, [
    { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
  ]);
  const asymmetricReception = buildPresetSpec("networking_reception", "reception", 120, [
    { componentId: "fnb-portable-bar", count: 1, zoneRole: "rear" },
    { componentId: "booth-10x10", count: 1, zoneRole: "perimeter" },
  ]);

  return [
    {
      id: "apply-count-increase-200",
      label: "Apply count: increase to 200",
      tags: ["counts"],
      steps: [
        baseStep("generate", "Generate base", "Generate a general session for 120 attendees.", general, standardGenerateExpectations(general)),
        applyStep("increase", "Increase attendee count to 200", "Increase attendee count to 200.", {
          attendeeTarget: 200,
          expectedApplyPaths: ["patch"],
          noNoOp: true,
        }),
      ],
    },
    {
      id: "apply-count-reduce-80",
      label: "Apply count: reduce to 80",
      tags: ["counts"],
      steps: [
        baseStep("generate", "Generate base", "Generate a general session for 140 attendees.", { ...general, attendeeTarget: 140, audience: { ...general.audience, requiredPrimaryComponents: 10 } }, {
          ...standardGenerateExpectations({ ...general, attendeeTarget: 140, audience: { ...general.audience, requiredPrimaryComponents: 10 } }),
        }),
        applyStep("reduce", "Reduce attendee count to 80", "Reduce attendee count to 80.", {
          attendeeTarget: 80,
          expectedApplyPaths: ["patch"],
          noNoOp: true,
        }),
      ],
    },
    {
      id: "apply-density-space-tables",
      label: "Apply density: space tables out",
      tags: ["counts", "seating"],
      steps: [
        baseStep("generate", "Generate banquet", "Generate banquet with remarks for 160 attendees.", banquet, standardGenerateExpectations(banquet)),
        applyStep("space-out", "Space tables out more", "Spread the tables out more.", {
          attendeeUnchanged: true,
          expectedApplyPaths: ["patch"],
          noNoOp: true,
        }),
      ],
    },
    {
      id: "apply-density-tighter",
      label: "Apply density: tighter room",
      tags: ["counts", "seating"],
      steps: [
        baseStep("generate", "Generate banquet", "Generate banquet with remarks for 160 attendees.", banquet, standardGenerateExpectations(banquet)),
        applyStep("tighter", "Make the room tighter", "Pack it tighter.", {
          attendeeUnchanged: true,
          expectedApplyPaths: ["patch"],
          noNoOp: true,
        }),
      ],
    },
    {
      id: "apply-density-cleaner-symmetry",
      label: "Apply density: cleaner symmetry",
      tags: ["counts", "support"],
      steps: [
        baseStep("generate", "Generate asymmetric reception", "Generate a networking reception for 120 attendees.", asymmetricReception, standardGenerateExpectations(asymmetricReception)),
        applyStep("symmetry", "Create cleaner symmetry", "Create cleaner symmetry.", {
          attendeeUnchanged: true,
          expectedApplyPaths: ["spatial"],
          noNoOp: true,
        }),
      ],
    },
  ];
}

function buildApplySupportScenarios(): PlannerSimulationScenarioDefinition[] {
  const base = buildPresetSpec("general_session", "theater", 160, [
    { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
    { componentId: "registration-desk", count: 1, zoneRole: "rear" },
  ]);
  const withBars: LayoutSpec = {
    ...base,
    secondary: [
      ...base.secondary,
      { componentId: "fnb-portable-bar", count: 2, zoneRole: "rear" },
    ],
  };

  return [
    {
      id: "apply-support-add-bars",
      label: "Apply support: add 2 beverage bars",
      tags: ["support"],
      steps: [
        baseStep("generate", "Generate base", "Generate a general session for 160 attendees.", base, standardGenerateExpectations(base)),
        applyStep("bars", "Add 2 beverage bars", "Add 2 beverage bars.", {
          attendeeUnchanged: true,
          requiredComponents: ["fnb-portable-bar"],
          distributedComponents: ["fnb-portable-bar"],
          expectedApplyPaths: ["patch"],
        }),
      ],
    },
    {
      id: "apply-support-add-buffet",
      label: "Apply support: add buffet stations",
      tags: ["support"],
      steps: [
        baseStep("generate", "Generate base", "Generate a general session for 160 attendees.", buildPresetSpec("general_session", "theater", 160), standardGenerateExpectations(buildPresetSpec("general_session", "theater", 160))),
        applyStep("buffet", "Add buffet stations", "Add buffet stations.", {
          attendeeUnchanged: true,
          requiredComponents: ["fnb-buffet-line"],
          expectedApplyPaths: ["patch"],
        }),
      ],
    },
    {
      id: "apply-support-add-coffee",
      label: "Apply support: add coffee stations",
      tags: ["support"],
      steps: [
        baseStep("generate", "Generate base", "Generate a general session for 160 attendees.", base, standardGenerateExpectations(base)),
        applyStep("coffee", "Add coffee stations", "Add coffee stations.", {
          attendeeUnchanged: true,
          requiredComponents: ["fnb-coffee-station"],
          expectedApplyPaths: ["patch"],
        }),
      ],
    },
    {
      id: "apply-support-add-registration",
      label: "Apply support: add registration check-in",
      tags: ["support"],
      steps: [
        baseStep("generate", "Generate base", "Generate a general session for 160 attendees.", buildPresetSpec("general_session", "theater", 160), standardGenerateExpectations(buildPresetSpec("general_session", "theater", 160))),
        applyStep("registration", "Add registration check-in", "Add registration check-in.", {
          attendeeUnchanged: true,
          requiredComponents: ["registration-desk"],
          expectedApplyPaths: ["patch"],
        }),
      ],
    },
    {
      id: "apply-support-move-buffet-back-wall",
      label: "Apply support: move buffet to back wall",
      tags: ["support"],
      steps: [
        baseStep("generate", "Generate base", "Generate a general session for 160 attendees.", base, standardGenerateExpectations(base)),
        applyStep("move-buffet", "Move buffet to the back wall", "Move buffet to the back wall.", {
          attendeeUnchanged: true,
          requiredComponents: ["fnb-buffet-line"],
          expectedApplyPaths: ["spatial"],
        }),
      ],
    },
    {
      id: "apply-support-bars-opposite-sides",
      label: "Apply support: put bars on opposite sides",
      tags: ["support"],
      steps: [
        baseStep("generate", "Generate base with bars", "Generate a general session for 160 attendees with bar service.", withBars, {
          ...standardGenerateExpectations(withBars),
          requiredComponents: ["fnb-portable-bar"],
          distributedComponents: ["fnb-portable-bar"],
        }),
        applyStep("opposite-bars", "Put bars on opposite sides", "Put bars on opposite sides.", {
          attendeeUnchanged: true,
          requiredComponents: ["fnb-portable-bar"],
          distributedComponents: ["fnb-portable-bar"],
        }),
      ],
    },
    {
      id: "apply-support-lounge-chairs-by-each-bar",
      label: "Apply support: add lounge chairs by each bar",
      tags: ["support"],
      steps: [
        baseStep("generate", "Generate base with bars", "Generate a general session for 160 attendees with bar service.", withBars, {
          ...standardGenerateExpectations(withBars),
          requiredComponents: ["fnb-portable-bar"],
          distributedComponents: ["fnb-portable-bar"],
        }),
        applyStep("lounge-by-bars", "Add lounge chairs by each bar", "Add 2 lounge chairs by each bar.", {
          attendeeUnchanged: true,
          requiredComponents: ["fnb-portable-bar", "lounge-chair"],
          distributedComponents: ["fnb-portable-bar"],
          expectedApplyPaths: ["patch"],
        }),
      ],
    },
  ];
}

function buildChainedWorkflowScenarios(): PlannerSimulationScenarioDefinition[] {
  const training = buildPresetSpec("training_session", "classroom", 150, [
    { componentId: "fnb-coffee-station", count: 1, zoneRole: "rear" },
    { componentId: "registration-desk", count: 1, zoneRole: "rear" },
  ]);
  const banquet = buildPresetSpec("banquet_remarks", "banquet", 200, [
    { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
    { componentId: "fnb-portable-bar", count: 2, zoneRole: "rear" },
    { componentId: "registration-desk", count: 1, zoneRole: "rear" },
  ]);

  return [
    {
      id: "chain-training-workflow",
      label: "Chained training workflow",
      tags: ["chains", "seating", "support", "counts"],
      steps: [
        baseStep("generate", "Generate training for 150", "Generate training session for 150 attendees.", training, standardGenerateExpectations(training)),
        applyStep("rounds", "Apply round tables", "Change the seating style to round tables.", {
          layoutType: "banquet",
          primaryComponentId: "table-round-60",
          attendeeUnchanged: true,
          frontPreserved: true,
          supportPreserved: true,
          expectedApplyPaths: ["patch"],
        }),
        applyStep("bars", "Apply add 2 beverage bars", "Add 2 beverage bars.", {
          attendeeUnchanged: true,
          requiredComponents: ["fnb-portable-bar"],
          distributedComponents: ["fnb-portable-bar"],
          supportPreserved: true,
          expectedApplyPaths: ["patch"],
        }),
        applyStep("coffee-back", "Apply move coffee to back", "Move coffee stations to the back wall.", {
          attendeeUnchanged: true,
          requiredComponents: ["fnb-coffee-station"],
          supportPreserved: true,
        }),
        applyStep("increase", "Apply increase to 180", "Increase attendee count to 180.", {
          attendeeTarget: 180,
          supportPreserved: true,
          expectedApplyPaths: ["patch"],
        }),
      ],
    },
    {
      id: "chain-banquet-workflow",
      label: "Chained banquet workflow",
      tags: ["chains", "support", "counts"],
      steps: [
        baseStep("generate", "Generate banquet with F&B", "Generate banquet with remarks for 200 with buffet, bar, and registration.", banquet, {
          ...standardGenerateExpectations(banquet),
          requiredComponents: ["fnb-buffet-line", "fnb-portable-bar", "registration-desk"],
          distributedComponents: ["fnb-portable-bar"],
        }),
        applyStep("space-out", "Apply space tables out", "Spread the tables out more.", {
          attendeeUnchanged: true,
          expectedApplyPaths: ["patch"],
          noNoOp: true,
          supportPreserved: true,
        }),
        applyStep("bars-opposite", "Apply put bars on opposite sides", "Put bars on opposite sides.", {
          attendeeUnchanged: true,
          requiredComponents: ["fnb-portable-bar"],
          distributedComponents: ["fnb-portable-bar"],
          supportPreserved: true,
        }),
        applyStep("sponsor", "Apply add sponsor visibility", "Add sponsor visibility areas.", {
          attendeeUnchanged: true,
          requiredComponents: ["booth-10x10"],
          supportPreserved: true,
          expectedApplyPaths: ["patch"],
        }, {
          version: 1,
          ops: [{ op: "addItems", items: [{ componentId: "booth-10x10", count: 2, zoneRole: "perimeter" }] }],
        }),
        applyStep("registration-entrance", "Apply move registration near entrance", "Move registration near entrance.", {
          attendeeUnchanged: true,
          requiredComponents: ["registration-desk"],
          supportPreserved: true,
        }),
      ],
    },
  ];
}

function buildStaggeredRegressionScenarios(): PlannerSimulationScenarioDefinition[] {
  const front: LayoutSpec["front"] = {
    screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
    stage: { componentId: "stage-keynote", count: 1, zoneRole: "front" },
    av: [{ componentId: "av-speaker-stack", count: 2, zoneRole: "front" }],
  };
  const aligned = buildLayoutSpec({
    eventIntent: "banquet_remarks",
    layoutType: "banquet",
    attendees: 250,
    densityPreference: "premium",
    audienceStyle: "grid",
    front,
  });
  const staggered: LayoutSpec = {
    ...aligned,
    audienceStyle: "loose",
  };

  return [
    {
      id: "staggered-high-capacity-stage-side-regression",
      label: "Staggered regression: high-capacity stage-side use",
      tags: ["seating", "presets"],
      steps: [
        {
          id: "aligned",
          label: "Generate aligned reference",
          kind: "generate",
          prompt: "Generate banquet with remarks for 250 attendees using aligned rows.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: aligned,
          expectations: {
            ...standardGenerateExpectations(aligned),
            audienceStyle: "grid",
          },
        },
        {
          id: "staggered",
          label: "Generate staggered stage-side layout",
          kind: "generate",
          prompt: "Generate banquet with remarks for 250 attendees using Staggered layout style.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: staggered,
          expectations: {
            ...standardGenerateExpectations(staggered),
            audienceStyle: "loose",
            primaryStageSideRegions: "both",
            primaryFootprintMinWidth: 88,
            primaryFootprintMinDepth: 32,
            primaryFootprintWiderThanBefore: true,
            primaryFootprintDepthAtLeastBefore: true,
            primaryMinRowOffsetSpread: 3,
          },
        },
      ],
    },
  ];
}

function buildGeneralSessionStyleAuditScenarios(): PlannerSimulationScenarioDefinition[] {
  const prompt = "General session for 225, light presentation, no giant keynote stage.";
  const baseSpec = buildGeneralSessionSpec(200);
  const rows: readonly Readonly<{
    id: string;
    label: string;
    audienceStyle: LayoutSpec["audienceStyle"];
  }>[] = [
    { id: "auto", label: "Style Auto", audienceStyle: "grid" },
    { id: "rows", label: "Style Rows", audienceStyle: "grid" },
    { id: "center-aisle", label: "Style Center aisle", audienceStyle: "scattered" },
    { id: "chevron", label: "Style Chevron", audienceStyle: "loose" },
  ];

  return rows.map((row) => {
    const spec: LayoutSpec = {
      ...baseSpec,
      audienceStyle: row.audienceStyle,
    };
    return {
      id: `general-session-style-audit-${row.id}`,
      label: `General Session style audit: ${row.label}`,
      tags: ["general-session-style-audit"],
      steps: [
        {
          id: "generate",
          label: `General Session, 200 attendees, 120x72 room, ${row.label}`,
          kind: "generate",
          prompt,
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec,
          expectations: {
            layoutType: "theater",
            primaryComponentId: "seating-theater-row",
            attendeeTarget: 200,
            capacityMinRatio: 0.95,
            capacityMaxRatio: 1.35,
          },
        },
      ],
    };
  });
}

export function buildDefaultPlannerSimulationScenarios(): readonly PlannerSimulationScenarioDefinition[] {
  return [
    ...buildPresetGenerateScenarios(),
    ...buildModifierGenerateScenarios(),
    ...buildPromptOverrideScenarios(),
    ...buildApplySeatingScenarios(),
    ...buildApplyCountDensityScenarios(),
    ...buildApplySupportScenarios(),
    ...buildChainedWorkflowScenarios(),
    ...buildStaggeredRegressionScenarios(),
    ...buildGeneralSessionStyleAuditScenarios(),
    {
      id: "generate-general-session-200",
      label: "200-person general session",
      tags: ["legacy", "presets"],
      steps: [
        {
          id: "generate",
          label: "Generate 200-person general session",
          kind: "generate",
          prompt: "Create a general session for 200 people.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: buildGeneralSessionSpec(200),
          expectations: {
            layoutType: "theater",
            primaryComponentId: "seating-theater-row",
            attendeeTarget: 200,
            capacityMinRatio: 0.95,
            capacityMaxRatio: 1.35,
          },
        },
      ],
    },
    {
      id: "apply-split-audience-banks",
      label: "Split audience into two banks",
      steps: [
        {
          id: "generate",
          label: "Generate base general session",
          kind: "generate",
          prompt: "Create a general session for 200 people.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: buildGeneralSessionSpec(200),
        },
        {
          id: "apply",
          label: "Split audience into two banks",
          kind: "apply",
          prompt: "Split audience into two banks.",
        },
      ],
    },
    {
      id: "apply-add-two-bars",
      label: "Add 2 beverage bars",
      steps: [
        {
          id: "generate",
          label: "Generate base general session",
          kind: "generate",
          prompt: "Create a general session for 200 people.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: buildGeneralSessionSpec(200),
        },
        {
          id: "apply",
          label: "Add 2 beverage bars",
          kind: "apply",
          prompt: "Add 2 beverage bars.",
        },
      ],
    },
    {
      id: "apply-move-buffet-perimeter",
      label: "Move buffet to perimeter",
      steps: [
        {
          id: "generate",
          label: "Generate base general session",
          kind: "generate",
          prompt: "Create a general session for 200 people.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: buildGeneralSessionSpec(200),
        },
        {
          id: "apply",
          label: "Move buffet to perimeter",
          kind: "apply",
          prompt: "Move buffet to perimeter.",
        },
      ],
    },
    {
      id: "apply-cleaner-symmetry",
      label: "Create cleaner symmetry",
      steps: [
        {
          id: "generate",
          label: "Generate base general session",
          kind: "generate",
          prompt: "Create a general session for 200 people.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: buildGeneralSessionSpec(200),
        },
        {
          id: "apply",
          label: "Create cleaner symmetry",
          kind: "apply",
          prompt: "Create cleaner symmetry.",
        },
      ],
    },
    {
      id: "apply-preserve-center-aisle",
      label: "Preserve center aisle",
      steps: [
        {
          id: "generate",
          label: "Generate base general session",
          kind: "generate",
          prompt: "Create a general session for 200 people.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: buildGeneralSessionSpec(200),
        },
        {
          id: "apply",
          label: "Preserve center aisle",
          kind: "apply",
          prompt: "Preserve center aisle.",
        },
      ],
    },
    {
      id: "apply-networking-lounge-perimeter",
      label: "Create networking lounge near perimeter",
      steps: [
        {
          id: "generate",
          label: "Generate lounge-seeded general session",
          kind: "generate",
          prompt: "Create a general session for 200 people.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: buildGeneralSessionWithLoungeSeed(200),
        },
        {
          id: "apply",
          label: "Create networking lounge near perimeter",
          kind: "apply",
          prompt: "Create networking lounge near perimeter.",
        },
      ],
    },
    {
      id: "apply-tighten-seating-sightlines",
      label: "Tighten seating while preserving stage sightlines",
      steps: [
        {
          id: "generate",
          label: "Generate base general session",
          kind: "generate",
          prompt: "Create a general session for 200 people.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: buildGeneralSessionSpec(200),
        },
        {
          id: "apply",
          label: "Tighten seating while preserving stage sightlines",
          kind: "apply",
          prompt: "Tighten seating while preserving stage sightlines.",
        },
      ],
    },
    {
      id: "chain-general-session-regression",
      label: "Chained generate -> apply -> apply -> apply",
      steps: [
        {
          id: "generate",
          label: "Generate 200-person general session",
          kind: "generate",
          prompt: "Create a general session for 200 people.",
          roomWidthLu: 120,
          roomDepthLu: 72,
          spec: buildGeneralSessionSpec(200),
        },
        {
          id: "split-banks",
          label: "Split audience into two banks",
          kind: "apply",
          prompt: "Split audience into two banks.",
        },
        {
          id: "add-bars",
          label: "Add 2 beverage bars",
          kind: "apply",
          prompt: "Add 2 beverage bars.",
        },
        {
          id: "move-buffet",
          label: "Move buffet to perimeter",
          kind: "apply",
          prompt: "Move buffet to perimeter.",
        },
        {
          id: "center-aisle",
          label: "Preserve center aisle",
          kind: "apply",
          prompt: "Preserve center aisle.",
        },
      ],
    },
  ];
}
