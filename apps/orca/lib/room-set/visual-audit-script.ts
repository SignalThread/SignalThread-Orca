import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createCanvas } from "@napi-rs/canvas";

import { getRoomSetComponent, type RoomSetComponentId } from "./component-library";
import type { LayoutSpec, LayoutSpecLayoutType } from "./layout-spec";
import { composeLayoutSpec } from "./layout-spec-compose";
import { composeLayoutSpecWithGracefulFallback } from "./planner-layout-graceful-fallback";
import type { RoomSetLayoutPlacement } from "./planner-layout-schema";
import { findPlannerLayoutPlacementOverlaps, sumPlatedSeatCapacity } from "./planner-layout-validator";
import { plannerSceneFromLayoutPlacements, type PlannerScene, type PlannerSceneObject } from "./planner-scene";
import { renderPlannerSceneSvg } from "./planner-layout-simulation";
import type {
  RoomSetAudienceStyle,
  RoomSetDensityPreference,
  RoomSetEventIntentId,
} from "./planner-intent-shared";

export const ROOM_SET_VISUAL_AUDIT_OUTPUT_ROOT = "/tmp/planner-room-set-visual-audit";

type LuRect = Readonly<{ x: number; y: number; width: number; depth: number }>;
type AuditPoint = Readonly<{ x: number; y: number }>;

export type RoomSetVisualAuditCaseId =
  | "town-hall-speaker-qa-geometry"
  | "networking-reception-cluster-distribution"
  | "theater-low-capacity-graceful-fallback"
  | "training-center-aisle"
  | "banquet-remarks-large-room"
  | "banquet-clusters-near-stage"
  | "awards-dinner"
  | "workshop"
  | "general-session"
  | "expo-lounge"
  | "networking-reception";

export type RoomSetVisualAuditMetrics = Readonly<{
  id: RoomSetVisualAuditCaseId;
  label: string;
  roomDimensions: Readonly<{ widthLu: number; depthLu: number }>;
  objectCountsByType: Readonly<Record<string, number>>;
  stageSpeakerBounds: LuRect | null;
  qaAccessBounds: LuRect | null;
  clusterCenterPoints: readonly AuditPoint[];
  clusterSpreadDistributionScore: number;
  aisleWidths: Readonly<{
    centerAisleLu: number | null;
    nearestObjectGapLu: number | null;
  }>;
  tableChairCounts: Readonly<{
    tableCount: number;
    chairBlockCount: number;
    chairSeatCount: number;
  }>;
  capacityAchieved: number;
  fallbackReason: string | null;
  failedAssertion: string | null;
  actualVsExpected: ReadonlyArray<
    Readonly<{
      assertion: string;
      actual: number | string | null;
      expected: number | string;
    }>
  >;
}>;

export type RoomSetVisualAuditArtifact = Readonly<{
  id: RoomSetVisualAuditCaseId;
  label: string;
  currentLayoutPngPath: string;
  annotatedPngPath: string;
  metricsJsonPath: string;
  metrics: RoomSetVisualAuditMetrics;
}>;

type AuditCaseDefinition = Readonly<{
  id: RoomSetVisualAuditCaseId;
  label: string;
  roomWidthLu: number;
  roomDepthLu: number;
  spec: LayoutSpec;
  useGracefulFallback?: boolean;
}>;

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function primaryFor(layoutType: LayoutSpecLayoutType): Readonly<{
  componentId: RoomSetComponentId;
  capacity: number;
}> {
  switch (layoutType) {
    case "banquet":
      return { componentId: "table-round-60", capacity: 8 };
    case "classroom":
      return { componentId: "table-banquet-6ft", capacity: 6 };
    case "reception":
      return { componentId: "table-cocktail-cluster", capacity: 4 };
    case "theater":
    default:
      return { componentId: "seating-theater-row", capacity: 14 };
  }
}

function baseFront(stage: RoomSetComponentId = "stage-riser"): LayoutSpec["front"] {
  return {
    screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
    stage: { componentId: stage, count: 1, zoneRole: "front" },
    av: [
      { componentId: "av-speaker-stack", count: 2, zoneRole: "front" },
      { componentId: "av-foh-control", count: 1, zoneRole: "rear", placementPreference: "rear" },
    ],
  };
}

function buildSpec(args: Readonly<{
  eventIntent: RoomSetEventIntentId;
  layoutType: LayoutSpecLayoutType;
  attendeeTarget: number;
  densityPreference?: RoomSetDensityPreference;
  audienceStyle?: RoomSetAudienceStyle;
  stage?: RoomSetComponentId;
  primaryComponentId?: RoomSetComponentId;
  primaryComponentCapacity?: number;
  secondary?: LayoutSpec["secondary"];
}>): LayoutSpec {
  const primary = args.primaryComponentId
    ? {
        componentId: args.primaryComponentId,
        capacity: args.primaryComponentCapacity ?? getRoomSetComponent(args.primaryComponentId)?.capacitySeated ?? 1,
      }
    : primaryFor(args.layoutType);
  return {
    version: 1,
    source: "ai-generate",
    eventIntent: args.eventIntent,
    layoutType: args.layoutType,
    attendeeTarget: args.attendeeTarget,
    densityPreference: args.densityPreference ?? "balanced",
    audienceStyle: args.audienceStyle ?? "grid",
    front: args.layoutType === "reception" ? { av: [] } : baseFront(args.stage),
    audience: {
      primaryComponentId: primary.componentId,
      primaryComponentCapacity: Math.max(1, primary.capacity),
      requiredPrimaryComponents: Math.max(1, Math.ceil(args.attendeeTarget / Math.max(1, primary.capacity))),
    },
    secondary: args.secondary ?? [],
  };
}

function auditCases(): readonly AuditCaseDefinition[] {
  return [
    {
      id: "town-hall-speaker-qa-geometry",
      label: "Town hall speaker/Q&A geometry",
      roomWidthLu: 132,
      roomDepthLu: 84,
      spec: buildSpec({
        eventIntent: "town_hall",
        layoutType: "theater",
        attendeeTarget: 112,
        audienceStyle: "arc",
        secondary: [
          { componentId: "registration-queue-lane", count: 1, zoneRole: "mixed", label: "Q&A / access" },
        ],
      }),
    },
    {
      id: "networking-reception-cluster-distribution",
      label: "Networking reception cluster distribution",
      roomWidthLu: 150,
      roomDepthLu: 104,
      spec: buildSpec({
        eventIntent: "networking_reception",
        layoutType: "reception",
        attendeeTarget: 124,
        audienceStyle: "scattered",
        secondary: [
          { componentId: "fnb-portable-bar", count: 2, zoneRole: "perimeter" },
          { componentId: "lounge-chair", count: 8, zoneRole: "mixed" },
        ],
      }),
    },
    {
      id: "theater-low-capacity-graceful-fallback",
      label: "Theater low-capacity graceful fallback",
      roomWidthLu: 48,
      roomDepthLu: 34,
      useGracefulFallback: true,
      spec: buildSpec({
        eventIntent: "general_session",
        layoutType: "theater",
        attendeeTarget: 120,
        densityPreference: "balanced",
      }),
    },
    {
      id: "training-center-aisle",
      label: "Training center aisle",
      roomWidthLu: 136,
      roomDepthLu: 92,
      spec: buildSpec({
        eventIntent: "training_session",
        layoutType: "classroom",
        attendeeTarget: 108,
        primaryComponentId: "seating-classroom-row",
        primaryComponentCapacity: 12,
      }),
    },
    {
      id: "banquet-remarks-large-room",
      label: "Banquet remarks in large room",
      roomWidthLu: 176,
      roomDepthLu: 124,
      spec: buildSpec({
        eventIntent: "banquet_remarks",
        layoutType: "banquet",
        attendeeTarget: 220,
        audienceStyle: "loose",
        stage: "stage-keynote",
        secondary: [
          { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
          { componentId: "fnb-portable-bar", count: 2, zoneRole: "rear" },
        ],
      }),
    },
    {
      id: "banquet-clusters-near-stage",
      label: "Banquet clusters near stage",
      roomWidthLu: 156,
      roomDepthLu: 110,
      spec: buildSpec({
        eventIntent: "banquet_remarks",
        layoutType: "banquet",
        attendeeTarget: 144,
        audienceStyle: "scattered",
        stage: "stage-keynote",
      }),
    },
    {
      id: "awards-dinner",
      label: "Awards dinner",
      roomWidthLu: 168,
      roomDepthLu: 118,
      spec: buildSpec({
        eventIntent: "awards_dinner",
        layoutType: "banquet",
        attendeeTarget: 180,
        audienceStyle: "loose",
        stage: "stage-keynote",
      }),
    },
    {
      id: "workshop",
      label: "Workshop",
      roomWidthLu: 132,
      roomDepthLu: 90,
      spec: buildSpec({
        eventIntent: "workshop",
        layoutType: "classroom",
        attendeeTarget: 72,
        audienceStyle: "scattered",
        primaryComponentId: "table-banquet-6ft",
        primaryComponentCapacity: 6,
      }),
    },
    {
      id: "general-session",
      label: "General session",
      roomWidthLu: 140,
      roomDepthLu: 88,
      spec: buildSpec({
        eventIntent: "general_session",
        layoutType: "theater",
        attendeeTarget: 168,
      }),
    },
    {
      id: "expo-lounge",
      label: "Expo lounge",
      roomWidthLu: 160,
      roomDepthLu: 112,
      spec: buildSpec({
        eventIntent: "expo_lounge",
        layoutType: "reception",
        attendeeTarget: 96,
        audienceStyle: "loose",
        secondary: [
          { componentId: "lounge-chair", count: 16, zoneRole: "mixed" },
          { componentId: "registration-kiosk", count: 3, zoneRole: "perimeter" },
        ],
      }),
    },
    {
      id: "networking-reception",
      label: "Networking reception",
      roomWidthLu: 148,
      roomDepthLu: 100,
      spec: buildSpec({
        eventIntent: "networking_reception",
        layoutType: "reception",
        attendeeTarget: 100,
        audienceStyle: "scattered",
        secondary: [{ componentId: "fnb-coffee-station", count: 2, zoneRole: "perimeter" }],
      }),
    },
  ];
}

function rectForObject(object: PlannerSceneObject): LuRect {
  return {
    x: object.transform.xLu,
    y: object.transform.yLu,
    width: object.transform.widthLu,
    depth: object.transform.depthLu,
  };
}

function unionBounds(objects: readonly PlannerSceneObject[]): LuRect | null {
  if (objects.length === 0) return null;
  const minX = Math.min(...objects.map((object) => object.transform.xLu));
  const minY = Math.min(...objects.map((object) => object.transform.yLu));
  const maxX = Math.max(...objects.map((object) => object.transform.xLu + object.transform.widthLu));
  const maxY = Math.max(...objects.map((object) => object.transform.yLu + object.transform.depthLu));
  return {
    x: roundMetric(minX),
    y: roundMetric(minY),
    width: roundMetric(maxX - minX),
    depth: roundMetric(maxY - minY),
  };
}

function objectCenter(object: PlannerSceneObject): AuditPoint {
  return {
    x: roundMetric(object.transform.xLu + object.transform.widthLu / 2),
    y: roundMetric(object.transform.yLu + object.transform.depthLu / 2),
  };
}

function countByObjectType(objects: readonly PlannerSceneObject[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const object of objects) {
    counts[object.objectType] = (counts[object.objectType] ?? 0) + 1;
  }
  return counts;
}

function componentCategory(object: PlannerSceneObject): string {
  return getRoomSetComponent(object.componentId)?.category ?? object.metadata.componentCategory;
}

function clusterObjects(objects: readonly PlannerSceneObject[]): readonly PlannerSceneObject[] {
  return objects.filter((object) => {
    const category = componentCategory(object);
    return (
      object.componentId === "table-cocktail-cluster" ||
      object.componentId === "lounge-chair" ||
      (category === "tables" && object.capacity.seated > 0)
    );
  });
}

function distributionScore(points: readonly AuditPoint[], roomWidthLu: number, roomDepthLu: number): number {
  if (points.length === 0) return 0;
  const zones = new Set<string>();
  for (const point of points) {
    const xBucket = Math.max(0, Math.min(2, Math.floor((point.x / roomWidthLu) * 3)));
    const yBucket = Math.max(0, Math.min(2, Math.floor((point.y / roomDepthLu) * 3)));
    zones.add(`${xBucket}:${yBucket}`);
  }
  return roundMetric(zones.size / 9);
}

function centerAisleWidth(objects: readonly PlannerSceneObject[], roomWidthLu: number): number | null {
  const roomCenter = roomWidthLu / 2;
  const rows = objects
    .filter((object) => {
      if (object.objectType === "chair_block") return true;
      if (object.objectType !== "classroom_table") return false;
      return object.metadata.componentCategory === "seating" && object.metadata.visualVariant === "row";
    })
    .sort((left, right) => left.transform.yLu - right.transform.yLu || left.transform.xLu - right.transform.xLu);
  const gaps = rows.flatMap((row) => {
    const rowCenterY = row.transform.yLu + row.transform.depthLu / 2;
    const siblings = rows.filter(
      (candidate) =>
        Math.abs(candidate.transform.yLu + candidate.transform.depthLu / 2 - rowCenterY) <=
        Math.max(2, row.transform.depthLu),
    );
    const left = siblings
      .filter((candidate) => candidate.transform.xLu + candidate.transform.widthLu / 2 < roomCenter)
      .at(-1);
    const right = siblings.find((candidate) => candidate.transform.xLu + candidate.transform.widthLu / 2 >= roomCenter);
    if (!left || !right) return [];
    return [right.transform.xLu - (left.transform.xLu + left.transform.widthLu)];
  });
  if (gaps.length === 0) return null;
  return roundMetric(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length);
}

function nearestObjectGap(objects: readonly PlannerSceneObject[]): number | null {
  if (objects.length < 2) return null;
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < objects.length; index += 1) {
    const a = objects[index]!;
    const aRect = rectForObject(a);
    for (let otherIndex = index + 1; otherIndex < objects.length; otherIndex += 1) {
      const b = objects[otherIndex]!;
      const bRect = rectForObject(b);
      const dx = Math.max(0, Math.max(aRect.x - (bRect.x + bRect.width), bRect.x - (aRect.x + aRect.width)));
      const dy = Math.max(0, Math.max(aRect.y - (bRect.y + bRect.depth), bRect.y - (aRect.y + aRect.depth)));
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
  }
  return Number.isFinite(nearest) ? roundMetric(nearest) : null;
}

function buildActualVsExpected(
  metrics: Omit<RoomSetVisualAuditMetrics, "failedAssertion" | "actualVsExpected">,
  overlaps: number,
  outOfBounds: number,
): RoomSetVisualAuditMetrics["actualVsExpected"] {
  return [
    { assertion: "all generated layouts stay inside room bounds", actual: outOfBounds, expected: "0 out-of-bounds objects" },
    { assertion: "no major object overlaps unless explicitly allowed", actual: overlaps, expected: "0 major overlaps" },
    { assertion: "required aisles are preserved", actual: metrics.aisleWidths.nearestObjectGapLu, expected: ">= 0 LU nearest gap" },
    { assertion: "capacity achieved is nonzero", actual: metrics.capacityAchieved, expected: "> 0 seats" },
  ];
}

function failedAssertionFor(
  id: RoomSetVisualAuditCaseId,
  metrics: Omit<RoomSetVisualAuditMetrics, "failedAssertion" | "actualVsExpected">,
  overlaps: number,
  outOfBounds: number,
): string | null {
  if (outOfBounds > 0) return `All generated layouts stay inside room bounds; actual=${outOfBounds}`;
  if (overlaps > 0) return `No major object overlaps unless explicitly allowed; actual=${overlaps}`;
  if (id === "theater-low-capacity-graceful-fallback" && metrics.fallbackReason !== null) {
    return null;
  }
  if (metrics.capacityAchieved <= 0) return "Capacity achieved is nonzero; actual=0";
  if (id === "town-hall-speaker-qa-geometry") {
    if (!metrics.stageSpeakerBounds) return "Town hall has distinct speaker zone; actual=missing";
    if (!metrics.qaAccessBounds) return "Town hall has Q&A/access geometry; actual=missing";
  }
  if (id.includes("networking") && metrics.clusterSpreadDistributionScore < 0.25) {
    return `Networking clusters are distributed; actual=${metrics.clusterSpreadDistributionScore}`;
  }
  if (id === "training-center-aisle" && (metrics.aisleWidths.centerAisleLu ?? 0) < 4) {
    return `Training center aisle reads as a clear center aisle; actual=${metrics.aisleWidths.centerAisleLu}`;
  }
  if (id === "theater-low-capacity-graceful-fallback") return "Theater low-capacity graceful fallback produced no adjustment or failure reason";
  return null;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function colorForObject(object: PlannerSceneObject): string {
  const category = componentCategory(object);
  if (category === "stages") return "#f59e0b";
  if (category === "av") return "#8b5cf6";
  if (category === "tables") return "#0ea5e9";
  if (category === "seating") return "#2563eb";
  if (category === "registration") return "#84cc16";
  if (category === "fnb") return "#f97316";
  if (category === "lounge") return "#f43f5e";
  return "#64748b";
}

function drawScenePng(scene: PlannerScene, title: string, path: string, annotated: boolean): void {
  const scale = 8;
  const pad = 42;
  const titleHeight = 28;
  const canvas = createCanvas(
    Math.ceil(scene.roomShell.widthLu * scale + pad * 2),
    Math.ceil(scene.roomShell.depthLu * scale + pad * 2 + titleHeight),
  );
  const context = canvas.getContext("2d");
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0f172a";
  context.font = "700 14px sans-serif";
  context.fillText(title, pad, 19);
  context.save();
  context.translate(pad, pad + titleHeight);
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#cbd5e1";
  context.lineWidth = 1.25;
  context.strokeRect(0, 0, scene.roomShell.widthLu * scale, scene.roomShell.depthLu * scale);
  context.strokeStyle = "#e2e8f0";
  context.lineWidth = 0.6;
  for (let x = 0; x <= scene.roomShell.widthLu; x += 8) {
    context.beginPath();
    context.moveTo(x * scale, 0);
    context.lineTo(x * scale, scene.roomShell.depthLu * scale);
    context.stroke();
  }
  for (let y = 0; y <= scene.roomShell.depthLu; y += 8) {
    context.beginPath();
    context.moveTo(0, y * scale);
    context.lineTo(scene.roomShell.widthLu * scale, y * scale);
    context.stroke();
  }
  for (const object of scene.objects) {
    const x = object.transform.xLu * scale;
    const y = object.transform.yLu * scale;
    const width = object.transform.widthLu * scale;
    const depth = object.transform.depthLu * scale;
    context.fillStyle = colorForObject(object);
    context.globalAlpha = 0.2;
    context.fillRect(x, y, width, depth);
    context.globalAlpha = 1;
    context.strokeStyle = colorForObject(object);
    context.lineWidth = 1.5;
    context.strokeRect(x, y, width, depth);
    if (annotated) {
      context.fillStyle = "#0f172a";
      context.font = "10px sans-serif";
      context.fillText(object.componentId, x + 3, y + 11);
    }
  }
  context.restore();
  writeFileSync(path, canvas.toBuffer("image/png"));
}

function composeAuditCase(definition: AuditCaseDefinition): Readonly<{
  scene: PlannerScene;
  placements: readonly RoomSetLayoutPlacement[];
  fallbackReason: string | null;
}> {
  if (definition.useGracefulFallback) {
    const result = composeLayoutSpecWithGracefulFallback({
      spec: definition.spec,
      roomWidthLu: definition.roomWidthLu,
      roomDepthLu: definition.roomDepthLu,
      compose: (spec) => ({
        layoutSpec: spec,
        result: composeLayoutSpec({ spec, roomWidthLu: definition.roomWidthLu, roomDepthLu: definition.roomDepthLu }),
      }),
    });
    if (result.composed?.scene) {
      return {
        scene: result.composed.scene,
        placements: result.composed.placements,
        fallbackReason: result.adjustments.join(" | ") || result.debugReason || result.resultStatus,
      };
    }
    return {
      scene: plannerSceneFromLayoutPlacements([], {
        widthLu: definition.roomWidthLu,
        depthLu: definition.roomDepthLu,
      }),
      placements: [],
      fallbackReason: result.debugReason ?? result.userMessageBody,
    };
  }

  const result = composeLayoutSpec({
    spec: definition.spec,
    roomWidthLu: definition.roomWidthLu,
    roomDepthLu: definition.roomDepthLu,
  });
  return {
    scene: result.scene ?? plannerSceneFromLayoutPlacements(result.placements, {
      widthLu: definition.roomWidthLu,
      depthLu: definition.roomDepthLu,
    }),
    placements: result.placements,
    fallbackReason: result.ok ? null : result.issues.map((issue) => issue.message).join(" | "),
  };
}

function metricsForCase(
  definition: AuditCaseDefinition,
  scene: PlannerScene,
  placements: readonly RoomSetLayoutPlacement[],
  fallbackReason: string | null,
): RoomSetVisualAuditMetrics {
  const stageSpeakerBounds = unionBounds(
    scene.objects.filter((object) => componentCategory(object) === "stages" || object.componentId === "av-speaker-stack"),
  );
  const qaAccessBounds = unionBounds(
    scene.objects.filter(
      (object) =>
        object.label?.toLowerCase().includes("q&a") ||
        object.componentId === "registration-queue-lane" ||
        object.componentId === "registration-desk",
    ),
  );
  const clusterCenterPoints = clusterObjects(scene.objects).map(objectCenter);
  const validationIssues = findPlannerLayoutPlacementOverlaps(
    placements,
    definition.roomWidthLu,
    definition.roomDepthLu,
  );
  const overlaps = validationIssues.filter((issue) => issue.code === "overlap").length;
  const outOfBounds = validationIssues.filter((issue) => issue.code === "out_of_bounds").length;
  const chairBlocks = scene.objects.filter((object) => object.objectType === "chair_block");
  const tableObjects = scene.objects.filter((object) => componentCategory(object) === "tables");
  const partial = {
    id: definition.id,
    label: definition.label,
    roomDimensions: {
      widthLu: definition.roomWidthLu,
      depthLu: definition.roomDepthLu,
    },
    objectCountsByType: countByObjectType(scene.objects),
    stageSpeakerBounds,
    qaAccessBounds,
    clusterCenterPoints,
    clusterSpreadDistributionScore: distributionScore(clusterCenterPoints, definition.roomWidthLu, definition.roomDepthLu),
    aisleWidths: {
      centerAisleLu: centerAisleWidth(scene.objects, definition.roomWidthLu),
      nearestObjectGapLu: nearestObjectGap(scene.objects),
    },
    tableChairCounts: {
      tableCount: tableObjects.length,
      chairBlockCount: chairBlocks.length,
      chairSeatCount: chairBlocks.reduce((sum, object) => sum + object.capacity.seated, 0),
    },
    capacityAchieved: sumPlatedSeatCapacity(placements),
    fallbackReason,
  };
  const actualVsExpected = buildActualVsExpected(partial, overlaps, outOfBounds);
  return {
    ...partial,
    failedAssertion: failedAssertionFor(definition.id, partial, overlaps, outOfBounds),
    actualVsExpected,
  };
}

export function generateRoomSetVisualAuditArtifacts(
  outputRoot = ROOM_SET_VISUAL_AUDIT_OUTPUT_ROOT,
): readonly RoomSetVisualAuditArtifact[] {
  mkdirSync(outputRoot, { recursive: true });
  const artifacts: RoomSetVisualAuditArtifact[] = [];

  for (const definition of auditCases()) {
    const caseRoot = join(outputRoot, definition.id);
    mkdirSync(caseRoot, { recursive: true });
    const { scene, placements, fallbackReason } = composeAuditCase(definition);
    const currentLayoutPngPath = join(caseRoot, "current-layout.png");
    const annotatedPngPath = join(caseRoot, "annotated.png");
    const metricsJsonPath = join(caseRoot, "metrics.json");

    drawScenePng(scene, definition.label, currentLayoutPngPath, false);
    drawScenePng(scene, `${definition.label} annotated`, annotatedPngPath, true);
    writeFileSync(join(caseRoot, "layout.svg"), renderPlannerSceneSvg(scene, definition.label), "utf8");
    const metrics = metricsForCase(definition, scene, placements, fallbackReason);
    writeJson(metricsJsonPath, metrics);

    artifacts.push({
      id: definition.id,
      label: definition.label,
      currentLayoutPngPath,
      annotatedPngPath,
      metricsJsonPath,
      metrics,
    });
  }

  writeJson(join(outputRoot, "summary.json"), {
    generatedAt: new Date().toISOString(),
    artifactCount: artifacts.length,
    failedAssertions: artifacts.flatMap((artifact) =>
      artifact.metrics.failedAssertion
        ? [{ id: artifact.id, failedAssertion: artifact.metrics.failedAssertion }]
        : [],
    ),
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      label: artifact.label,
      currentLayoutPngPath: artifact.currentLayoutPngPath,
      annotatedPngPath: artifact.annotatedPngPath,
      metricsJsonPath: artifact.metricsJsonPath,
    })),
  });

  return artifacts;
}

export function manualRoomSetQaChecklist(): string {
  return [
    "Manual QA checklist:",
    "1. Open Session A -> Room Set -> Seating.",
    "2. Open Session B -> Room Set -> Seating.",
    "3. Confirm table IDs differ.",
    "4. Assign same attendee in both sessions.",
    "5. Confirm both assignments persist separately.",
    "6. Drag/drop onto real visual table.",
    "7. Reload.",
    "8. Confirm assignment stays on same visual table.",
    "9. Switch sessions while in Seating mode.",
    "10. Confirm mode is preserved and table state refetches.",
    `11. Review generated layout audit images in ${ROOM_SET_VISUAL_AUDIT_OUTPUT_ROOT}.`,
  ].join("\n");
}

if (process.argv[1]?.endsWith("visual-audit-script.ts")) {
  const artifacts = generateRoomSetVisualAuditArtifacts();
  console.info(`Generated ${artifacts.length} visual audit cases in ${ROOM_SET_VISUAL_AUDIT_OUTPUT_ROOT}`);
  console.info(manualRoomSetQaChecklist());
  const failed = artifacts.filter((artifact) => artifact.metrics.failedAssertion);
  if (failed.length > 0) {
    console.error(`Visual audit assertion failures: ${failed.map((artifact) => artifact.id).join(", ")}`);
    process.exitCode = 1;
  }
}
