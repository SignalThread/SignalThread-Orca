/**
 * Deterministic footprint-aware LU starters — placements stay inside the room interior without overlaps.
 */

import type { RoomSetLayoutBoundary } from "@/lib/room-set/spatial-types";
import { formatFeet, formatRoomShellDimensions } from "@/lib/room-set/room-units";

import {
  DEFAULT_PLANNER_ROOM_PAGE_ANCHOR,
  boundaryToPlannerShellPageSize,
  insertPlannerComponentAtPage,
  type PlannerPageEditorLike,
  type PlannerShapeId,
  PLANNER_PAGE_SCALE,
  PLANNER_ROOM_SHELL_SHAPE_TYPE,
  zoomEditorToPlannerRoomShell,
} from "./planner-page-helpers";
import {
  getRoomSetComponent,
  type RoomSetComponentId,
} from "./component-library";
import { isPlannerTldrawShapeType } from "./planner-shape-types";
import {
  buildPlannerComponentRequestsWithProvenance,
  enrichPlannerComponentRequestsFromPrompt,
  formatComponentRequestInterpretationSummaryLines,
  inferAdditiveCountFromPrompt,
  inferCapacityTargetFromPrompt,
  inferPlannerGenerationMode,
  inferPlacementPreferenceFromPrompt,
  labelNounForCatalogComponent,
  maxPromptCountForCatalogComponent,
  mergePlannerComponentRequestsWithoutInference,
  normalizePlannerComponentRequestsFromUnknown,
  type RoomSetComponentRequestInterpretationMeta,
  type RoomSetPlannerComponentRequest,
  type RoomSetPlannerGenerationMode,
  type RoomSetPlannerPlacementPreference,
} from "./planner-component-requests";
import {
  normalizeRoomSetDensityPreference,
  type RoomSetCapacityStrategy,
  type RoomSetDensityPreference,
  type RoomSetEventIntentId,
  operationalBriefWithAttendeeCount,
  type RoomSetOperationalBrief,
  type RoomSetOperationalScale,
  type RoomSetPresentationScale,
  type RoomSetServicePriority,
  type RoomTypeStarterId,
} from "./planner-intent-shared";
import type { CanvasLayoutInventory } from "./planner-apply-edit-plan";
import {
  inferPrimarySeatingComponentFromPrompt,
  resolveEffectivePrimarySeatingComponentId,
  resolveEffectiveStarterId,
  starterIdFromPrimaryComponentId,
} from "./planner-seating-resolve";

type TLShapeId = PlannerShapeId;
type RoomSetStarterShape = {
  id: TLShapeId;
  type: string;
  x: number;
  y: number;
  rotation?: number;
  props: Record<string, unknown>;
  [key: string]: unknown;
};
type Editor = {
  getCurrentPageShapes(): RoomSetStarterShape[];
  getCurrentPageShapeIds(): Iterable<TLShapeId>;
  getShape(id: TLShapeId): RoomSetStarterShape | undefined;
  getShapePageBounds(shape: TLShapeId | RoomSetStarterShape): { x: number; y: number; w: number; h: number } | null | undefined;
  updateShape(shape: Record<string, unknown>): void;
  deleteShapes(ids: Iterable<TLShapeId>): void;
  setSelectedShapes(ids: Iterable<TLShapeId>): void;
  run(callback: () => void): void;
  [key: string]: unknown;
} & PlannerPageEditorLike;

export type {
  RoomSetPlannerComponentRequest,
  RoomSetPlannerGenerationMode,
  RoomSetPlannerPlacementPreference,
} from "./planner-component-requests";
export {
  buildPlannerComponentRequestsWithProvenance,
  enrichPlannerComponentRequestsFromPrompt,
  formatComponentRequestInterpretationSummaryLines,
  inferAdditiveCountFromPrompt,
  inferCapacityTargetFromPrompt,
  inferPlannerComponentRequestsFromPrompt,
  inferPlannerGenerationMode,
  inferPlacementPreferenceFromPrompt,
  mergePlannerComponentRequestsWithoutInference,
  normalizePlannerComponentRequestsFromUnknown,
  supplementPlannerComponentRequests,
} from "./planner-component-requests";
export type {
  RoomSetCapacityStrategy,
  RoomSetDensityPreference,
  RoomSetEventIntentId,
  RoomSetOperationalBrief,
  RoomSetOperationalScale,
  RoomSetPresentationScale,
  RoomSetServicePriority,
  RoomTypeStarterId,
} from "./planner-intent-shared";
export {
  normalizeRoomSetDensityPreference,
  operationalBriefWithAttendeeCount,
} from "./planner-intent-shared";
export {
  inferPrimarySeatingComponentFromPrompt,
  resolveEffectivePrimarySeatingComponentId,
  resolveEffectiveStarterId,
} from "./planner-seating-resolve";

/** @deprecated Use {@link RoomSetPlannerPlacementPreference} */
export type RoomSetPlannerSecondaryPlacementPreference = RoomSetPlannerPlacementPreference;

/** Non-operational banquet hints surfaced in Last generation (“Planner notes” section). Must match banquet warns prefix. */
export const ROOM_SET_PLANNER_UI_NOTE_PREFIX = "Room-set UI note:";

export type RoomSetOptionalEnhancementId =
  | "buffet"
  | "bar"
  | "registration"
  | "sponsor"
  | "recording"
  | "networking";

export type RoomSetFitStatus = "fits" | "partial_fit" | "tight_fit" | "insufficient_space";

/** Global cap summed across interpreted prompt requests for cocktail mingle clusters · physical-fit only. */
export const ROOM_SET_PROMPT_MAX_SECONDARY_COCKTAIL_CLUSTERS = 48;

export const ROOM_SET_PROMPT_MAX_SECONDARY_SPONSOR_LOUNGES = 6;

export type RoomSetOperationalValidation = Readonly<{
  requestedCapacity: number;
  /** Arithmetic ceiling — max seats achievable if every required primary primitive is populated. */
  plannedSeatCapacity: number;
  /** Seats actually summed from placed primitives (filled after adaptive packing completes). */
  appliedSeatCapacity: number | null;
  fitStatus: RoomSetFitStatus;
  /** Ratio applied ÷ requested (0–1). */
  densityScore: number | null;
  /** Approximate unobstructed LU² fraction of the usable interior after seating footprints. */
  circulationScore: number | null;
  /** Packing loop could not advance toward the target despite remaining seating demand. */
  packingExhausted: boolean;
  requiredPrimaryComponents: number;
  plannedPrimaryComponents: number;
  validationWarnings: readonly string[];
  layoutTradeoffs: readonly string[];
  operationalRisks: readonly string[];
  assumptions: readonly string[];
  generationInstructions: readonly string[];
}>;

/** User-facing fragments for Last generation summaries (deterministic wording). */
export type PromptDrivenSecondaryPlacementSummaryLines = readonly string[];

export type RoomTypeStarterCard = Readonly<{
  id: RoomTypeStarterId;
  title: string;
  subtitle: string;
  boundary: RoomSetLayoutBoundary;
  intent: string;
}>;

export const ROOM_TYPE_STARTER_CARDS: RoomTypeStarterCard[] = [
  {
    id: "banquet",
    title: "Banquet",
    subtitle: "Rounds with center aisles, stage, screen, and AV",
    boundary: { widthLu: 96, depthLu: 72 },
    intent: "Dinner / general session",
  },
  {
    id: "classroom",
    title: "Classroom",
    subtitle: "Desk rows, instruction aisle, front stage, and tech flank",
    boundary: { widthLu: 96, depthLu: 64 },
    intent: "Training / workshop",
  },
  {
    id: "theater",
    title: "Theater",
    subtitle: "Audience rows split by center aisle with front production",
    boundary: { widthLu: 128, depthLu: 72 },
    intent: "Keynote / panel seating",
  },
  {
    id: "reception",
    title: "Reception",
    subtitle: "Bars, buffet, registration, and mingle zones",
    boundary: { widthLu: 104, depthLu: 72 },
    intent: "Cocktail / networking",
  },
];

export type RoomSetEventIntentArchetype = Readonly<{
  id: RoomSetEventIntentId;
  label: string;
  description: string;
  starterId: RoomTypeStarterId;
}>;

export const ROOM_SET_EVENT_INTENT_ARCHETYPES: readonly RoomSetEventIntentArchetype[] = [
  {
    id: "banquet_remarks",
    label: "Banquet with remarks",
    description: "Dinner seating with a modest remarks focal point.",
    starterId: "banquet",
  },
  {
    id: "awards_dinner",
    label: "Awards dinner",
    description: "Banquet occupancy with a stronger stage moment.",
    starterId: "banquet",
  },
  {
    id: "training_session",
    label: "Training session",
    description: "Forward-facing classroom rows for instruction.",
    starterId: "classroom",
  },
  {
    id: "workshop",
    label: "Workshop",
    description: "Classroom-style working rows with lighter production.",
    starterId: "classroom",
  },
  {
    id: "general_session",
    label: "General session",
    description: "High-capacity audience seating with front presentation.",
    starterId: "theater",
  },
  {
    id: "networking_reception",
    label: "Networking reception",
    description: "Cocktail clusters, service anchors, and mingle space.",
    starterId: "reception",
  },
  {
    id: "town_hall",
    label: "Town hall",
    description: "Audience seating with a practical speaker focal point.",
    starterId: "theater",
  },
  {
    id: "expo_lounge",
    label: "Expo lounge",
    description: "Reception-style sponsor/social lounge environment.",
    starterId: "reception",
  },
];

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickPlacementPreference(
  current: RoomSetPlannerPlacementPreference | undefined,
  next: RoomSetPlannerPlacementPreference | undefined,
): RoomSetPlannerPlacementPreference {
  if (current && current !== "mixed") return current;
  if (next && next !== "mixed") return next;
  return current ?? next ?? "mixed";
}

/** Merge supplemental config requests before interpreter brief ordering (extras first consume cap). */
function mergedPlannerComponentRequests(
  config: RoomSetEventIntentGenerationConfig,
): RoomSetPlannerComponentRequest[] {
  const preFromCfg = [...(config.componentRequests ?? [])] as unknown[];
  const preFromBrief = [...(config.operationalBrief?.componentRequests ?? [])] as unknown[];
  return normalizePlannerComponentRequestsFromUnknown([...preFromCfg, ...preFromBrief]);
}

export function resolvePlannerComponentRequests(
  config: RoomSetEventIntentGenerationConfig,
  plannerPrompt?: string,
): RoomSetPlannerComponentRequest[] {
  const attendeeCount = clampNumber(
    Math.round(config.operationalBrief?.requestedAttendees ?? config.attendeeCount ?? 100),
    1,
    1200,
  );
  const prompt = plannerPrompt?.trim() ?? "";
  const brief = config.operationalBrief;

  if (brief?.componentRequestInterpretation || config.componentRequestInterpretation) {
    const fromBrief = [...(brief?.componentRequests ?? [])];
    const fromConfig = normalizePlannerComponentRequestsFromUnknown(config.componentRequests ?? []);
    const merged = mergePlannerComponentRequestsWithoutInference(fromBrief, fromConfig);
    return merged.filter((request) => request.count > 0);
  }

  const merged = mergedPlannerComponentRequests(config);
  if (!prompt) {
    return merged.filter((request) => request.count > 0);
  }

  return buildPlannerComponentRequestsWithProvenance(merged, prompt, attendeeCount, false).requests.filter(
    (request) => request.count > 0,
  );
}

type PlannerComponentPlacementDirective = Readonly<{
  componentId: RoomSetComponentId;
  count: number;
  placementPreference: RoomSetPlannerPlacementPreference;
  labelNoun: string;
}>;

export type RoomSetPlannerEditIntentKind =
  | "addComponent"
  | "replaceComponent"
  | "moveComponent"
  | "removeComponent"
  | "expandSeating"
  | "reduceSeating"
  | "spreadSeating"
  | "reflowSymmetric"
  | "changeArchetype"
  | "changeCapacity";

type PlannerPromptEditIntent = Readonly<{
  kind: RoomSetPlannerEditIntentKind;
  sourceComponentIds: readonly RoomSetComponentId[];
  targetComponentId?: RoomSetComponentId;
  count?: number;
  placementPreference: RoomSetPlannerPlacementPreference;
}>;

const CHAIR_ROW_COMPONENT_IDS = ["seating-theater-row", "seating-classroom-row"] as const;
const TABLE_COMPONENT_IDS = ["table-round-60", "table-round-72", "table-banquet-6ft"] as const;
const COCKTAIL_COMPONENT_IDS = ["table-cocktail-cluster", "table-cocktail"] as const;

function aggregatedComponentPlacementDirectives(
  requests: readonly RoomSetPlannerComponentRequest[],
): readonly PlannerComponentPlacementDirective[] {
  const byComponentId = new Map<RoomSetComponentId, PlannerComponentPlacementDirective>();
  for (const request of requests) {
    const componentId = request.catalogComponentId;
    const existing = byComponentId.get(componentId);
    const placementPreference = pickPlacementPreference(
      existing?.placementPreference,
      request.placementPreference,
    );
    const cap = maxPromptCountForCatalogComponent(componentId);
    const nextCount = clampNumber((existing?.count ?? 0) + request.count, 0, cap);
    byComponentId.set(componentId, {
      componentId,
      count: nextCount,
      placementPreference,
      labelNoun: labelNounForCatalogComponent(componentId),
    });
  }
  return [...byComponentId.values()].filter((directive) => directive.count > 0);
}

function intentArchetype(intentId: RoomSetEventIntentId): RoomSetEventIntentArchetype {
  return ROOM_SET_EVENT_INTENT_ARCHETYPES.find((archetype) => archetype.id === intentId) ??
    ROOM_SET_EVENT_INTENT_ARCHETYPES[0]!;
}

function roundedLu(value: number): number {
  return Math.round(value / 4) * 4;
}

function boundaryForEventIntent(
  starterId: RoomTypeStarterId,
  attendeeCount: number,
  densityPreference: RoomSetDensityPreference,
  accessibilityPriority: boolean,
): RoomSetLayoutBoundary {
  const densityFactor =
    densityPreference === "premium" ? 1.14 : densityPreference === "compact" ? 0.9 : 1;
  /** Slight LU inflation when modeling access pathways — avoids silently over-shrinking the solved shell. */
  const accessibilityFactor = accessibilityPriority ? 1.02 : 1;
  const count = clampNumber(Math.round(attendeeCount), 12, 1200);
  const profile = {
    banquet: { areaPerGuest: 42, ratio: 1.32, minW: 88, minD: 60, maxW: 180, maxD: 132 },
    classroom: { areaPerGuest: 31, ratio: 1.42, minW: 88, minD: 56, maxW: 172, maxD: 120 },
    theater: { areaPerGuest: 24, ratio: 1.7, minW: 96, minD: 58, maxW: 208, maxD: 132 },
    reception: { areaPerGuest: 28, ratio: 1.45, minW: 92, minD: 58, maxW: 188, maxD: 132 },
  }[starterId];
  const area = count * profile.areaPerGuest * densityFactor * accessibilityFactor;
  const computedW = Math.sqrt(area * profile.ratio);
  const computedD = area / Math.max(1, computedW);
  return {
    widthLu: roundedLu(clampNumber(computedW, profile.minW, profile.maxW)),
    depthLu: roundedLu(clampNumber(computedD, profile.minD, profile.maxD)),
  };
}

function primaryCapacityComponent(starterId: RoomTypeStarterId): {
  componentId: RoomSetComponentId;
  capacity: number;
} {
  switch (starterId) {
    case "classroom":
      return { componentId: "seating-classroom-row", capacity: 12 };
    case "theater":
      return { componentId: "seating-theater-row", capacity: 14 };
    case "banquet":
      /** Default banquet packing rounds: catalog-standard 60in / 8-seat primitive (compound planner shape). */
      return { componentId: "table-round-60", capacity: 8 };
    case "reception":
      return { componentId: "table-cocktail-cluster", capacity: 4 };
    default:
      ((x: never) => void x)(starterId);
      return { componentId: "seating-theater-row", capacity: 14 };
  }
}

function servicePriorityFromConfig(
  config: RoomSetEventIntentGenerationConfig,
  starterId: RoomTypeStarterId,
): RoomSetServicePriority[] {
  const priorities: RoomSetServicePriority[] = ["seating_capacity", "egress"];
  if (starterId === "classroom" || starterId === "theater") priorities.push("sightlines");
  if (starterId === "classroom") priorities.push("teaching_av");
  if (config.accessibilityPriority) priorities.push("accessibility");
  if (config.enhancements.buffet || config.enhancements.bar) priorities.push("fnb", "service_flow");
  if (config.enhancements.registration) priorities.push("registration");
  if (config.enhancements.networking) priorities.push("networking");
  if (config.enhancements.recording) priorities.push("recording");
  return [...new Set(priorities)];
}

function capacityStrategyFor(
  starterId: RoomTypeStarterId,
  requestedAttendees: number,
  servicePriorities: readonly RoomSetServicePriority[],
): RoomSetCapacityStrategy {
  const primary = primaryCapacityComponent(starterId);
  const requestedSeats = clampNumber(Math.round(requestedAttendees), 1, 1200);
  const requiredPrimaryComponents = Math.max(1, Math.ceil(requestedSeats / primary.capacity));
  return {
    requestedSeats,
    seatingStyle: starterId,
    capacityIsHardRequirement: true,
    primaryComponentId: primary.componentId,
    primaryComponentCapacity: primary.capacity,
    requiredPrimaryComponents,
    plannedPrimaryComponents: requiredPrimaryComponents,
    overflowPolicy: servicePriorities.includes("breakout_collaboration")
      ? "reduce_secondary_zones"
      : "recommend_larger_room",
  };
}

export function buildRoomSetOperationalBriefFromConfig(
  config: RoomSetEventIntentGenerationConfig,
): RoomSetOperationalBrief {
  const archetype = intentArchetype(config.intentId);
  const requestedAttendees = clampNumber(Math.round(config.attendeeCount || 1), 1, 1200);
  const presentationScale = config.presentationScale ?? "moderate";
  const productionScale = config.stageScale ?? config.avScale ?? presentationScale;
  const servicePriorities = servicePriorityFromConfig(config, archetype.starterId);
  const capacityStrategy = capacityStrategyFor(archetype.starterId, requestedAttendees, servicePriorities);
  const optionalZones = [
    config.enhancements.networking ? "networking touchpoints" : null,
    config.enhancements.buffet ? "F&B resource station" : null,
    config.enhancements.registration ? "check-in / registration" : null,
  ].filter((zone): zone is string => zone !== null);

  return {
    archetype: config.intentId,
    eventIntent: config.intentId,
    requestedAttendees,
    attendeeCount: requestedAttendees,
    productionScale,
    densityPreference: normalizeRoomSetDensityPreference(String(config.densityPreference)),
    servicePriorities,
    accessibilityPriority: config.accessibilityPriority,
    requiredZones: ["primary audience seating", "front presentation", "circulation / egress"],
    optionalZones,
    capacityStrategy,
    layoutTradeoffs: [],
    operationalRisks: [],
    assumptions: ["Generated from explicit controls rather than a planner prompt."],
    generationInstructions: [
      "Resolve primary capacity before placing secondary support zones.",
      "Warn if the requested capacity cannot fit instead of producing a symbolic layout.",
    ],
    presentationScale,
    stageScale: config.stageScale ?? presentationScale,
    avScale: config.avScale ?? presentationScale,
    seatingPriority: config.seatingPriority ?? 0.9,
    networkingPriority: config.networkingPriority ?? (config.enhancements.networking ? 0.65 : 0.2),
    fnbPriority: config.fnbPriority ?? (config.enhancements.buffet || config.enhancements.bar ? 0.65 : 0.2),
    notes: [],
    componentRequests: normalizePlannerComponentRequestsFromUnknown([
      ...(config.componentRequests ?? []),
      ...(config.operationalBrief?.componentRequests ?? []),
    ]),
  };
}

function solvedBoundaryForBrief(
  starterId: RoomTypeStarterId,
  brief: RoomSetOperationalBrief,
): RoomSetLayoutBoundary {
  const requested = brief.capacityStrategy.requestedSeats;
  const densityFactor =
    brief.densityPreference === "premium" ? 1.1 : brief.densityPreference === "compact" ? 0.92 : 1;
  const accessFactor = brief.accessibilityPriority ? 1.02 : 1;
  const hasBreakouts = brief.servicePriorities.includes("breakout_collaboration") ||
    brief.requiredZones.some((zone) => zone.toLowerCase().includes("breakout")) ||
    brief.optionalZones.some((zone) => zone.toLowerCase().includes("breakout"));
  const hasPower = brief.servicePriorities.includes("distributed_power") ||
    brief.generationInstructions.some((line) => line.toLowerCase().includes("power"));

  if (starterId === "classroom") {
    const banks = requested >= 36 ? 2 : 1;
    const rowCourses = Math.ceil(brief.capacityStrategy.requiredPrimaryComponents / banks);
    const productionDepth = brief.productionScale === "production" ? 34 : brief.productionScale === "none" ? 18 : 26;
    const breakoutDepth = hasBreakouts ? 20 : 0;
    const powerWidth = hasPower ? 8 : 0;
    return {
      widthLu: roundedLu(clampNumber((banks === 2 ? 92 : 56) + powerWidth, 88, 220)),
      depthLu: roundedLu(clampNumber(
        (productionDepth + rowCourses * 10.5 + 18 + breakoutDepth) * densityFactor * accessFactor,
        64,
        260,
      )),
    };
  }

  if (starterId === "theater") {
    const banks = requested >= 42 ? 2 : 1;
    const rowCourses = Math.ceil(brief.capacityStrategy.requiredPrimaryComponents / banks);
    const productionDepth = brief.productionScale === "production" ? 38 : 28;
    return {
      widthLu: roundedLu(clampNumber(banks === 2 ? 116 : 64, 96, 240)),
      depthLu: roundedLu(clampNumber((productionDepth + rowCourses * 7.4 + 18) * densityFactor * accessFactor, 60, 220)),
    };
  }

  if (starterId === "banquet") {
    return boundaryForEventIntent(starterId, requested, brief.densityPreference, brief.accessibilityPriority);
  }

  return boundaryForEventIntent(starterId, requested, brief.densityPreference, brief.accessibilityPriority);
}

function validateOperationalFit(
  starterId: RoomTypeStarterId,
  brief: RoomSetOperationalBrief,
  boundary: RoomSetLayoutBoundary,
): RoomSetOperationalValidation {
  const strategy = brief.capacityStrategy;
  const plannedSeatCapacity = strategy.plannedPrimaryComponents * strategy.primaryComponentCapacity;
  /** Should not trigger with canonical ceil(...) math; guarded for malformed briefs only. */
  const hardCapacityMiss = plannedSeatCapacity < strategy.requestedSeats && strategy.capacityIsHardRequirement;
  const areaPerGuest = (boundary.widthLu * boundary.depthLu) / Math.max(1, strategy.requestedSeats);
  const tightFloorThresholdLu =
    starterId === "classroom" ? 42 : starterId === "theater" ? 30 : starterId === "banquet" ? 48 : 32;
  const fitStatusPreGeometry: RoomSetFitStatus =
    hardCapacityMiss
      ? "insufficient_space"
      : areaPerGuest < tightFloorThresholdLu
        ? "tight_fit"
        : "fits";
  const validationWarnings = [
    hardCapacityMiss
      ? `Brief requests ${strategy.requestedSeats} seated guests but arithmetic plan only reaches ${plannedSeatCapacity} plated seats across ${strategy.plannedPrimaryComponents} primitives.`
      : null,
    fitStatusPreGeometry === "tight_fit"
      ? `Floor area is tight (${areaPerGuest.toFixed(1)} sq ft per requested guest vs ${tightFloorThresholdLu} sq ft heuristic); adaptive packing still needed.`
      : null,
  ].filter((line): line is string => line !== null);
  const layoutTradeoffs = [
    ...brief.layoutTradeoffs,
    fitStatusPreGeometry === "tight_fit" && brief.optionalZones.length
      ? `Optional zones should yield first before forcing higher seating stacks: ${brief.optionalZones.join(", ")}.`
      : null,
  ].filter((line): line is string => line !== null);

  return {
    requestedCapacity: strategy.requestedSeats,
    plannedSeatCapacity,
    appliedSeatCapacity: null,
    fitStatus: fitStatusPreGeometry,
    densityScore: null,
    circulationScore: null,
    packingExhausted: false,
    requiredPrimaryComponents: strategy.requiredPrimaryComponents,
    plannedPrimaryComponents: strategy.plannedPrimaryComponents,
    validationWarnings,
    layoutTradeoffs,
    operationalRisks: brief.operationalRisks,
    assumptions: brief.assumptions,
    generationInstructions: brief.generationInstructions,
  };
}

type Box = { x: number; y: number; w: number; h: number };

/**
 * Packing profiler (dev-only). Enable with `NEXT_PUBLIC_ROOM_SET_PACK_DIAG=1` (restart dev server) or run
 * `globalThis.__ROOM_SET_PACK_DIAG__ = true` in the browser console before Generate/Apply.
 */
type PackPlannerRejectPayload = Readonly<
  | {
      reason: "candidate_out_of_pack_bounds";
      candidate: Box;
      packClipPage: Box;
      componentId: RoomSetComponentId;
    }
  | {
      reason: "overlap_prior_placed_collision_box";
      candidate: Box;
      prior: Box;
      priorIndex: number;
      componentId: RoomSetComponentId;
    }
  | {
      reason: "editor_insert_failed_or_empty";
      componentId: RoomSetComponentId;
      anchor: Readonly<{ x: number; y: number }>;
    }
>;

type BanquetPackDiagState = {
  targetCapacity: number;
  packClipPage: Box;
  lanes: { leftLaneX: number; leftLaneLimit: number; rightLaneX: number; rightLaneLimit: number };
  seatingBandPage: { seatingTop: number; seatingBottom: number };
  laneWidthsPx: { left: number; right: number };
  stepX: number;
  stepY: number;
  rowScanIterations: number;
  anchorsPrefilterLaneWide: number;
  anchorsPrefilterCenterCorridor: number;
  anchorsPrefilterSeatingFloor: number;
  tryPlaceAttempts: number;
  /** Compact-only wing pass: hull x-range (page px) expanded with margin · slots centered outside may try extra rows above lattice seatingTop. */
  compactWingFohExcludedXp?: readonly [number, number];
  compactWingHullRawXp?: readonly [number, number];
  compactWingHullMarginPx?: number;
  compactWingCandidateYsPage?: readonly number[];
  compactWingTrySuccess?: readonly [number, number];
  compactWingSlotXsPage?: readonly number[];
  compactWingHullSkipCount?: number;
  compactWingHullSkipSamples?: readonly string[];
  compactWingTrySamples?: readonly string[];
  compactWingRejectBuckets?: Record<string, number>;
  compactWingRejectSamples?: readonly string[];
  compactWingSuccessSamples?: readonly string[];
  compactWingEntry?: Readonly<{
    tablesPlacedBeforeWing: number;
    targetTables: number;
    gatePass: boolean;
    gateFailReason:
      | "tablesPlaced_ge_targetTables"
      | "seatRectW_too_narrow"
      | "rowPitch_not_above_fpHeight"
      | null;
  }>;
  compactWingScalars?: Readonly<{
    wingNorthMinY: number;
    seatingTop: number;
    rowPitch: number;
    fpH: number;
    /** Stage/screen deepest south edge · diagnostic only · must not implicitly blank side-wing bands. */
    fohMaxSouthY: number;
    frontCrossAisleTop: number;
    packIy0: number;
    /** First `y` step one full row-pitch north of lattice `seatingTop` (before north clamp). */
    rawFirstStepYTop: number;
    /** Count of discrete wing row `y` values generated (before `tryPlace`). */
    wingCandidateRowCount: number;
    /** True when north clamp removes every step even though `seatingTop - rowPitch` exists (generation-domain proof). */
    zeroRowsBecauseNorthClamp: boolean;
  }>;
  rejectBuckets: Record<string, number>;
  rejectSamples: readonly string[];
};

type ReceptionPackDiagState = {
  targetGuests: number;
  clustersNeeded: number;
  receptionClusterLimitFromPlan: number | null;
  marginPx: number;
  pitchXPx: number;
  pitchYPx: number;
  innerWPx: number;
  innerHPx: number;
  nxSlots: number;
  nySlots: number;
  gridCellsVisited: number;
  cocktailAttempts: number;
  cocktailAccepted: number;
  rejectBuckets: Record<string, number>;
  rejectSamples: readonly string[];
};

type MutablePackDiagRoot = {
  starterId: RoomTypeStarterId;
  banquet?: {
    diag: Partial<BanquetPackDiagState> & {
      rejectBuckets: Record<string, number>;
      rejectSamples: string[];
    };
    flush(args: Readonly<{ seatedTotal: number; exhausted: boolean; stopReason: string }>): void;
  };
  reception?: {
    diag: Partial<ReceptionPackDiagState> & {
      rejectBuckets: Record<string, number>;
      rejectSamples: string[];
    };
    flush(): void;
  };
};

function globalPackDiagGate(): boolean {
  if (typeof process !== "undefined" && String(process.env.NEXT_PUBLIC_ROOM_SET_PACK_DIAG ?? "").trim() === "1")
    return true;
  try {
    return (globalThis as { __ROOM_SET_PACK_DIAG__?: boolean }).__ROOM_SET_PACK_DIAG__ === true;
  } catch {
    return false;
  }
}

function shouldCollectRoomSetPackDiag(starterId: RoomTypeStarterId): boolean {
  if (!globalPackDiagGate()) return false;
  return starterId === "banquet" || starterId === "reception";
}

function banquetDiagNoteReject(
  state: MutablePackDiagRoot["banquet"] | undefined,
  bucket: string,
  detail: string,
): void {
  if (!state) return;
  state.diag.rejectBuckets[bucket] = (state.diag.rejectBuckets[bucket] ?? 0) + 1;
  if (state.diag.rejectSamples.length < 20) state.diag.rejectSamples.push(detail);
}

function receptionDiagNoteReject(
  state: MutablePackDiagRoot["reception"] | undefined,
  bucket: string,
  detail: string,
): void {
  if (!state) return;
  state.diag.rejectBuckets[bucket] = (state.diag.rejectBuckets[bucket] ?? 0) + 1;
  if (state.diag.rejectSamples.length < 20) state.diag.rejectSamples.push(detail);
}

function stringifyBox(b: Box): string {
  return `{x:${b.x.toFixed(2)},y:${b.y.toFixed(2)},w:${b.w.toFixed(2)},h:${b.h.toFixed(2)}}`;
}

function stringifyPackDiagReport(
  args: Readonly<{
    editor: Editor;
    placedBoxes: Box[];
    placedIds: readonly TLShapeId[];
    idsCount: number;
    diag?: MutablePackDiagRoot;
  }>,
): void {
  const appliedSeatCapacity = generatedSeatedCapacity(args.editor, args.placedIds);
  const requestedCapacityHint =
    args.diag?.starterId === "banquet"
      ? args.diag.banquet?.diag.targetCapacity ?? null
      : args.diag?.starterId === "reception"
        ? args.diag.reception?.diag.targetGuests ?? null
        : null;

  console.groupCollapsed(`[room-set-pack-diag] ${args.diag?.starterId ?? "?"} collision boxes (${args.placedBoxes.length})`);
  args.placedBoxes.forEach((b, i) => {
    console.debug(`placed[${i}]`, stringifyBox(b));
  });
  console.groupEnd();

  console.info("[room-set-pack-diag] summary", {
    starterId: args.diag?.starterId,
    placedCollisionBoxCount: args.placedBoxes.length,
    stagedShapeIds: args.idsCount,
    requestedCapacityHintFromDiag: requestedCapacityHint,
    appliedSeatCapacityFromShapes: appliedSeatCapacity,
    banquetTelemetry: args.diag?.banquet?.diag ?? null,
    receptionTelemetry: args.diag?.reception?.diag ?? null,
  });
}

function createMutablePackDiagRoot(starterId: RoomTypeStarterId): MutablePackDiagRoot | undefined {
  if (!shouldCollectRoomSetPackDiag(starterId)) return undefined;
  const root: MutablePackDiagRoot = { starterId };
  if (starterId === "banquet") {
    root.banquet = {
      diag: {
        rejectBuckets: {},
        rejectSamples: [],
        anchorsPrefilterLaneWide: 0,
        anchorsPrefilterCenterCorridor: 0,
        anchorsPrefilterSeatingFloor: 0,
        rowScanIterations: 0,
        tryPlaceAttempts: 0,
      },
      flush({ seatedTotal, exhausted, stopReason }) {
        const d = root.banquet!.diag;
        console.info("[room-set-pack-diag] banquet.final", {
          stopReason,
          exhausted,
          targetCapacity: d.targetCapacity,
          seatedPackedTotal: seatedTotal,
          seatedBandHeightPx:
            typeof d.seatingBandPage?.seatingBottom === "number" &&
            typeof d.seatingBandPage?.seatingTop === "number"
              ? d.seatingBandPage!.seatingBottom - d.seatingBandPage!.seatingTop
              : null,
          rowScanIterations: d.rowScanIterations,
          anchorsPrefilterLaneWide: d.anchorsPrefilterLaneWide,
          anchorsPrefilterCenterCorridor: d.anchorsPrefilterCenterCorridor,
          anchorsPrefilterSeatingFloor: d.anchorsPrefilterSeatingFloor,
          tryPlaceAttempts: d.tryPlaceAttempts,
          rejectBuckets: d.rejectBuckets,
          firstRejectSamples: d.rejectSamples,
          packClipPage: d.packClipPage ?? null,
          lanesPx: d.lanes ?? null,
          seatingBandPage: d.seatingBandPage ?? null,
          laneWidthsPx: d.laneWidthsPx ?? null,
          stepPx: { x: d.stepX, y: d.stepY },
          compactWingDebug:
            d.compactWingEntry ||
            d.compactWingCandidateYsPage ||
            d.compactWingFohExcludedXp ||
            d.compactWingTrySamples ||
            d.compactWingHullSkipSamples
              ? {
                  entry: d.compactWingEntry ?? null,
                  hullRawXp: d.compactWingHullRawXp ?? null,
                  hullExcludedXp: d.compactWingFohExcludedXp ?? null,
                  hullMarginPx: d.compactWingHullMarginPx ?? null,
                  scalars: d.compactWingScalars ?? null,
                  candidateYsPage: d.compactWingCandidateYsPage ?? null,
                  slotXsPage: d.compactWingSlotXsPage ?? null,
                  hullSkipCount: d.compactWingHullSkipCount ?? null,
                  hullSkipSamples: d.compactWingHullSkipSamples ?? null,
                  trySamples: d.compactWingTrySamples ?? null,
                  rejectBucketsWingPhase: d.compactWingRejectBuckets ?? null,
                  rejectSamplesWingPhase: d.compactWingRejectSamples ?? null,
                  successSamplesWingPhase: d.compactWingSuccessSamples ?? null,
                  trySuccessPairsTriedAccepted: d.compactWingTrySuccess ?? null,
                }
              : null,
        });
      },
    };
  } else if (starterId === "reception") {
    root.reception = {
      diag: {
        rejectBuckets: {},
        rejectSamples: [],
        cocktailAttempts: 0,
        cocktailAccepted: 0,
        gridCellsVisited: 0,
      },
      flush() {
        const d = root.reception!.diag;
        console.info("[room-set-pack-diag] reception.final", {
          targetGuests: d.targetGuests,
          clustersNeeded: d.clustersNeeded,
          receptionClusterLimitFromPlanNote:
            typeof d.receptionClusterLimitFromPlan === "number"
              ? "`receptionClusterLimit` exists on plan.options but receptionStarter ignores it"
              : d.receptionClusterLimitFromPlan,
          marginPx: d.marginPx,
          pitchPx: { x: d.pitchXPx, y: d.pitchYPx },
          innerPx: { w: d.innerWPx, h: d.innerHPx },
          nxNy: { nx: d.nxSlots, ny: d.nySlots },
          gridCellsVisited: d.gridCellsVisited,
          cocktailAttempts: d.cocktailAttempts,
          cocktailAccepted: d.cocktailAccepted,
          rejectBuckets: d.rejectBuckets,
          firstRejectSamples: d.rejectSamples,
        });
      },
    };
  }
  return root;
}

type StarterCompositionOptions = Readonly<{
  front?: Readonly<{
    screen?: RoomSetComponentId | false;
    stage?: RoomSetComponentId | false;
    av?: RoomSetComponentId | false;
    speakerStacks?: boolean;
    reserveMode?: "compact" | "production";
  }>;
  support?: Readonly<{
    buffet?: boolean;
    bar?: boolean;
    registration?: boolean;
    coffee?: boolean;
    foh?: boolean;
  }>;
  capacity?: Readonly<{
    targetSeats: number;
    targetPrimaryComponents: number;
    primaryComponentId: RoomSetComponentId;
    primaryComponentCapacity: number;
    distributedPower?: boolean;
    breakoutZones?: boolean;
    densityPreference?: RoomSetDensityPreference;
    accessibilityPriority?: boolean;
  }>;
  receptionClusterLimit?: number;
  /** Shrinks banquet primary pack so prompt-driven secondaries can occupy perimeter bands. */
  promptSecondaryReserve?: Readonly<{
    cocktailClusters: number;
    placementPreference: RoomSetPlannerPlacementPreference;
  }>;
  /** Ephemeral profiler handle — stripped before persistence */
  packDiagRoot?: MutablePackDiagRoot;
}>;

export type RoomSetEventIntentPlan = Readonly<{
  archetype: RoomSetEventIntentArchetype;
  starterId: RoomTypeStarterId;
  boundary: RoomSetLayoutBoundary;
  options: StarterCompositionOptions;
  validation: RoomSetOperationalValidation;
  summary: string;
}>;

export type PlannerRoomStarterContext = Readonly<{
  boundary: RoomSetLayoutBoundary;
  plannerRoomPageAnchor?: Readonly<{ x: number; y: number }>;
}>;

export type RoomSetEventIntentGenerationConfig = Readonly<{
  intentId: RoomSetEventIntentId;
  attendeeCount: number;
  densityPreference: RoomSetDensityPreference;
  operationalBrief?: RoomSetOperationalBrief;
  presentationScale?: RoomSetPresentationScale;
  stageScale?: RoomSetOperationalScale;
  avScale?: RoomSetOperationalScale;
  seatingPriority?: number;
  networkingPriority?: number;
  fnbPriority?: number;
  accessibilityPriority: boolean;
  enhancements: Readonly<Partial<Record<RoomSetOptionalEnhancementId, boolean>>>;
  /** Explicit secondary primitive requests (deterministic post-pass) — merges with `operationalBrief.componentRequests`. */
  componentRequests?: readonly RoomSetPlannerComponentRequest[];
  /** Set when interpret-intent fails but local keyword fallback still produced component requests. */
  componentRequestInterpretation?: RoomSetComponentRequestInterpretationMeta;
}>;

export function resolveRoomSetEventIntentPlan(
  config: RoomSetEventIntentGenerationConfig,
  plannerPrompt?: string,
): RoomSetEventIntentPlan {
  const brief = config.operationalBrief ?? buildRoomSetOperationalBriefFromConfig(config);
  const archetype = intentArchetype(brief.eventIntent);
  const effectiveStarterId = resolveEffectiveStarterId({
    brief,
    archetypeStarterId: archetype.starterId,
    plannerPrompt,
  });
  const effectivePrimaryComponentId = resolveEffectivePrimarySeatingComponentId({
    brief,
    archetypeStarterId: archetype.starterId,
    plannerPrompt,
  });
  const effectivePrimaryCapacity =
    getRoomSetComponent(effectivePrimaryComponentId)?.capacitySeated ??
    brief.capacityStrategy.primaryComponentCapacity;
  const attendeeCount = clampNumber(Math.round(brief.requestedAttendees || brief.attendeeCount || 1), 1, 1200);
  const presentationScale = brief.presentationScale ?? config.presentationScale ?? "moderate";
  const stageScale = brief.stageScale ?? config.stageScale ?? presentationScale;
  const avScale = brief.avScale ?? config.avScale ?? presentationScale;
  const isLightPresentation = presentationScale === "none" || presentationScale === "light";
  const isProduction = presentationScale === "production" || stageScale === "production" || avScale === "production";
  const recording = config.enhancements.recording === true || avScale === "production" || brief.servicePriorities.includes("recording");
  const frontReserveMode = isProduction || recording ? "production" : "compact";
  const sponsor = config.enhancements.sponsor === true;
  const boundary = solvedBoundaryForBrief(effectiveStarterId, brief);

  let options: StarterCompositionOptions = {};
  switch (brief.eventIntent) {
    case "banquet_remarks":
      options = {
        front: {
          screen: "av-projector-screen",
          stage: isProduction ? "stage-keynote" : recording ? "stage-small" : "stage-riser",
          av: false,
          speakerStacks: recording,
          reserveMode: frontReserveMode,
        },
        support: {
          buffet: config.enhancements.buffet === true,
          bar: config.enhancements.bar === true,
          foh: recording,
        },
      };
      break;
    case "awards_dinner":
      options = {
        front: {
          screen: isProduction || recording || attendeeCount > 260 ? "av-led-wall" : "av-projector-screen",
          stage: isProduction || attendeeCount > 360 || recording ? "stage-keynote" : "stage-small",
          av: false,
          speakerStacks: true,
          reserveMode: frontReserveMode,
        },
        support: {
          buffet: config.enhancements.buffet === true,
          bar: config.enhancements.bar === true,
          foh: recording,
        },
      };
      break;
    case "training_session":
      options = {
        front: {
          screen: "av-projector-screen",
          stage: isProduction || recording ? "stage-small" : "stage-riser",
          av: false,
          speakerStacks: recording,
          reserveMode: frontReserveMode,
        },
        support: { coffee: config.enhancements.buffet === true || config.enhancements.networking === true, foh: recording },
      };
      break;
    case "workshop":
      options = {
        front: {
          screen: "av-projector-screen",
          stage: isProduction ? "stage-small" : "stage-riser",
          av: false,
          speakerStacks: false,
          reserveMode: frontReserveMode,
        },
        support: { coffee: config.enhancements.buffet === true, foh: recording },
      };
      break;
    case "general_session":
      options = {
        front: {
          screen: isProduction || attendeeCount > 300 || recording ? "av-led-wall" : "av-projector-screen",
          stage: isProduction || recording ? "stage-keynote" : "stage-riser",
          av: false,
          speakerStacks: recording,
          reserveMode: frontReserveMode,
        },
        support: { foh: recording, registration: config.enhancements.registration === true },
      };
      break;
    case "town_hall":
      options = {
        front: {
          screen: "av-projector-screen",
          stage: isProduction ? "stage-keynote" : recording ? "stage-small" : "stage-riser",
          av: false,
          speakerStacks: recording,
          reserveMode: frontReserveMode,
        },
        support: { foh: recording, registration: config.enhancements.registration === true },
      };
      break;
    case "networking_reception":
      options = {
        support: {
          buffet: config.enhancements.buffet === true,
          bar: config.enhancements.bar === true,
          registration: config.enhancements.registration === true,
        },
        receptionClusterLimit:
          brief.densityPreference === "compact" || config.enhancements.networking === true ? 12 : 10,
      };
      break;
    case "expo_lounge":
      options = {
        support: {
          buffet: config.enhancements.buffet === true,
          bar: config.enhancements.bar === true,
          registration: config.enhancements.registration === true || sponsor,
        },
        receptionClusterLimit: sponsor || config.enhancements.networking === true ? 12 : 9,
      };
      break;
    default:
      ((x: never) => void x)(brief.eventIntent);
  }

  return {
    archetype,
    starterId: effectiveStarterId,
    boundary,
    options: {
      ...options,
      capacity: {
        targetSeats: brief.capacityStrategy.requestedSeats,
        targetPrimaryComponents: brief.capacityStrategy.plannedPrimaryComponents,
        primaryComponentId: effectivePrimaryComponentId,
        primaryComponentCapacity: Math.max(1, effectivePrimaryCapacity),
        distributedPower: brief.servicePriorities.includes("distributed_power"),
        breakoutZones: brief.servicePriorities.includes("breakout_collaboration") ||
          brief.requiredZones.some((zone) => zone.toLowerCase().includes("breakout")) ||
          brief.optionalZones.some((zone) => zone.toLowerCase().includes("breakout")),
        densityPreference: brief.densityPreference,
        accessibilityPriority: brief.accessibilityPriority,
      },
    },
    validation: validateOperationalFit(effectiveStarterId, brief, boundary),
    summary:
      effectiveStarterId !== archetype.starterId
        ? `${archetype.label} · ${attendeeCount} guests · ${effectivePrimaryComponentId.replaceAll("-", " ")} seating`
        : `${archetype.label} · ${attendeeCount} guests`,
  };
}

type RoomTypeStarterInternalResult = Readonly<{
  warningText?: string;
  placedIds: readonly TLShapeId[];
  /** True when adaptive packing yielded fewer seats/primitives than the operational target. */
  packingExhausted: boolean;
  /** Collision boxes appended by the starter (`placePlanner.commitCollisionBox` truthy). */
  placedCollisionBoxes: readonly Box[];
}>;

export type RoomSetEventIntentApplyResult = RoomSetOperationalValidation &
  Readonly<{
    warningText?: string;
    /** Deterministic summaries for planner prompt-driven secondary placement. */
    promptDrivenSecondarySummaryLines?: PromptDrivenSecondaryPlacementSummaryLines;
  }>;

function overlap(a: Box, b: Box): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function plannerFootprint(componentId: RoomSetComponentId): { w: number; h: number } {
  const component = getRoomSetComponent(componentId);
  if (!component) return { w: PLANNER_PAGE_SCALE, h: PLANNER_PAGE_SCALE };
  return {
    w: component.widthLu * PLANNER_PAGE_SCALE,
    h: component.depthLu * PLANNER_PAGE_SCALE,
  };
}

function componentSpacingPx(componentId: RoomSetComponentId): number {
  const component = getRoomSetComponent(componentId);
  if (!component) return 0;
  return Math.max(component.spacingServiceLu, component.spacingAisleLu) * PLANNER_PAGE_SCALE;
}

function clearStarterObjects(editor: Editor): void {
  const ids = editor
    .getCurrentPageShapes()
    .filter((shape) => isPlannerTldrawShapeType(shape.type))
    .map((shape) => shape.id);
  if (ids.length > 0) editor.deleteShapes(ids);
}

function starterInteriorBoxes(ctx: PlannerRoomStarterContext): {
  ix0: number;
  iy0: number;
  iw: number;
  ih: number;
} {
  const ax = ctx.plannerRoomPageAnchor?.x ?? DEFAULT_PLANNER_ROOM_PAGE_ANCHOR.x;
  const ay = ctx.plannerRoomPageAnchor?.y ?? DEFAULT_PLANNER_ROOM_PAGE_ANCHOR.y;
  const { w: wPx, h: hPx } = boundaryToPlannerShellPageSize(ctx.boundary);
  /** Full LU shell extents (minus tiny floor clamp) · no authoring gutter that shrinks the physical pack rectangle. */
  return {
    ix0: ax,
    iy0: ay,
    iw: Math.max(PLANNER_PAGE_SCALE * 6, wPx),
    ih: Math.max(PLANNER_PAGE_SCALE * 6, hPx),
  };
}

function gapPx(boundary: RoomSetLayoutBoundary): number {
  const minLu = Math.min(boundary.widthLu, boundary.depthLu);
  const gapLu = Math.max(2, Math.min(8, Math.round(minLu / 16)));
  return gapLu * PLANNER_PAGE_SCALE;
}

function px(lu: number): number {
  return lu * PLANNER_PAGE_SCALE;
}

/** Per-edge LU gutter from outer shell walls before packing — geometry only · density tiers (no aisles/stage overlays). */
function shellWallClearanceInsetLu(densityPreference: RoomSetDensityPreference | undefined): number {
  const d = densityPreference ?? "balanced";
  if (d === "premium") return 1.75;
  if (d === "compact") return 0.5;
  return 1;
}

/**
 * Inner placement rect clipped from the planner shell interior — decreases only · overlap/pack rules unchanged.
 *
 * Caps symmetrically so callers never invert width/height when the shell is tight.
 */
function applyShellWallClearanceInsetRect(
  rect: Readonly<{ ix0: number; iy0: number; iw: number; ih: number }>,
  requestedInsetPx: number,
): { ix0: number; iy0: number; iw: number; ih: number } {
  const minSpan = PLANNER_PAGE_SCALE * 6;
  const maxInset = Math.min(Math.max(rect.iw - minSpan, 0) / 2, Math.max(rect.ih - minSpan, 0) / 2);
  const insetPx = clampNumber(requestedInsetPx, 0, maxInset);
  return {
    ix0: rect.ix0 + insetPx,
    iy0: rect.iy0 + insetPx,
    iw: rect.iw - insetPx * 2,
    ih: rect.ih - insetPx * 2,
  };
}

/** Banquet circulation tuning — `accessiblePackInsetLu` is explicit single-edge inset (+ visible guides), not stacked on phantom perimeters. */
function banquetMarginsFromDensity(
  densityPreference: RoomSetDensityPreference | undefined,
  accessibilityPriority: boolean,
): Readonly<{
  centerAisleLu: number;
  sideAisleLu: number;
  tableGapLu: number;
  /** LU inset per edge before table packing — only enabled with accessibilityPriority (shown on canvas). */
  accessiblePackInsetLu: number;
  seatingLeadLu: number;
  rearServiceLu: number;
  scanStepLu: number;
  /** Added to banquet grid pitch — grid was pull-dominated; this makes presets visibly distinct. */
  gridPitchExtraLu: number;
  /** Multiplier vs requested headcount for table count (premium &lt; 1 frees negative space intentionally). */
  targetSeatBudgetMultiplier: number;
}> {
  const d = densityPreference ?? "balanced";
  const base =
    d === "premium"
      ? {
          centerAisleLu: 8.75,
          sideAisleLu: 5,
          tableGapLu: 3,
          accessiblePackInsetLu: 0,
          seatingLeadLu: 6,
          rearServiceLu: 12,
          scanStepLu: 1.65,
          /** ~34 px @ 8px/LU widens anchors beyond envelope-only pitch */
          gridPitchExtraLu: 4.25,
          targetSeatBudgetMultiplier: 0.875,
        }
      : d === "compact"
        ? {
            centerAisleLu: 4.5,
            sideAisleLu: 2.35,
            tableGapLu: 1,
            accessiblePackInsetLu: 0,
            seatingLeadLu: 2.1,
            rearServiceLu: 4,
            scanStepLu: 0.9,
            gridPitchExtraLu: 0,
            targetSeatBudgetMultiplier: 1,
          }
        : {
            centerAisleLu: 6,
            sideAisleLu: 3.35,
            tableGapLu: 2,
            accessiblePackInsetLu: 0,
            seatingLeadLu: 3.5,
            rearServiceLu: 6.75,
            scanStepLu: 1.2,
            gridPitchExtraLu: 0,
            targetSeatBudgetMultiplier: 1,
          };
  if (!accessibilityPriority) return base;
  return {
    centerAisleLu: base.centerAisleLu + 1,
    sideAisleLu: base.sideAisleLu + 0.85,
    tableGapLu: base.tableGapLu + 0.35,
    /** Single transparent shell inset paired with dashed reserve overlays near room edges. */
    accessiblePackInsetLu: 2,
    seatingLeadLu: base.seatingLeadLu + 0.75,
    rearServiceLu: base.rearServiceLu + 1,
    scanStepLu: Math.min(base.scanStepLu + 0.35, 2),
    gridPitchExtraLu: base.gridPitchExtraLu + 0.35,
    targetSeatBudgetMultiplier: base.targetSeatBudgetMultiplier,
  };
}

/** Modeled seat target for UI / caps — premium uses `targetSeatBudgetMultiplier` for breathing room. */
export function computeBanquetPackModeledSeatBudget(
  targetSeats: number,
  densityPreference: RoomSetDensityPreference | undefined,
  accessibilityPriority: boolean | undefined,
): number {
  const n = clampNumber(targetSeats, 1, 1200);
  const dens = banquetMarginsFromDensity(densityPreference, accessibilityPriority === true);
  return dens.targetSeatBudgetMultiplier < 1 - 1e-6
    ? Math.max(8, Math.floor((n * dens.targetSeatBudgetMultiplier) / 8) * 8)
    : n;
}

/** Banquet seating band: discrete table column anchors (same pitch as legacy left-to-right scan). */
function collectBanquetSlotLeftEdges(
  gridX0: number,
  colPitch: number,
  fpW: number,
  gridX1: number,
): number[] {
  const tol = 1e-3;
  const xs: number[] = [];
  for (let x = gridX0; x + fpW <= gridX1 + tol; x += colPitch) {
    xs.push(x);
  }
  return xs;
}

function collectBanquetRowTopEdges(
  seatingTop: number,
  rowPitch: number,
  fpH: number,
  seatingBottom: number,
): number[] {
  const tol = 1e-3;
  const ys: number[] = [];
  for (let y = seatingTop; y + fpH <= seatingBottom + tol; y += rowPitch) {
    ys.push(y);
  }
  return ys;
}

export type BanquetTableCandidateAudienceRankInputs = Readonly<{
  tableLeftPx: number;
  tableTopPx: number;
  fpWpx: number;
  fpHpx: number;
  packTopPx: number;
  audienceTopHintPx: number;
  roomCenterXPx: number;
  stageBox: Readonly<{ x: number; y: number; w: number; h: number }> | null;
  screenBox: Readonly<{ x: number; y: number; w: number; h: number }> | null;
  densityTier: RoomSetDensityPreference;
}>;

/**
 * Deterministic banquet audience-intent ranking for table anchors · lower sorts earlier.
 *
 * Ranking only — overlap/pack bounds still admit any physically valid slot when capacity demands it.
 */
export function banquetCandidateRankWeight(a: BanquetTableCandidateAudienceRankInputs): number {
  const cx = a.tableLeftPx + a.fpWpx * 0.5;
  const cy = a.tableTopPx + a.fpHpx * 0.5;

  let focusDownY = Math.max(a.packTopPx, a.audienceTopHintPx);
  if (a.stageBox !== null)
    focusDownY = Math.max(focusDownY, a.stageBox.y + a.stageBox.h);
  if (a.screenBox !== null)
    focusDownY = Math.max(focusDownY, a.screenBox.y + a.screenBox.h);

  const focusCx =
    a.stageBox !== null ? a.stageBox.x + a.stageBox.w * 0.5 : a.roomCenterXPx;

  const depthFwd = cy - focusDownY;
  const upstageOfFocusLine = Math.max(0, focusDownY - cy);
  /** Soft push for anchors north/upstage of the FOH/stack line — avoids “behind FOH” first without hard zones. */
  const upstageTerm = upstageOfFocusLine * 12;

  const lateralAbs = Math.abs(cx - focusCx);

  let wing = false;
  if (a.stageBox !== null) {
    const sx0 = a.stageBox.x;
    const sx1 = a.stageBox.x + a.stageBox.w;
    wing = cx < sx0 || cx > sx1;
  }

  let depthK: number;
  let latK: number;
  let wingK: number;
  switch (a.densityTier) {
    case "compact":
      depthK = 1;
      latK = 0.5;
      wingK = 0.38;
      break;
    case "premium":
      depthK = 1.06;
      latK = 2.05;
      wingK = 2.95;
      break;
    case "balanced":
    default:
      depthK = 1;
      latK = 1.08;
      wingK = 1.58;
      break;
  }

  return upstageTerm + depthFwd * depthK + lateralAbs * latK + (wing ? wingK * a.fpWpx : 0);
}

function placePlanner(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  componentId: RoomSetComponentId,
  left: number,
  top: number,
  label?: string,
  size?: Readonly<{ w: number; h: number }>,
  options?: Readonly<{
    rotationDeg?: number;
    reserveSpacing?: boolean;
    ignoreCollisions?: boolean;
    commitCollisionBox?: boolean;
    /** When reserveSpacing applies, replaces catalog-derived spacing (banquet packs use service pull only). */
    spacingPx?: number;
    /** Dev-only — does not change accept/reject decision */
    onPlacementReject?: (detail: PackPlannerRejectPayload) => void;
  }>,
): boolean {
  const { w, h } = size ?? plannerFootprint(componentId);
  /** Default is physical footprint only; spacing halos opt-in via `reserveSpacing: true`. */
  let spacing = 0;
  if (options?.reserveSpacing === true) {
    spacing =
      typeof options?.spacingPx === "number"
        ? options.spacingPx
        : componentSpacingPx(componentId);
  }
  const candidate: Box = {
    x: left - spacing,
    y: top - spacing,
    w: w + spacing * 2,
    h: h + spacing * 2,
  };
  const packClipPage: Box = { x: ix0, y: iy0, w: iw, h: ih };
  const tol = 0.005;
  if (
    candidate.x < ix0 - tol ||
    candidate.y < iy0 - tol ||
    candidate.x + candidate.w > ix0 + iw + tol ||
    candidate.y + candidate.h > iy0 + ih + tol
  ) {
    options?.onPlacementReject?.({
      reason: "candidate_out_of_pack_bounds",
      candidate,
      packClipPage,
      componentId,
    });
    return false;
  }
  if (!options?.ignoreCollisions) {
    for (let pi = 0; pi < placed.length; pi += 1) {
      const prior = placed[pi]!;
      if (!overlap(candidate, prior)) continue;
      options?.onPlacementReject?.({
        reason: "overlap_prior_placed_collision_box",
        candidate,
        prior,
        priorIndex: pi,
        componentId,
      });
      return false;
    }
  }

  const id = insertPlannerComponentAtPage(editor, componentId, left, top, {
    label,
    rotationDeg: options?.rotationDeg,
  });
  if (!id) {
    options?.onPlacementReject?.({
      reason: "editor_insert_failed_or_empty",
      componentId,
      anchor: { x: left, y: top },
    });
    return false;
  }
  if (size) {
    const current = editor.getShape(id);
    if (current && isPlannerTldrawShapeType(current.type)) {
      editor.updateShape({
        id,
        type: current.type,
        props: {
          ...current.props,
          w: size.w,
          h: size.h,
        },
      });
    }
  }
  ids.push(id);
  if (options?.commitCollisionBox !== false) placed.push(candidate);
  return true;
}

function secondaryPlacementBandDepthPx(
  componentId: RoomSetComponentId,
  clusterCount: number,
): Readonly<{ sideBandPx: number; rearBandPx: number; frontBandPx: number }> {
  const fp = plannerFootprint(componentId);
  const scale = clampNumber(Math.ceil(clusterCount / 4), 1, 3);
  return {
    sideBandPx: Math.max(fp.w * (1.85 + scale * 0.35), px(14)),
    rearBandPx: Math.max(fp.h * (1.95 + scale * 0.35), px(14)),
    frontBandPx: Math.max(fp.h * (1.85 + scale * 0.3), px(12)),
  };
}

function secondaryPlacementBands(
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  componentId: RoomSetComponentId,
  clusterCount: number,
  placementPreference: RoomSetPlannerPlacementPreference,
): readonly Box[] {
  const { sideBandPx, rearBandPx, frontBandPx } = secondaryPlacementBandDepthPx(componentId, clusterCount);
  switch (placementPreference) {
    case "front":
      return [{ x: ix0, y: iy0, w: iw, h: frontBandPx }];
    case "side":
      return [
        { x: ix0, y: iy0, w: sideBandPx, h: ih },
        { x: ix0 + iw - sideBandPx, y: iy0, w: sideBandPx, h: ih },
      ];
    case "rear":
      return [{ x: ix0, y: iy0 + ih - rearBandPx, w: iw, h: rearBandPx }];
    case "perimeter":
      return [
        { x: ix0, y: iy0, w: sideBandPx, h: ih },
        { x: ix0 + iw - sideBandPx, y: iy0, w: sideBandPx, h: ih },
        { x: ix0, y: iy0 + ih - rearBandPx, w: iw, h: rearBandPx },
      ];
    case "mixed":
    default: {
      const sideNarrow = sideBandPx * 0.72;
      const rearNarrow = rearBandPx * 0.72;
      return [
        { x: ix0, y: iy0, w: sideNarrow, h: ih },
        { x: ix0 + iw - sideNarrow, y: iy0, w: sideNarrow, h: ih },
        { x: ix0, y: iy0 + ih - rearNarrow, w: iw, h: rearNarrow },
      ];
    }
  }
}

function shrinkBanquetPackRectForSecondaryReserve(
  packIx0: number,
  packIy0: number,
  packIw: number,
  packIh: number,
  reserve: Readonly<{
    cocktailClusters: number;
    placementPreference: RoomSetPlannerPlacementPreference;
  }>,
): Readonly<{ ix0: number; iy0: number; iw: number; ih: number }> {
  const { sideBandPx, rearBandPx, frontBandPx } = secondaryPlacementBandDepthPx(
    "table-cocktail-cluster",
    reserve.cocktailClusters,
  );
  switch (reserve.placementPreference) {
    case "front":
      return {
        ix0: packIx0,
        iy0: packIy0 + frontBandPx,
        iw: packIw,
        ih: Math.max(PLANNER_PAGE_SCALE * 4, packIh - frontBandPx),
      };
    case "side":
      return {
        ix0: packIx0 + sideBandPx,
        iy0: packIy0,
        iw: Math.max(PLANNER_PAGE_SCALE * 4, packIw - sideBandPx * 2),
        ih: packIh,
      };
    case "rear":
      return {
        ix0: packIx0,
        iy0: packIy0,
        iw: packIw,
        ih: Math.max(PLANNER_PAGE_SCALE * 4, packIh - rearBandPx),
      };
    case "perimeter":
      return {
        ix0: packIx0 + sideBandPx,
        iy0: packIy0,
        iw: Math.max(PLANNER_PAGE_SCALE * 4, packIw - sideBandPx * 2),
        ih: Math.max(PLANNER_PAGE_SCALE * 4, packIh - rearBandPx),
      };
    case "mixed":
    default: {
      const sideNarrow = sideBandPx * 0.72;
      const rearNarrow = rearBandPx * 0.72;
      return {
        ix0: packIx0 + sideNarrow,
        iy0: packIy0,
        iw: Math.max(PLANNER_PAGE_SCALE * 4, packIw - sideNarrow * 2),
        ih: Math.max(PLANNER_PAGE_SCALE * 4, packIh - rearNarrow),
      };
    }
  }
}

function collectPlannerCollisionBoxesFromEditor(editor: Editor): Readonly<{
  placedCollisionBoxes: Box[];
  placedIds: TLShapeId[];
}> {
  const placedCollisionBoxes: Box[] = [];
  const placedIds: TLShapeId[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type === PLANNER_ROOM_SHELL_SHAPE_TYPE) continue;
    if (!isPlannerTldrawShapeType(shape.type)) continue;
    const bounds = editor.getShapePageBounds(shape);
    if (!bounds) continue;
    placedCollisionBoxes.push({ x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h });
    placedIds.push(shape.id);
  }
  return { placedCollisionBoxes, placedIds };
}

function cellCenterInBand(left: number, top: number, fpW: number, fpH: number, band: Box): boolean {
  const cx = left + fpW * 0.5;
  const cy = top + fpH * 0.5;
  return cx >= band.x && cx <= band.x + band.w && cy >= band.y && cy <= band.y + band.h;
}

type SecondaryBandGridCell = Readonly<{ l: number; t: number; bandIndex: number }>;

function distributeCountsAcrossBands(total: number, bandCount: number): number[] {
  if (bandCount <= 0 || total <= 0) return [];
  const quotas = Array.from({ length: bandCount }, () => 0);
  for (let i = 0; i < total; i += 1) quotas[i % bandCount]! += 1;
  return quotas;
}

function pickEvenlySpacedAlongAxis<T>(
  cells: readonly T[],
  take: number,
  axis: (cell: T) => number,
): T[] {
  if (take <= 0 || cells.length === 0) return [];
  const sorted = [...cells].sort((a, b) => axis(a) - axis(b));
  if (take >= sorted.length) return sorted;
  const picked: T[] = [];
  for (let i = 0; i < take; i += 1) {
    const idx = Math.min(sorted.length - 1, Math.floor(((i + 0.5) * sorted.length) / take));
    picked.push(sorted[idx]!);
  }
  return picked;
}

function interleaveBandCandidates(
  perBand: readonly SecondaryBandGridCell[][],
): SecondaryBandGridCell[] {
  const out: SecondaryBandGridCell[] = [];
  const maxLen = perBand.reduce((peak, row) => Math.max(peak, row.length), 0);
  for (let slot = 0; slot < maxLen; slot += 1) {
    for (let bi = 0; bi < perBand.length; bi += 1) {
      const cell = perBand[bi]?.[slot];
      if (cell) out.push(cell);
    }
  }
  return out;
}

function collectSecondaryBandGridCells(
  band: Box,
  bandIndex: number,
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  gp: number,
  fp: Readonly<{ w: number; h: number }>,
  pitchX: number,
  pitchY: number,
): SecondaryBandGridCell[] {
  const bandInnerW = Math.max(PLANNER_PAGE_SCALE * 2, band.w - gp * 2);
  const bandInnerH = Math.max(PLANNER_PAGE_SCALE * 2, band.h - gp * 2);
  const nx = Math.max(1, Math.floor(bandInnerW / pitchX));
  const ny = Math.max(1, Math.floor(bandInnerH / pitchY));
  const slackX = bandInnerW - nx * pitchX;
  const slackY = bandInnerH - ny * pitchY;
  const originX = band.x + gp + slackX / 2;
  const originY = band.y + gp + slackY / 2;
  const cells: SecondaryBandGridCell[] = [];
  for (let jIdx = 0; jIdx < ny; jIdx += 1) {
    for (let iIdx = 0; iIdx < nx; iIdx += 1) {
      const lPeak = originX + iIdx * pitchX;
      const tPeak = originY + jIdx * pitchY;
      if (lPeak + fp.w > ix0 + iw + 0.01 || tPeak + fp.h > iy0 + ih + 0.01) continue;
      if (lPeak < ix0 - 0.01 || tPeak < iy0 - 0.01) continue;
      if (!cellCenterInBand(lPeak, tPeak, fp.w, fp.h, band)) continue;
      cells.push({ l: lPeak, t: tPeak, bandIndex });
    }
  }
  return cells;
}

function spreadAxisForBand(band: Box): (cell: SecondaryBandGridCell) => number {
  return band.h >= band.w ? (cell) => cell.t : (cell) => cell.l;
}

function placePromptSecondaryComponentsInBands(
  editor: Editor,
  ctx: PlannerRoomStarterContext,
  densityPreference: RoomSetDensityPreference | undefined,
  idsWorking: TLShapeId[],
  placedWorking: Box[],
  directive: PlannerComponentPlacementDirective,
): number {
  if (directive.count <= 0) return 0;

  const shellInterior = starterInteriorBoxes(ctx);
  const wallInsetPx = px(shellWallClearanceInsetLu(densityPreference));
  const { ix0, iy0, iw, ih } = applyShellWallClearanceInsetRect(shellInterior, wallInsetPx);
  const bands = secondaryPlacementBands(
    ix0,
    iy0,
    iw,
    ih,
    directive.componentId,
    directive.count,
    directive.placementPreference,
  );

  const boundary = ctx.boundary;
  const gp = gapPx(boundary);
  const fp = plannerFootprint(directive.componentId);
  const pitchGapPx = px(1.35);
  const pitchX = Math.max(fp.w + pitchGapPx, fp.w + 1e-3);
  const pitchY = Math.max(fp.h + pitchGapPx, fp.h + 1e-3);

  const quotas = distributeCountsAcrossBands(directive.count, bands.length);
  const perBandPicks: SecondaryBandGridCell[][] = [];
  for (let bi = 0; bi < bands.length; bi += 1) {
    const band = bands[bi]!;
    const quota = quotas[bi] ?? 0;
    const bandCells = collectSecondaryBandGridCells(
      band,
      bi,
      ix0,
      iy0,
      iw,
      ih,
      gp,
      fp,
      pitchX,
      pitchY,
    );
    perBandPicks.push(
      pickEvenlySpacedAlongAxis(bandCells, quota, spreadAxisForBand(band)),
    );
  }

  const placementOrder =
    bands.length > 1 &&
    (directive.placementPreference === "perimeter" || directive.placementPreference === "mixed")
      ? interleaveBandCandidates(perBandPicks)
      : perBandPicks.flat();

  let acceptedPeek = 0;
  for (const cellPeek of placementOrder) {
    if (acceptedPeek >= directive.count) break;
    const okPeek = placePlanner(
      editor,
      idsWorking,
      placedWorking,
      ix0,
      iy0,
      iw,
      ih,
      directive.componentId,
      cellPeek.l,
      cellPeek.t,
      promptSecondaryShapeLabel(directive, acceptedPeek + 1),
      undefined,
      { reserveSpacing: false },
    );
    if (okPeek) acceptedPeek += 1;
  }

  if (acceptedPeek < directive.count) {
    const fallbackCells: SecondaryBandGridCell[] = [];
    for (let bi = 0; bi < bands.length; bi += 1) {
      fallbackCells.push(
        ...collectSecondaryBandGridCells(bands[bi]!, bi, ix0, iy0, iw, ih, gp, fp, pitchX, pitchY),
      );
    }
    fallbackCells.sort(
      (a, b) => spreadAxisForBand(bands[a.bandIndex]!)(a) - spreadAxisForBand(bands[b.bandIndex]!)(b),
    );
    for (const cellPeek of fallbackCells) {
      if (acceptedPeek >= directive.count) break;
      const okPeek = placePlanner(
        editor,
        idsWorking,
        placedWorking,
        ix0,
        iy0,
        iw,
        ih,
        directive.componentId,
        cellPeek.l,
        cellPeek.t,
        promptSecondaryShapeLabel(directive, acceptedPeek + 1),
        undefined,
        { reserveSpacing: false },
      );
      if (okPeek) acceptedPeek += 1;
    }
  }

  return acceptedPeek;
}

function promptSecondaryShapeLabel(
  directive: PlannerComponentPlacementDirective,
  ordinal: number,
): string {
  const label = getRoomSetComponent(directive.componentId)?.label ?? directive.labelNoun;
  return `${label} (prompt) ${ordinal}`;
}

function appendPromptSecondaryPlacementSummary(
  lines: string[],
  directive: PlannerComponentPlacementDirective,
  accepted: number,
): void {
  if (directive.count <= 0) return;
  if (accepted === directive.count) {
    lines.push(`Prompt added ${accepted} ${directive.labelNoun}.`);
    return;
  }
  if (accepted > 0) {
    lines.push(`Placed ${accepted}/${directive.count} ${directive.labelNoun} due to available space.`);
    return;
  }
  lines.push(
    `Prompt requested ${directive.count} ${directive.labelNoun}; none fit without overlapping shell walls or seated layout.`,
  );
}

function isKnownRoomSetComponentId(value: unknown): value is RoomSetComponentId {
  return typeof value === "string" && getRoomSetComponent(value) != null;
}

function shapeComponentId(shape: ReturnType<Editor["getCurrentPageShapes"]>[number]): RoomSetComponentId | null {
  if (!isPlannerTldrawShapeType(shape.type)) return null;
  const props = shape.props as { componentId?: unknown };
  return isKnownRoomSetComponentId(props.componentId) ? props.componentId : null;
}

function dominantPrimarySeatingComponentId(editor: Editor): RoomSetComponentId {
  const tableCounts = new Map<RoomSetComponentId, number>();
  for (const id of TABLE_COMPONENT_IDS) {
    const n = collectMatchingPlannerShapes(editor, [id]).length;
    if (n > 0) tableCounts.set(id, n);
  }
  if (tableCounts.size > 0) {
    return [...tableCounts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  }
  return dominantExistingChairRowComponentId(editor);
}

function dominantExistingChairRowComponentId(editor: Editor): RoomSetComponentId {
  let theaterRows = 0;
  let classroomRows = 0;
  for (const shape of editor.getCurrentPageShapes()) {
    const componentId = shapeComponentId(shape);
    if (componentId === "seating-classroom-row") classroomRows += 1;
    if (componentId === "seating-theater-row") theaterRows += 1;
  }
  return classroomRows > theaterRows ? "seating-classroom-row" : "seating-theater-row";
}

function countFromPrompt(text: string): number | null {
  const match = text.match(/\b(\d{1,2})\b/);
  if (!match?.[1]) return null;
  const count = Number(match[1]);
  return Number.isFinite(count) && count > 0 ? Math.round(count) : null;
}

function promptSourceComponentIds(text: string): readonly RoomSetComponentId[] {
  if (/\b(?:chairs?|chair\s+rows?|rows?\s+of\s+chairs?|theater\s+rows?|classroom\s+rows?|seating\s+rows?)\b/i.test(text)) {
    return CHAIR_ROW_COMPONENT_IDS;
  }
  if (/\b(?:cocktail\s+(?:tables?|clusters?)|highboys?|mingle\s+clusters?)\b/i.test(text)) {
    return COCKTAIL_COMPONENT_IDS;
  }
  if (/\b(?:plants?|plantes?|planters?|plant\s+clusters?|greenery|scenic\s+plants?)\b/i.test(text)) {
    return ["decor-plant-cluster"];
  }
  if (/\b(?:tables?|banquet\s+tables?|rounds?)\b/i.test(text)) {
    return TABLE_COMPONENT_IDS;
  }
  if (/\b(?:bars?|bar\s+service)\b/i.test(text)) return ["fnb-portable-bar"];
  if (/\b(?:buffets?|buffet\s+(?:lines?|stations?)|food\s+stations?)\b/i.test(text)) return ["fnb-buffet-line"];
  if (/\b(?:registration|check-?in)\b/i.test(text)) return ["registration-desk", "registration-kiosk"];
  if (/\b(?:lounge|soft\s+seating)\b/i.test(text)) return ["lounge-chair"];
  return [];
}

function promptTargetComponentId(text: string, editor: Editor): RoomSetComponentId | null {
  const promptPrimary = inferPrimarySeatingComponentFromPrompt(text);
  if (promptPrimary) return promptPrimary;
  if (/\b(?:rows?\s+of\s+chairs?|chairs?|chair\s+rows?|theater\s+rows?)\b/i.test(text)) {
    return dominantExistingChairRowComponentId(editor);
  }
  if (/\b(?:classroom\s+rows?|desk\s+rows?)\b/i.test(text)) return "seating-classroom-row";
  if (/\b(?:round\s+tables?|banquet\s+tables?|rounds?)\b/i.test(text)) return "table-round-60";
  if (/\b(?:cocktail\s+(?:tables?|clusters?)|highboys?|mingle\s+clusters?)\b/i.test(text)) {
    return "table-cocktail-cluster";
  }
  if (/\b(?:plants?|plantes?|planters?|plant\s+clusters?|greenery|scenic\s+plants?)\b/i.test(text)) {
    return "decor-plant-cluster";
  }
  if (/\b(?:tables?|banquet\s+tables?)\b/i.test(text)) return "table-banquet-6ft";
  if (/\b(?:bars?|bar\s+service)\b/i.test(text)) return "fnb-portable-bar";
  if (/\b(?:buffets?|buffet\s+(?:lines?|stations?)|food\s+stations?)\b/i.test(text)) return "fnb-buffet-line";
  if (/\b(?:registration|check-?in)\b/i.test(text)) return "registration-desk";
  if (/\b(?:lounge|soft\s+seating)\b/i.test(text)) return "lounge-chair";
  return null;
}

export function inferRoomSetPlannerEditIntentKinds(prompt: string): readonly RoomSetPlannerEditIntentKind[] {
  const text = prompt.trim();
  if (!text) return [];
  const kinds = new Set<RoomSetPlannerEditIntentKind>();
  if (/\b(?:change|convert|turn)\b[\s\S]{0,40}\b(?:networking\s+reception|general\s+session|awards?\s+dinner|banquet|classroom|training|workshop|town\s+hall|expo)\b/i.test(text)) {
    kinds.add("changeArchetype");
  }
  if (
    inferCapacityTargetFromPrompt(text) != null ||
    /\b(?:reduce|increase|change|set|make|raise|lower)\b[\s\S]{0,40}\b(?:to\s+)?\d{1,4}\s+(?:attendees?|guests?|people|pax|seats?|capacity)\b/i.test(
      text,
    )
  ) {
    kinds.add("changeCapacity");
  }
  if (/\bspread\b[\s\S]{0,40}\b(?:out\b|the\s+)?(?:tables?|rounds?|seating)\b/i.test(text)) {
    kinds.add("spreadSeating");
  }
  if (
    (/\b(?:center|centre|centered|centred)\b/i.test(text) &&
      /\b(?:symmetric|symmetrical|evenly)\b/i.test(text)) ||
    /\b(?:center|centre)\b[\s\S]{0,48}\b(?:symmetric|symmetrical)\b/i.test(text)
  ) {
    kinds.add("reflowSymmetric");
  }
  if (/\b(?:replace|swap)\b/i.test(text) || /\bnot\b[\s\S]{0,32}\b(?:chairs?|tables?)\b/i.test(text) || /\bremove\b[\s\S]{0,80}\bgive me\b/i.test(text)) {
    kinds.add("replaceComponent");
  }
  if (/\b(?:move|relocate|shift)\b/i.test(text)) kinds.add("moveComponent");
  if (/\b(?:remove|delete)\b/i.test(text) && !kinds.has("replaceComponent")) kinds.add("removeComponent");
  if (/\b(?:add|insert|place|put|give me)\b/i.test(text) && !kinds.has("replaceComponent")) kinds.add("addComponent");
  if (/\b(?:more|additional|extra)\s+rows?\b/i.test(text)) kinds.add("expandSeating");
  if (/\b(?:fewer|less|reduce)\s+(?:rows?|chairs?|seats?)\b/i.test(text)) kinds.add("reduceSeating");
  return [...kinds];
}

function buildReplaceComponentIntents(
  text: string,
  editor: Editor,
  placementPreference: RoomSetPlannerPlacementPreference,
): PlannerPromptEditIntent[] {
  if (/\bnot\b/i.test(text)) {
    const [targetText = text, sourceText = text] = text.split(/\bnot\b/i, 2);
    const sourceComponentIds = promptSourceComponentIds(sourceText);
    const targetComponentId = promptTargetComponentId(targetText, editor);
    if (sourceComponentIds.length && targetComponentId) {
      return [{ kind: "replaceComponent", sourceComponentIds, targetComponentId, placementPreference }];
    }
  }

  if (/\bremove\b[\s\S]{0,80}\bgive me\b/i.test(text)) {
    const [sourceText = text, targetText = text] = text.split(/\bgive me\b/i, 2);
    const sourceComponentIds = promptSourceComponentIds(sourceText);
    const targetComponentId = promptTargetComponentId(targetText, editor);
    if (sourceComponentIds.length && targetComponentId) {
      return [{ kind: "replaceComponent", sourceComponentIds, targetComponentId, placementPreference }];
    }
  }

  const [sourceText, targetText = text] = text.split(/\b(?:with|to|instead)\b/i, 2);
  const sourceComponentIds = promptSourceComponentIds(sourceText || text);
  const targetComponentId = promptTargetComponentId(targetText, editor);
  if (sourceComponentIds.length && targetComponentId) {
    return [{ kind: "replaceComponent", sourceComponentIds, targetComponentId, placementPreference }];
  }

  const fallbackTargetComponentId = promptTargetComponentId(text, editor);
  const fallbackSourceComponentIds =
    fallbackTargetComponentId && TABLE_COMPONENT_IDS.includes(fallbackTargetComponentId as (typeof TABLE_COMPONENT_IDS)[number])
      ? CHAIR_ROW_COMPONENT_IDS
      : fallbackTargetComponentId && CHAIR_ROW_COMPONENT_IDS.includes(fallbackTargetComponentId as (typeof CHAIR_ROW_COMPONENT_IDS)[number])
        ? TABLE_COMPONENT_IDS
        : [];
  return fallbackTargetComponentId && fallbackSourceComponentIds.length
    ? [{ kind: "replaceComponent", sourceComponentIds: fallbackSourceComponentIds, targetComponentId: fallbackTargetComponentId, placementPreference }]
    : [];
}

function inferPlannerPromptEditIntents(
  prompt: string,
  editor: Editor,
  authoritativePrimarySeating?: RoomSetComponentId,
): PlannerPromptEditIntent[] {
  const text = prompt.trim();
  if (!text) return [];
  const placementPreference =
    inferPlacementPreferenceFromPrompt(text) ??
    (/\bmore\s+rows?\b/i.test(text) ? "rear" : "mixed");
  const count = countFromPrompt(text);
  const kinds = inferRoomSetPlannerEditIntentKinds(text);
  const intents: PlannerPromptEditIntent[] = [];

  if (kinds.includes("replaceComponent")) {
    intents.push(...buildReplaceComponentIntents(text, editor, placementPreference));
  }

  if (kinds.includes("removeComponent")) {
    const sourceComponentIds = promptSourceComponentIds(text);
    if (sourceComponentIds.length) {
      intents.push({ kind: "removeComponent", sourceComponentIds, placementPreference });
    }
  }

  if (kinds.includes("changeCapacity")) {
    const target = inferCapacityTargetFromPrompt(text);
    if (target) {
      intents.push({
        kind: "changeCapacity",
        sourceComponentIds: [...TABLE_COMPONENT_IDS, ...CHAIR_ROW_COMPONENT_IDS],
        count: target,
        placementPreference,
      });
    }
  }

  if (kinds.includes("reflowSymmetric")) {
    const hasTables = collectMatchingPlannerShapes(editor, TABLE_COMPONENT_IDS).length > 0;
    const sourceComponentIds = hasTables
      ? TABLE_COMPONENT_IDS
      : authoritativePrimarySeating
        ? [authoritativePrimarySeating]
        : TABLE_COMPONENT_IDS;
    intents.push({ kind: "reflowSymmetric", sourceComponentIds, placementPreference });
  }

  if (kinds.includes("spreadSeating")) {
    intents.push({
      kind: "spreadSeating",
      sourceComponentIds: TABLE_COMPONENT_IDS,
      placementPreference,
    });
  }

  if (kinds.includes("moveComponent")) {
    const sourceComponentIds = promptSourceComponentIds(text);
    if (sourceComponentIds.length) {
      intents.push({ kind: "moveComponent", sourceComponentIds, placementPreference });
    }
  }

  if (kinds.includes("expandSeating")) {
    intents.push({
      kind: "expandSeating",
      sourceComponentIds: [],
      targetComponentId: authoritativePrimarySeating ?? dominantExistingChairRowComponentId(editor),
      count: clampNumber(count ?? 1, 1, 24),
      placementPreference,
    });
  }

  if (kinds.includes("reduceSeating")) {
    intents.push({
      kind: "reduceSeating",
      sourceComponentIds: CHAIR_ROW_COMPONENT_IDS,
      count: clampNumber(count ?? 1, 1, 24),
      placementPreference,
    });
  }

  if (kinds.includes("addComponent")) {
    const additiveCount = clampNumber(inferAdditiveCountFromPrompt(text) ?? count ?? 1, 1, 48);
    const sourceIds = promptSourceComponentIds(text);
    const targetFromPrompt = promptTargetComponentId(text, editor);
    if (targetFromPrompt && !CHAIR_ROW_COMPONENT_IDS.includes(targetFromPrompt as (typeof CHAIR_ROW_COMPONENT_IDS)[number])) {
      intents.push({
        kind: "addComponent",
        sourceComponentIds: [],
        targetComponentId: targetFromPrompt,
        count: additiveCount,
        placementPreference,
      });
    } else {
      for (const componentId of sourceIds) {
        if (CHAIR_ROW_COMPONENT_IDS.includes(componentId as (typeof CHAIR_ROW_COMPONENT_IDS)[number])) continue;
        intents.push({
          kind: "addComponent",
          sourceComponentIds: [],
          targetComponentId: componentId,
          count: additiveCount,
          placementPreference,
        });
      }
    }
  }

  return intents;
}

type MatchingPlannerShape = Readonly<{
  id: TLShapeId;
  componentId: RoomSetComponentId;
  x: number;
  y: number;
  rotationDeg: number;
}>;

function collectMatchingPlannerShapes(
  editor: Editor,
  componentIds: readonly RoomSetComponentId[],
): MatchingPlannerShape[] {
  const wanted = new Set(componentIds);
  const out: MatchingPlannerShape[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    const componentId = shapeComponentId(shape);
    if (!componentId || !wanted.has(componentId)) continue;
    const bounds = editor.getShapePageBounds(shape);
    out.push({
      id: shape.id,
      componentId,
      x: bounds?.x ?? shape.x,
      y: bounds?.y ?? shape.y,
      rotationDeg: typeof shape.rotation === "number" ? (shape.rotation * 180) / Math.PI : 0,
    });
  }
  return out;
}

function replacementCountForIntent(
  intent: PlannerPromptEditIntent,
  requestedAttendees: number,
  fallbackCount: number,
): number {
  if (!intent.targetComponentId) return fallbackCount;
  const capacity = seatedCapacityForComponent(intent.targetComponentId);
  if (capacity > 0 && intent.sourceComponentIds.some((componentId) => CHAIR_ROW_COMPONENT_IDS.includes(componentId as (typeof CHAIR_ROW_COMPONENT_IDS)[number]))) {
    return clampNumber(Math.ceil(clampNumber(requestedAttendees, 1, 1200) / capacity), 1, 400);
  }
  return fallbackCount;
}

function restoreMatchedPlannerShapes(editor: Editor, matches: readonly MatchingPlannerShape[]): TLShapeId[] {
  const restoredIds: TLShapeId[] = [];
  for (const match of matches) {
    const id = insertPlannerComponentAtPage(editor, match.componentId, match.x, match.y, {
      rotationDeg: match.rotationDeg,
      label: getRoomSetComponent(match.componentId)?.label,
    });
    if (id) restoredIds.push(id);
  }
  return restoredIds;
}

function sortOpenInteriorCells(
  cells: Array<Readonly<{ l: number; t: number }>>,
  placementPreference: RoomSetPlannerPlacementPreference,
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
): Array<Readonly<{ l: number; t: number }>> {
  const centerX = ix0 + iw / 2;
  const centerY = iy0 + ih / 2;
  return cells.sort((a, b) => {
    switch (placementPreference) {
      case "rear":
        return b.t - a.t || Math.abs(a.l - centerX) - Math.abs(b.l - centerX);
      case "front":
        return a.t - b.t || Math.abs(a.l - centerX) - Math.abs(b.l - centerX);
      case "side": {
        const da = Math.min(Math.abs(a.l - ix0), Math.abs(a.l - (ix0 + iw)));
        const db = Math.min(Math.abs(b.l - ix0), Math.abs(b.l - (ix0 + iw)));
        return da - db || Math.abs(a.t - centerY) - Math.abs(b.t - centerY);
      }
      case "perimeter": {
        const da = Math.min(a.l - ix0, ix0 + iw - a.l, a.t - iy0, iy0 + ih - a.t);
        const db = Math.min(b.l - ix0, ix0 + iw - b.l, b.t - iy0, iy0 + ih - b.t);
        return da - db || Math.abs(a.t - centerY) - Math.abs(b.t - centerY);
      }
      case "mixed":
      default:
        return a.t - b.t || a.l - b.l;
    }
  });
}

function placePlannerComponentsInOpenInterior(
  editor: Editor,
  ctx: PlannerRoomStarterContext,
  densityPreference: RoomSetDensityPreference | undefined,
  idsWorking: TLShapeId[],
  placedWorking: Box[],
  directive: PlannerComponentPlacementDirective,
): number {
  if (directive.count <= 0) return 0;
  const shellInterior = starterInteriorBoxes(ctx);
  const wallInsetPx = px(shellWallClearanceInsetLu(densityPreference));
  const { ix0, iy0, iw, ih } = applyShellWallClearanceInsetRect(shellInterior, wallInsetPx);
  const fp = plannerFootprint(directive.componentId);
  const gap = px(1.35);
  const stepX = Math.max(fp.w + gap, fp.w + 1e-3);
  const stepY = Math.max(fp.h + gap, fp.h + 1e-3);
  const cells: Array<Readonly<{ l: number; t: number }>> = [];

  for (let t = iy0; t <= iy0 + ih - fp.h + 0.01; t += stepY) {
    for (let l = ix0; l <= ix0 + iw - fp.w + 0.01; l += stepX) {
      cells.push({ l, t });
    }
  }

  let accepted = 0;
  for (const cell of sortOpenInteriorCells(cells, directive.placementPreference, ix0, iy0, iw, ih)) {
    if (accepted >= directive.count) break;
    const ok = placePlanner(
      editor,
      idsWorking,
      placedWorking,
      ix0,
      iy0,
      iw,
      ih,
      directive.componentId,
      cell.l,
      cell.t,
      promptSecondaryShapeLabel(directive, accepted + 1),
      undefined,
      { reserveSpacing: false },
    );
    if (ok) accepted += 1;
  }
  return accepted;
}

function appendEditPlacementSummary(
  lines: string[],
  kind: RoomSetPlannerEditIntentKind,
  targetComponentId: RoomSetComponentId,
  requested: number,
  accepted: number,
): void {
  const label = labelNounForCatalogComponent(targetComponentId);
  if (accepted === requested) {
    lines.push(`Edit intent ${kind}: placed ${accepted} ${label}.`);
    return;
  }
  if (accepted > 0) {
    lines.push(`Edit intent ${kind}: placed ${accepted}/${requested} ${label} due to available space.`);
    return;
  }
  lines.push(`Edit intent ${kind}: no ${label} fit without overlapping the current canvas.`);
}

function spreadExistingTableComponents(
  editor: Editor,
  ctx: PlannerRoomStarterContext,
  densityPreference: RoomSetDensityPreference | undefined,
  idsWorking: TLShapeId[],
  placedWorking: Box[],
): number {
  const matches = collectMatchingPlannerShapes(editor, TABLE_COMPONENT_IDS);
  if (matches.length === 0) return 0;

  const byComponentId = new Map<RoomSetComponentId, number>();
  for (const match of matches) {
    byComponentId.set(match.componentId, (byComponentId.get(match.componentId) ?? 0) + 1);
  }

  editor.deleteShapes(matches.map((shape) => shape.id));
  removeIdsFromWorking(
    idsWorking,
    matches.map((shape) => shape.id),
  );
  const refreshed = collectPlannerCollisionBoxesFromEditor(editor);
  const placedWorkingHost = [...refreshed.placedCollisionBoxes];
  const idsWorkingHost = [...refreshed.placedIds];
  let acceptedTotal = 0;

  for (const [componentId, requested] of byComponentId) {
    const directive: PlannerComponentPlacementDirective = {
      componentId,
      count: requested,
      placementPreference: "mixed",
      labelNoun: labelNounForCatalogComponent(componentId),
    };
    const shellInterior = starterInteriorBoxes(ctx);
    const wallInsetPx = px(shellWallClearanceInsetLu(densityPreference));
    const { ix0, iy0, iw, ih } = applyShellWallClearanceInsetRect(shellInterior, wallInsetPx);
    const fp = plannerFootprint(componentId);
    const gap = px(2.1);
    const stepX = Math.max(fp.w + gap, fp.w + 1e-3);
    const stepY = Math.max(fp.h + gap, fp.h + 1e-3);
    const cells: Array<Readonly<{ l: number; t: number }>> = [];
    for (let t = iy0; t <= iy0 + ih - fp.h + 0.01; t += stepY) {
      for (let l = ix0; l <= ix0 + iw - fp.w + 0.01; l += stepX) {
        cells.push({ l, t });
      }
    }
    let accepted = 0;
    for (const cell of sortOpenInteriorCells(cells, "mixed", ix0, iy0, iw, ih)) {
      if (accepted >= directive.count) break;
      const ok = placePlanner(
        editor,
        idsWorkingHost,
        placedWorkingHost,
        ix0,
        iy0,
        iw,
        ih,
        componentId,
        cell.l,
        cell.t,
        `${getRoomSetComponent(componentId)?.label ?? directive.labelNoun} (spread) ${accepted + 1}`,
        undefined,
        { reserveSpacing: false },
      );
      if (ok) accepted += 1;
    }
    acceptedTotal += accepted;
  }

  idsWorking.splice(0, idsWorking.length, ...idsWorkingHost);
  placedWorking.splice(0, placedWorking.length, ...placedWorkingHost);
  return acceptedTotal;
}

function symmetricInteriorCells(
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  fp: { w: number; h: number },
  gap: number,
): Array<{ l: number; t: number }> {
  const cx = ix0 + iw / 2;
  const cy = iy0 + ih / 2;
  const cells: Array<{ l: number; t: number }> = [];
  const stepX = Math.max(fp.w + gap, fp.w + 1e-3);
  const stepY = Math.max(fp.h + gap, fp.h + 1e-3);
  for (let t = iy0; t <= iy0 + ih - fp.h + 0.01; t += stepY) {
    for (let l = ix0; l <= ix0 + iw - fp.w + 0.01; l += stepX) {
      cells.push({ l, t });
    }
  }
  cells.sort((a, b) => {
    const da = (a.l + fp.w / 2 - cx) ** 2 + (a.t + fp.h / 2 - cy) ** 2;
    const db = (b.l + fp.w / 2 - cx) ** 2 + (b.t + fp.h / 2 - cy) ** 2;
    return da - db;
  });
  return cells;
}

function reflowSymmetricSeatingComponents(
  editor: Editor,
  ctx: PlannerRoomStarterContext,
  densityPreference: RoomSetDensityPreference | undefined,
  idsWorking: TLShapeId[],
  placedWorking: Box[],
  componentIds: readonly RoomSetComponentId[],
): number {
  const matches = collectMatchingPlannerShapes(editor, componentIds);
  if (matches.length === 0) return 0;

  const byComponentId = new Map<RoomSetComponentId, number>();
  for (const match of matches) {
    byComponentId.set(match.componentId, (byComponentId.get(match.componentId) ?? 0) + 1);
  }

  editor.deleteShapes(matches.map((shape) => shape.id));
  removeIdsFromWorking(idsWorking, matches.map((shape) => shape.id));
  const refreshed = collectPlannerCollisionBoxesFromEditor(editor);
  const placedWorkingHost = [...refreshed.placedCollisionBoxes];
  const idsWorkingHost = [...refreshed.placedIds];
  let acceptedTotal = 0;

  for (const [componentId, requested] of byComponentId) {
    const shellInterior = starterInteriorBoxes(ctx);
    const wallInsetPx = px(shellWallClearanceInsetLu(densityPreference));
    const { ix0, iy0, iw, ih } = applyShellWallClearanceInsetRect(shellInterior, wallInsetPx);
    const fp = plannerFootprint(componentId);
    const gap = px(2.1);
    const cells = symmetricInteriorCells(ix0, iy0, iw, ih, fp, gap);
    let accepted = 0;
    for (const cell of cells) {
      if (accepted >= requested) break;
      const ok = placePlanner(
        editor,
        idsWorkingHost,
        placedWorkingHost,
        ix0,
        iy0,
        iw,
        ih,
        componentId,
        cell.l,
        cell.t,
        `${getRoomSetComponent(componentId)?.label ?? labelNounForCatalogComponent(componentId)} (centered) ${accepted + 1}`,
        undefined,
        { reserveSpacing: false },
      );
      if (ok) accepted += 1;
    }
    acceptedTotal += accepted;
  }

  idsWorking.splice(0, idsWorking.length, ...idsWorkingHost);
  placedWorking.splice(0, placedWorking.length, ...placedWorkingHost);
  return acceptedTotal;
}

export function describeCanvasLayoutInventory(editor: Editor): CanvasLayoutInventory {
  const peek = collectPlannerCollisionBoxesFromEditor(editor);
  return {
    seatedCapacity: generatedSeatedCapacity(editor, peek.placedIds),
    dominantPrimarySeatingComponentId: dominantPrimarySeatingComponentId(editor),
    tableCount: collectMatchingPlannerShapes(editor, TABLE_COMPONENT_IDS).length,
    chairRowCount: collectMatchingPlannerShapes(editor, CHAIR_ROW_COMPONENT_IDS).length,
  };
}

function removeIdsFromWorking(idsWorking: TLShapeId[], idsToRemove: readonly TLShapeId[]): void {
  const removeSet = new Set(idsToRemove);
  for (let idx = idsWorking.length - 1; idx >= 0; idx -= 1) {
    if (removeSet.has(idsWorking[idx]!)) idsWorking.splice(idx, 1);
  }
}


function placePayload(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  componentId: RoomSetComponentId,
  left: number,
  top: number,
  label?: string,
  options?: Readonly<{
    rotationDeg?: number;
    ignoreCollisions?: boolean;
    commitCollisionBox?: boolean;
    onPlacementReject?: (detail: PackPlannerRejectPayload) => void;
  }>,
): boolean {
  return placePlanner(editor, ids, placed, ix0, iy0, iw, ih, componentId, left, top, label, undefined, {
    ...options,
    reserveSpacing: false,
  });
}

type FrontCue = Readonly<{
  hasScreen: boolean;
  hasStage: boolean;
  hasAv: boolean;
  audienceBaselineY: number;
  stageBox: Box | null;
  screenBox: Box | null;
}>;

function placeFrontCueStack(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  boundary: RoomSetLayoutBoundary,
  wants: Readonly<{
    screen?: RoomSetComponentId | false;
    stage?: RoomSetComponentId | false;
    av?: RoomSetComponentId | false;
    reserveMode?: "compact" | "production";
  }>,
  /** Banquet-only: trims *sightline/service* spacing above the seating band · classroom/theater leave undefined. */
  banquetSightlineDensity?: RoomSetDensityPreference,
): FrontCue {
  const gp = gapPx(boundary);
  void banquetSightlineDensity;
  const productionReserve = wants.reserveMode === "production";
  const frontPadPx = productionReserve ? gp : Math.min(gp, px(2));
  const stackGapPx = productionReserve ? gp : Math.min(gp, px(1.5));
  const audienceAlleyPx = productionReserve ? gp : Math.min(gp, px(2));
  let y = iy0 + frontPadPx;

  let hasScreen = false;
  let hasStage = false;
  let hasAv = false;
  let stageBox: Box | null = null;
  let screenBox: Box | null = null;

  if (wants.screen) {
    const sc = plannerFootprint(wants.screen);
    hasScreen = placePlanner(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      wants.screen,
      ix0 + (iw - sc.w) / 2,
      y,
      undefined,
      undefined,
      { reserveSpacing: false },
    );
    if (hasScreen) {
      screenBox = placed[placed.length - 1]!;
      const last = screenBox;
      y = last.y + last.h + stackGapPx + px(1);
    }
  }

  if (wants.stage) {
    const st = plannerFootprint(wants.stage);
    const ok = placePlanner(editor, ids, placed, ix0, iy0, iw, ih, wants.stage, ix0 + (iw - st.w) / 2, y, undefined, undefined, { reserveSpacing: false });
    hasStage = ok;
    if (ok) stageBox = placed[placed.length - 1]!;
    if (hasStage && stageBox) {
      y = stageBox.y + stageBox.h + stackGapPx;
    } else stageBox = null;
  }

  if (wants.av && stageBox) {
    const av = plannerFootprint(wants.av);
    const hg = gp;
    const ayCenter = stageBox.y + stageBox.h / 2 - av.h / 2;

    /** Stage-right flank, then stage-left, then tuck downstage centered */
    const tryRight = stageBox.x + stageBox.w + hg;
    if (tryRight + av.w <= ix0 + iw - gp) hasAv = placePlanner(editor, ids, placed, ix0, iy0, iw, ih, wants.av, tryRight, ayCenter, undefined, undefined, { reserveSpacing: false });

    if (!hasAv) {
      const tryLeft = stageBox.x - hg - av.w;
      if (tryLeft >= ix0 + gp) hasAv = placePlanner(editor, ids, placed, ix0, iy0, iw, ih, wants.av, tryLeft, ayCenter, undefined, undefined, { reserveSpacing: false });
    }
    if (!hasAv) hasAv = placePlanner(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      wants.av,
      ix0 + iw / 2 - av.w / 2,
      Math.min(stageBox.y + stageBox.h + gp, iy0 + ih - av.h - gp),
      undefined,
      undefined,
      { reserveSpacing: false },
    );
  }

  let maxBottom = iy0 + gp;
  for (const bx of placed) maxBottom = Math.max(maxBottom, bx.y + bx.h);

  const audienceBaselineY = Math.min(maxBottom + audienceAlleyPx, iy0 + ih);

  return { hasScreen, hasStage, hasAv, audienceBaselineY, stageBox, screenBox };
}

function seatedCapacityForComponent(componentId: RoomSetComponentId): number {
  const c = getRoomSetComponent(componentId);
  return c?.capacitySeated ?? 0;
}

/** Collision-backed or visual-only corridor — banquet aisles stay legible without always splitting collision space. */
function placeCommittedReservationCorridor(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  left: number,
  top: number,
  corridorWidthPx: number,
  corridorHeightPx: number,
  label: string,
  reservation?: Readonly<{ commitCollisionBox?: boolean }>,
): void {
  placePlanner(
    editor,
    ids,
    placed,
    ix0,
    iy0,
    iw,
    ih,
    "service-corridor",
    left,
    top,
    label,
    { w: Math.max(px(8), corridorWidthPx), h: Math.max(px(8), corridorHeightPx) },
    {
      reserveSpacing: false,
      ignoreCollisions: true,
      commitCollisionBox: reservation?.commitCollisionBox !== false,
    },
  );
}

/** Visual-only perimeter frame documenting optional accessibility inset (pairs with shrunk pack rectangle). */
function outlineAccessibleComfortInsetGuides(
  editor: Editor,
  ids: TLShapeId[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  insetPx: number,
): void {
  if (insetPx <= 1 || iw <= insetPx * 2 || ih <= insetPx * 2) return;
  const innerH = ih - insetPx * 2;
  /** Top / bottom bands */
  placePlanner(
    editor,
    ids,
    [],
    ix0,
    iy0,
    iw,
    ih,
    "service-corridor",
    ix0,
    iy0,
    "Comfort inset (access · top)",
    { w: iw, h: insetPx },
    { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
  );
  placePlanner(
    editor,
    ids,
    [],
    ix0,
    iy0,
    iw,
    ih,
    "service-corridor",
    ix0,
    iy0 + ih - insetPx,
    "Comfort inset (access · bottom)",
    { w: iw, h: insetPx },
    { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
  );
  /** Left / right */
  placePlanner(
    editor,
    ids,
    [],
    ix0,
    iy0,
    iw,
    ih,
    "service-corridor",
    ix0,
    iy0 + insetPx,
    "Comfort inset (access · left)",
    { w: insetPx, h: innerH },
    { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
  );
  placePlanner(
    editor,
    ids,
    [],
    ix0,
    iy0,
    iw,
    ih,
    "service-corridor",
    ix0 + iw - insetPx,
    iy0 + insetPx,
    "Comfort inset (access · right)",
    { w: insetPx, h: innerH },
    { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
  );
}

function tryPlaceBanquetTable(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  componentId: RoomSetComponentId,
  left: number,
  top: number,
  label: string,
  packDiagBanquet?:
    | Readonly<{
        hook: MutablePackDiagRoot["banquet"];
        lane: string;
        /** Extra sink for wing-phase rejects (verbatim `line` mirrors global rejectSamples). */
        recordWingRejectLine?: (line: string, reason: PackPlannerRejectPayload["reason"]) => void;
      }>
    | undefined,
): boolean {
  if (packDiagBanquet?.hook) {
    const d = packDiagBanquet.hook.diag;
    d.tryPlaceAttempts = (d.tryPlaceAttempts ?? 0) + 1;
  }
  return placePlanner(editor, ids, placed, ix0, iy0, iw, ih, componentId, left, top, label, undefined, {
    reserveSpacing: false,
    onPlacementReject:
      packDiagBanquet?.hook &&
      ((detail): void => {
        const ln = `[${detail.componentId}|spot=${packDiagBanquet!.lane}|y=${top.toFixed(1)} x=${left.toFixed(1)}]`;
        let line = ln;
        if (detail.reason === "candidate_out_of_pack_bounds") {
          line += ` out_of_bounds candidate=${stringifyBox(detail.candidate)} clip=${stringifyBox(detail.packClipPage)}`;
        } else if (detail.reason === "overlap_prior_placed_collision_box") {
          line += ` overlap_prior[${detail.priorIndex}]=${stringifyBox(detail.prior)} candidate=${stringifyBox(detail.candidate)}`;
        } else if (detail.reason === "editor_insert_failed_or_empty") {
          line += ` insert_failed anchor=(${detail.anchor.x.toFixed(1)},${detail.anchor.y.toFixed(1)})`;
        }
        banquetDiagNoteReject(packDiagBanquet!.hook!, detail.reason, line);
        packDiagBanquet?.recordWingRejectLine?.(line, detail.reason);
      }),
  });
}


function banquetAdaptiveStarter(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  boundary: RoomSetLayoutBoundary,
  audienceTopHint: number,
  frontRankBoxes: Readonly<{ stageBox: Box | null; screenBox: Box | null }>,
  warns: string[],
  options: StarterCompositionOptions = {},
  packingMeta: { exhausted: boolean },
): void {
  const gp = gapPx(boundary);
  const cap = options.capacity;
  const targetSeats = clampNumber(cap?.targetSeats ?? 0, 1, 1200);
  const dbgPack = options.packDiagRoot?.banquet;
  /** Accessibility-only density strip (comfort inset LU + banquet pitch/budget knobs). */
  const dens = banquetMarginsFromDensity(cap?.densityPreference, cap?.accessibilityPriority === true);
  const plannedSeatBudget = computeBanquetPackModeledSeatBudget(
    targetSeats,
    cap?.densityPreference,
    cap?.accessibilityPriority,
  );
  const componentIdBanquetGrid: RoomSetComponentId =
    cap?.primaryComponentId && starterIdFromPrimaryComponentId(cap.primaryComponentId) === "banquet"
      ? cap.primaryComponentId
      : "table-round-60";
  const seatsPerTable = Math.max(
    1,
    getRoomSetComponent(componentIdBanquetGrid)?.capacitySeated ?? cap?.primaryComponentCapacity ?? 8,
  );
  const targetTables = Math.ceil(plannedSeatBudget / seatsPerTable);
  const densityTier = cap?.densityPreference ?? "balanced";
  let seatedTotal = 0;
  let tablesPlaced = 0;

  const comfortInsetPx =
    cap?.accessibilityPriority === true && dens.accessiblePackInsetLu > 0 ? px(dens.accessiblePackInsetLu) : 0;

  if (cap?.accessibilityPriority === true && dens.accessiblePackInsetLu > 0) {
    warns.push(
      `Accessibility on: banquet pack applies ${dens.accessiblePackInsetLu.toFixed(
        1,
      )} ft per-edge comfort inset (see dashed overlays).`,
    );
  }

  if (densityTier === "premium" && plannedSeatBudget + 7 < targetSeats) {
    warns.push(
      `Premium density trims modeled banquet seating toward ${plannedSeatBudget} seats (${targetSeats} requested) — larger table pitch and lower table budget.`,
    );
  }

  let packIx0 = ix0 + comfortInsetPx;
  let packIy0 = iy0 + comfortInsetPx;
  let packIw = Math.max(PLANNER_PAGE_SCALE * 4, iw - 2 * comfortInsetPx);
  let packIh = Math.max(PLANNER_PAGE_SCALE * 4, ih - 2 * comfortInsetPx);

  const secondaryReserve = options.promptSecondaryReserve;
  if (secondaryReserve && secondaryReserve.cocktailClusters > 0) {
    const shrunk = shrinkBanquetPackRectForSecondaryReserve(packIx0, packIy0, packIw, packIh, secondaryReserve);
    packIx0 = shrunk.ix0;
    packIy0 = shrunk.iy0;
    packIw = shrunk.iw;
    packIh = shrunk.ih;
    warns.push(
      `Reserved perimeter bands for ${secondaryReserve.cocktailClusters} prompt-driven cocktail clusters (${secondaryReserve.placementPreference}).`,
    );
  }

  /** Full interior pack minus accessibility inset · seating begins below front-of-house stack. */
  const seatingTop = Math.max(packIy0, audienceTopHint);
  const seatingBottom = packIy0 + packIh;
  const gridX0 = packIx0;
  const gridX1 = packIx0 + packIw;
  const seatRectW = gridX1 - gridX0;
  const seatRectH = seatingBottom - seatingTop;
  const centerX = packIx0 + packIw / 2;
  /** Skinny overlay strips only (`ignoreCollisions`); not used to clip placement. */
  const visRibbonPx = px(4);
  const visCenterStripW = px(4);
  const visSideStripW = px(3);

  const fp = plannerFootprint(componentIdBanquetGrid);
  /** Table pitch from density only (overlap + bounds still arbitrate collisions). */
  const gapLu = dens.tableGapLu + dens.gridPitchExtraLu;
  const pitchGapPx = px(gapLu);
  const colPitch = Math.max(fp.w + pitchGapPx, fp.w + 1e-3);
  const rowPitch = Math.max(fp.h + pitchGapPx, fp.h + 1e-3);

  const finalizeBanquetPackDiag = (stopReasonDiag: string) => {
    const branch = options.packDiagRoot?.banquet;
    if (!branch) return;
    branch.flush({
      seatedTotal,
      exhausted: packingMeta.exhausted,
      stopReason: stopReasonDiag,
    });
  };

  if (dbgPack) {
    const dPack = dbgPack.diag;
    dPack.targetCapacity = targetSeats;
    dPack.packClipPage = { x: packIx0, y: packIy0, w: packIw, h: packIh };
    dPack.seatingBandPage = { seatingTop, seatingBottom };
    dPack.stepX = colPitch;
    dPack.stepY = rowPitch;
    dPack.lanes = {
      leftLaneX: gridX0,
      leftLaneLimit: gridX1,
      rightLaneX: gridX0,
      rightLaneLimit: gridX1,
    };
    dPack.laneWidthsPx = { left: seatRectW, right: seatRectW };
  }

  if (seatRectH < fp.h || seatRectW < fp.w) {
    warns.push("Banquet pack rectangle cannot fit one table footprint — widen the room.");
    packingMeta.exhausted = true;
    finalizeBanquetPackDiag("seating_band_or_lane_geom_clipped");
    return;
  }

  const slotXsRaw = collectBanquetSlotLeftEdges(gridX0, colPitch, fp.w, gridX1);
  const maxSlotsPerRow = slotXsRaw.length;
  const gridSpanW = maxSlotsPerRow > 0 ? (maxSlotsPerRow - 1) * colPitch + fp.w : fp.w;
  const centeredGridX0 = gridX0 + Math.max(0, (seatRectW - gridSpanW) / 2);
  const slotXs = collectBanquetSlotLeftEdges(centeredGridX0, colPitch, fp.w, centeredGridX0 + gridSpanW);
  const rowYsRaw = collectBanquetRowTopEdges(seatingTop, rowPitch, fp.h, seatingBottom);
  const numRows = rowYsRaw.length;
  const gridSpanH = numRows > 0 ? (numRows - 1) * rowPitch + fp.h : fp.h;
  const centeredSeatingTop = seatingTop + Math.max(0, (seatRectH - gridSpanH) / 2);
  const rowYs = collectBanquetRowTopEdges(centeredSeatingTop, rowPitch, fp.h, centeredSeatingTop + gridSpanH);
  const geometricTableCap = Math.max(0, maxSlotsPerRow * numRows);
  if (geometricTableCap < targetTables) {
    warns.push(
      `Grid physically supports ~${geometricTableCap} table anchors (${geometricTableCap * 8} modeled seats across ${maxSlotsPerRow}×${numRows}) toward ${targetTables} requested — widen the room or overlaps will cap sooner.`,
    );
  }

  const occupied = numRows <= 0
    ? []
    : Array.from({ length: numRows }, () => Array.from({ length: Math.max(0, maxSlotsPerRow) }, () => false));

  const trySeatAtSlot = (ri: number, s: number): boolean => {
    if (tablesPlaced >= targetTables) return false;
    const y = rowYs[ri];
    const rowOcc = occupied[ri];
    const x = slotXs[s];
    if (y === undefined || rowOcc === undefined || x === undefined) return false;
    if (rowOcc[s]) return false;

    const ordinal = tablesPlaced + 1;
    const ok = tryPlaceBanquetTable(
      editor,
      ids,
      placed,
      packIx0,
      packIy0,
      packIw,
      packIh,
      componentIdBanquetGrid,
      x,
      y,
      `Table ${ordinal}`,
      dbgPack ? { hook: dbgPack, lane: `grid_r${ri}_c${s}` } : undefined,
    );
    if (!ok) return false;
    tablesPlaced += 1;
    seatedTotal += seatsPerTable;
    rowOcc[s] = true;
    return true;
  };

  const rankBase = {
    fpWpx: fp.w,
    fpHpx: fp.h,
    packTopPx: packIy0,
    audienceTopHintPx: audienceTopHint,
    roomCenterXPx: centerX,
    stageBox: frontRankBoxes.stageBox,
    screenBox: frontRankBoxes.screenBox,
    densityTier,
  } as const;

  /** Full grid lattice · overlap/pack bounds arbitrate feasibility; ranking only biases try order. */
  const sorted: Array<{ ri: number; s: number; rank: number }> = [];
  for (let ri = 0; ri < numRows; ri += 1) {
    for (let s = 0; s < maxSlotsPerRow; s += 1) {
      const x = slotXs[s];
      const y = rowYs[ri];
      if (x === undefined || y === undefined) continue;
      sorted.push({
        ri,
        s,
        rank: banquetCandidateRankWeight({
          tableLeftPx: x,
          tableTopPx: y,
          ...rankBase,
        }),
      });
    }
  }
  sorted.sort((a, b) => a.rank - b.rank || a.ri - b.ri || a.s - b.s);
  if (dbgPack) dbgPack.diag.rowScanIterations = sorted.length;

  for (const c of sorted) {
    if (tablesPlaced >= targetTables) break;
    trySeatAtSlot(c.ri, c.s);
  }

  packingMeta.exhausted = tablesPlaced < targetTables;

  /** Visual overlays only (`ignoreCollisions` + `commitCollisionBox: false`) — cannot block primitives. */
  placeHorizontalAisle(
    editor,
    ids,
    placed,
    ix0,
    iy0,
    iw,
    ih,
    ix0 + gp * 0.5,
    packIy0,
    iw - gp,
    "Front dinner cross-aisle (visual)",
    visRibbonPx,
  );
  placeHorizontalAisle(
    editor,
    ids,
    placed,
    ix0,
    iy0,
    iw,
    ih,
    ix0 + gp * 0.5,
    seatingBottom - visRibbonPx,
    iw - gp,
    "Rear service lane (visual)",
    visRibbonPx,
  );
  placeVerticalAisle(
    editor,
    ids,
    placed,
    ix0,
    iy0,
    iw,
    ih,
    centerX - visCenterStripW / 2,
    seatingTop,
    seatingBottom - seatingTop,
    "Suggested center egress (visual)",
    visCenterStripW,
  );
  placePlanner(
    editor,
    ids,
    placed,
    ix0,
    iy0,
    iw,
    ih,
    "service-corridor",
    packIx0 + gp * 0.5,
    seatingTop,
    "Side circulation (visual)",
    { w: visSideStripW, h: seatingBottom - seatingTop },
    { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
  );
  placePlanner(
    editor,
    ids,
    placed,
    ix0,
    iy0,
    iw,
    ih,
    "service-corridor",
    packIx0 + packIw - gp * 0.5 - visSideStripW,
    seatingTop,
    "Side circulation (visual)",
    { w: visSideStripW, h: seatingBottom - seatingTop },
    { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
  );

  const buffet = plannerFootprint("fnb-buffet-line");
  const bar = plannerFootprint("fnb-portable-bar");
  const foh = plannerFootprint("av-foh-control");
  const supportFloorYTop = iy0 + ih - gp;
  if (options.support?.foh === true) {
    placeSupportItem(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      "av-foh-control",
      ix0 + iw / 2 - foh.w / 2,
      iy0 + ih - gp - foh.h,
      "Tech control",
    );
  }
  if (options.support?.buffet === true) {
    placeSupportItem(editor, ids, placed, ix0, iy0, iw, ih, "fnb-buffet-line", ix0 + gp, supportFloorYTop - buffet.h, "Buffet line");
  }
  if (options.support?.bar === true) {
    placeSupportItem(editor, ids, placed, ix0, iy0, iw, ih, "fnb-portable-bar", ix0 + iw - gp - bar.w, supportFloorYTop - bar.h, "Service bar");
  }

  if (comfortInsetPx > 1 && cap?.accessibilityPriority === true) {
    outlineAccessibleComfortInsetGuides(editor, ids, ix0, iy0, iw, ih, comfortInsetPx);
  }

  if (tablesPlaced < targetTables) {
    warns.push(
      `Banquet grid placed ${tablesPlaced}/${targetTables} round tables (${seatedTotal}/${plannedSeatBudget} modeled seats toward ${targetSeats} requested) — tight shell or overlaps with committed FOH/support primitives.`,
    );
  }

  finalizeBanquetPackDiag(
    seatedTotal >= plannedSeatBudget ? "target_met" : packingMeta.exhausted ? "scan_complete_shortfall" : "stopped_unknown_state",
  );
}

function placeCenteredRound(editor: Editor, ids: TLShapeId[], placed: Box[], ix0: number, iy0: number, iw: number, ih: number, label: string): boolean {
  const rnd = plannerFootprint("table-round-72");
  const cx = ix0 + iw / 2;
  const cy = iy0 + ih / 2;
  return placePlanner(editor, ids, placed, ix0, iy0, iw, ih, "table-round-72", cx - rnd.w / 2, cy - rnd.h / 2, label, undefined, {
    reserveSpacing: false,
  });
}

function placeVerticalAisle(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  left: number,
  top: number,
  height: number,
  label: string,
  width = px(6),
): void {
  placePlanner(
    editor,
    ids,
    placed,
    ix0,
    iy0,
    iw,
    ih,
    "service-corridor",
    left,
    top,
    label,
    { w: width, h: Math.max(px(8), height) },
    { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
  );
}

function placeHorizontalAisle(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  left: number,
  top: number,
  width: number,
  label: string,
  height = px(5),
): void {
  placePlanner(
    editor,
    ids,
    placed,
    ix0,
    iy0,
    iw,
    ih,
    "service-corridor",
    left,
    top,
    label,
    { w: Math.max(px(10), width), h: height },
    { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
  );
}

function placeSupportItem(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  componentId: RoomSetComponentId,
  left: number,
  top: number,
  label: string,
): boolean {
  return placePlanner(editor, ids, placed, ix0, iy0, iw, ih, componentId, left, top, label, undefined, {
    reserveSpacing: false,
  });
}

function classroomStarter(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  boundary: RoomSetLayoutBoundary,
  audienceTopHint: number,
  warns: string[],
  options: StarterCompositionOptions = {},
  packOutcome?: { exhausted: boolean },
): void {
  const gp = gapPx(boundary);
  const rowComponentId: RoomSetComponentId =
    options.capacity?.primaryComponentId &&
    starterIdFromPrimaryComponentId(options.capacity.primaryComponentId) === "classroom"
      ? options.capacity.primaryComponentId
      : "seating-classroom-row";
  const desk = plannerFootprint(rowComponentId);
  const coffee = plannerFootprint("fnb-coffee-station");
  const tech = plannerFootprint("av-foh-control");
  const a11y = options.capacity?.accessibilityPriority === true;
  const explicitCoffee = options.support?.coffee === true;
  const explicitFoh = options.support?.foh === true;
  let rowGapPx = a11y ? px(1) : 0;

  let bottomReservePx = gp;
  if (explicitCoffee) bottomReservePx = Math.max(bottomReservePx, coffee.h + Math.min(gp, px(2)));
  if (explicitFoh) bottomReservePx = Math.max(bottomReservePx, tech.h + Math.min(gp, px(2)));
  if (a11y) bottomReservePx += px(1);

  const top = audienceTopHint;
  const bankGapPx = a11y ? Math.max(px(8), gp) : gp;
  const canSplit = iw >= desk.w * 2 + bankGapPx;
  const leftX = ix0 + iw / 2 - bankGapPx / 2 - desk.w;
  const rightX = ix0 + iw / 2 + bankGapPx / 2;
  let count = 0;
  const targetRows = options.capacity?.targetPrimaryComponents ?? Number.POSITIVE_INFINITY;
  let seatingBottom = iy0 + ih - bottomReservePx;
  const denom = desk.h + rowGapPx;
  let rowsRaw = denom > 1e-6 ? Math.floor((seatingBottom - top + rowGapPx) / denom) : 0;
  const banks = canSplit ? 2 : 1;
  if (Number.isFinite(targetRows) && rowsRaw * banks < targetRows * 0.5) {
    const compressedBottomReservePx = Math.max(px(1), explicitCoffee ? coffee.h + px(1) : 0, explicitFoh ? tech.h + px(1) : 0);
    const compressedRowGapPx = 0;
    const compressedSeatingBottom = iy0 + ih - compressedBottomReservePx;
    const compressedRowsRaw = Math.floor((compressedSeatingBottom - top + compressedRowGapPx) / (desk.h + compressedRowGapPx));
    if (compressedRowsRaw > rowsRaw) {
      bottomReservePx = compressedBottomReservePx;
      rowGapPx = compressedRowGapPx;
      seatingBottom = compressedSeatingBottom;
      rowsRaw = compressedRowsRaw;
      warns.push("Compressed noncritical classroom reserves before accepting a severe seating shortfall.");
    }
  }
  const rows = Math.max(1, rowsRaw);

  const visStrip = px(3);
  const blockRows = Number.isFinite(targetRows)
    ? Math.min(rows, Math.ceil(targetRows / banks))
    : rows;
  const blockHeight = blockRows * desk.h + Math.max(0, blockRows - 1) * rowGapPx;
  const rowStartY = top + Math.max(0, (seatingBottom - top - blockHeight) / 2);

  for (let r = 0; r < rows; r += 1) {
    if (count >= targetRows) break;
    const y = rowStartY + r * (desk.h + rowGapPx);
    if (y + desk.h > seatingBottom) break;
    if (canSplit) {
      if (count < targetRows && placePayload(editor, ids, placed, ix0, iy0, iw, ih, rowComponentId, leftX, y, `Desk row ${r + 1}A`)) count += 1;
      if (count < targetRows && placePayload(editor, ids, placed, ix0, iy0, iw, ih, rowComponentId, rightX, y, `Desk row ${r + 1}B`)) count += 1;
    } else {
      const centered = ix0 + iw / 2 - desk.w / 2;
      if (placePayload(editor, ids, placed, ix0, iy0, iw, ih, rowComponentId, centered, y, `Desk row ${r + 1}`)) count += 1;
    }
  }

  placeHorizontalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + gp * 0.5, top - px(3), iw - gp, "Instruction front cross-aisle", visStrip);
  if (canSplit) {
    placeVerticalAisle(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      ix0 + iw / 2 - Math.max(px(14), bankGapPx) / 2,
      top,
      Math.max(px(14), seatingBottom - top),
      "Training aisle",
      Math.max(px(14), bankGapPx),
    );
  }
  placeVerticalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + gp * 0.5, top, Math.max(px(12), seatingBottom - top), "Side access", visStrip);
  placeVerticalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + iw - gp * 0.5 - visStrip, top, Math.max(px(12), seatingBottom - top), "Side access", visStrip);
  placeHorizontalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + gp * 0.5, seatingBottom, iw - gp, "Rear circulation", visStrip);

  if (options.capacity?.distributedPower) {
    placeHorizontalAisle(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      ix0 + gp,
      Math.min(seatingBottom - px(4), top + Math.max(px(10), (seatingBottom - top) * 0.48)),
      iw - gp * 2,
      "Distributed power spine",
      px(2),
    );
  }
  if (options.capacity?.breakoutZones) {
    const zoneW = Math.min(px(34), iw - gp * 2);
    placePlanner(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      "service-corridor",
      ix0 + iw - gp - zoneW,
      iy0 + ih - gp - px(8),
      "Breakout collaboration zone",
      { w: zoneW, h: px(8) },
      { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
    );
  }

  if (explicitCoffee) {
    placeSupportItem(editor, ids, placed, ix0, iy0, iw, ih, "fnb-coffee-station", ix0 + gp, iy0 + ih - gp - coffee.h, "Resource station");
  }
  if (explicitFoh) {
    placeSupportItem(editor, ids, placed, ix0, iy0, iw, ih, "av-foh-control", ix0 + iw - gp - tech.w, iy0 + ih - gp - tech.h, "Instructor tech");
  }

  if (count === 0) {
    warns.push("Classroom desk rows could not fit beneath the front production stack.");
    if (packOutcome && Number.isFinite(targetRows)) packOutcome.exhausted = true;
  } else if (Number.isFinite(targetRows) && count < targetRows) {
    warns.push(`Classroom capacity shortfall: placed ${count} row blocks (${count * 12} seats) against ${targetRows} required row blocks.`);
    if (packOutcome) packOutcome.exhausted = true;
  } else if (count < 6) warns.push("Classroom density is light — widen the room for two training banks.");
}

function theaterStarter(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  boundary: RoomSetLayoutBoundary,
  audienceTopHint: number,
  warns: string[],
  options: StarterCompositionOptions = {},
  packOutcome?: { exhausted: boolean },
): void {
  const gp = gapPx(boundary);
  const rowComponentId: RoomSetComponentId =
    options.capacity?.primaryComponentId &&
    starterIdFromPrimaryComponentId(options.capacity.primaryComponentId) === "theater"
      ? options.capacity.primaryComponentId
      : "seating-theater-row";
  const rowFoot = plannerFootprint(rowComponentId);
  const rearFoh = plannerFootprint("av-foh-control");
  const a11y = options.capacity?.accessibilityPriority === true;
  const explicitFoh = options.support?.foh === true;
  let rowGapPx = a11y ? px(1) : 0;

  let bottomReservePx = gp + (explicitFoh ? rearFoh.h + Math.min(gp, px(2)) : px(1)) + (a11y ? px(1) : 0);
  const top = audienceTopHint;
  const bankGapPx = a11y ? Math.max(px(8), gp) : gp;
  const canSplit = iw >= rowFoot.w * 2 + bankGapPx;
  let count = 0;
  const targetRows = options.capacity?.targetPrimaryComponents ?? Number.POSITIVE_INFINITY;
  let seatingBottom = iy0 + ih - bottomReservePx;
  let denom = rowFoot.h + rowGapPx;
  let rowsRaw = denom > 1e-6 ? Math.floor((seatingBottom - top + rowGapPx) / denom) : 0;
  const banks = canSplit ? 2 : 1;
  if (Number.isFinite(targetRows) && rowsRaw * banks < targetRows * 0.5) {
    const compressedBottomReservePx = explicitFoh ? rearFoh.h + px(1) : px(1);
    const compressedRowGapPx = 0;
    const compressedSeatingBottom = iy0 + ih - compressedBottomReservePx;
    const compressedRowsRaw = Math.floor((compressedSeatingBottom - top + compressedRowGapPx) / (rowFoot.h + compressedRowGapPx));
    if (compressedRowsRaw > rowsRaw) {
      bottomReservePx = compressedBottomReservePx;
      rowGapPx = compressedRowGapPx;
      seatingBottom = compressedSeatingBottom;
      denom = rowFoot.h + rowGapPx;
      rowsRaw = denom > 1e-6 ? Math.floor((seatingBottom - top + rowGapPx) / denom) : 0;
      warns.push("Compressed noncritical theater reserves before accepting a severe seating shortfall.");
    }
  }
  const rows = Math.max(1, rowsRaw);

  const visStrip = px(3);
  const blockRows = Number.isFinite(targetRows)
    ? Math.min(rows, Math.ceil(targetRows / banks))
    : rows;
  const blockHeight = blockRows * rowFoot.h + Math.max(0, blockRows - 1) * rowGapPx;
  const rowStartY = top + Math.max(0, (seatingBottom - top - blockHeight) / 2);

  for (let r = 0; r < rows; r += 1) {
    if (count >= targetRows) break;
    const y = rowStartY + r * (rowFoot.h + rowGapPx);
    if (y + rowFoot.h > seatingBottom) break;
    if (canSplit) {
      const leftX = ix0 + iw / 2 - bankGapPx / 2 - rowFoot.w;
      const rightX = ix0 + iw / 2 + bankGapPx / 2;
      if (count < targetRows && placePayload(editor, ids, placed, ix0, iy0, iw, ih, rowComponentId, leftX, y, `Audience row ${r + 1}L`)) count += 1;
      if (count < targetRows && placePayload(editor, ids, placed, ix0, iy0, iw, ih, rowComponentId, rightX, y, `Audience row ${r + 1}R`)) count += 1;
    } else {
      const centered = ix0 + iw / 2 - rowFoot.w / 2;
      if (count < targetRows && placePayload(editor, ids, placed, ix0, iy0, iw, ih, rowComponentId, centered, y, `Audience row ${r + 1}`)) count += 1;
    }
  }

  placeHorizontalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + gp * 0.5, top - px(2), iw - gp, "Front cross-aisle", visStrip);
  if (canSplit) {
    placeVerticalAisle(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      ix0 + iw / 2 - Math.max(px(14), bankGapPx) / 2,
      top,
      Math.max(px(16), seatingBottom - top),
      "Center aisle",
      Math.max(px(14), bankGapPx),
    );
    placeVerticalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + gp * 0.5, top, Math.max(px(14), seatingBottom - top), "Side aisle", visStrip);
    placeVerticalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + iw - gp * 0.5 - visStrip, top, Math.max(px(14), seatingBottom - top), "Side aisle", visStrip);
  }

  const rearCrossAisleY = seatingBottom;
  placeHorizontalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + gp * 0.5, rearCrossAisleY, iw - gp, "Rear cross-aisle", visStrip);
  if (explicitFoh) {
    placeSupportItem(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      "av-foh-control",
      ix0 + iw / 2 - rearFoh.w / 2,
      Math.min(iy0 + ih - Math.min(gp, px(2)) - rearFoh.h, rearCrossAisleY + px(1)),
      "Rear FOH control",
    );
  }

  if (count === 0) {
    warns.push("Theater seating rows could not fit beneath the front production stack.");
    if (packOutcome && Number.isFinite(targetRows)) packOutcome.exhausted = true;
  } else if (Number.isFinite(targetRows) && count < targetRows) {
    warns.push(`Theater pack shortfall: placed ${count} row primitives vs ${targetRows} required (${count * 14} seats vs target load).`);
    if (packOutcome) packOutcome.exhausted = true;
  } else if (count < 8) warns.push("Theater density is light — deepen the room for stronger audience reads.");
}

function receptionStarter(
  editor: Editor,
  ids: TLShapeId[],
  placed: Box[],
  ix0: number,
  iy0: number,
  iw: number,
  ih: number,
  boundary: RoomSetLayoutBoundary,
  warns: string[],
  options: StarterCompositionOptions = {},
  packOutcome?: { exhausted: boolean },
): void {
  const gp = gapPx(boundary);
  const barDims = plannerFootprint("fnb-portable-bar");
  const regDims = plannerFootprint("registration-desk");
  const cocktail = plannerFootprint("table-cocktail-cluster");
  const lounge = plannerFootprint("lounge-chair");
  const kiosk = plannerFootprint("registration-kiosk");
  const dbgRec = options.packDiagRoot?.reception;

  const capOpts = options.capacity;
  const targetGuests = clampNumber(capOpts?.targetSeats ?? 72, 1, 1200);
  const clusterSeatCap = seatedCapacityForComponent("table-cocktail-cluster") || 4;
  const clustersNeeded = Math.max(1, Math.ceil(targetGuests / clusterSeatCap));
  if (dbgRec) {
    dbgRec.diag.targetGuests = targetGuests;
    dbgRec.diag.clustersNeeded = clustersNeeded;
    dbgRec.diag.receptionClusterLimitFromPlan =
      typeof options.receptionClusterLimit === "number" ? options.receptionClusterLimit : null;
  }
  const interGap = capOpts?.accessibilityPriority === true ? px(2.5) : 0;

  if (options.support?.buffet ?? true) {
    const okBuffet = placePayload(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      "fnb-buffet-line",
      ix0 + gp,
      iy0 + gp,
      "Food station",
    );
    if (!okBuffet) warns.push("Buffet station clipped — widen the reception shell.");
  }
  if (options.support?.bar ?? true) {
    placePayload(editor, ids, placed, ix0, iy0, iw, ih, "fnb-portable-bar", ix0 + iw - gp - barDims.w, iy0 + gp, "Primary bar");
  }
  if (options.support?.registration ?? true) {
    placePayload(editor, ids, placed, ix0, iy0, iw, ih, "registration-desk", ix0 + gp, iy0 + ih - gp - regDims.h, "Host check-in");
  }

  const margin = gp;
  const pitchX = cocktail.w + interGap;
  const pitchY = cocktail.h + interGap;
  let cocktailCount = 0;

  const mingleLeft = ix0 + margin + barDims.w * 0.35;
  const mingleTop = iy0 + margin + Math.max(barDims.h, plannerFootprint("fnb-buffet-line").h) * 0.35;
  const mingleRight = ix0 + iw - margin - barDims.w * 0.35;
  const mingleBottom = iy0 + ih - margin - Math.max(regDims.h, barDims.h) * 0.35;
  const mingleW = Math.max(PLANNER_PAGE_SCALE * 2, mingleRight - mingleLeft);
  const mingleH = Math.max(PLANNER_PAGE_SCALE * 2, mingleBottom - mingleTop);

  if (pitchX <= 1 || pitchY <= 1) {
    warns.push("Reception cluster pitch invalid — widen the shell.");
  } else if (mingleW < cocktail.w || mingleH < cocktail.h) {
    warns.push("Reception mingle zone too tight after edge services — widen the shell.");
  } else {
    const nx = Math.max(1, Math.floor(mingleW / pitchX));
    const ny = Math.max(1, Math.floor(mingleH / pitchY));
    const gridSpanW = (nx - 1) * pitchX + cocktail.w;
    const gridSpanH = (ny - 1) * pitchY + cocktail.h;
    const originX = mingleLeft + Math.max(0, (mingleW - gridSpanW) / 2);
    const originY = mingleTop + Math.max(0, (mingleH - gridSpanH) / 2);
    if (dbgRec) {
      dbgRec.diag.marginPx = margin;
      dbgRec.diag.pitchXPx = pitchX;
      dbgRec.diag.pitchYPx = pitchY;
      dbgRec.diag.innerWPx = mingleW;
      dbgRec.diag.innerHPx = mingleH;
      dbgRec.diag.nxSlots = nx;
      dbgRec.diag.nySlots = ny;
      dbgRec.diag.gridCellsVisited = 0;
    }
    outer: for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if (cocktailCount >= clustersNeeded) break outer;
        if (dbgRec) dbgRec.diag.gridCellsVisited = (dbgRec.diag.gridCellsVisited ?? 0) + 1;
        const leftCell = originX + i * pitchX;
        const topCell = originY + j * pitchY;
        if (dbgRec) dbgRec.diag.cocktailAttempts = (dbgRec.diag.cocktailAttempts ?? 0) + 1;
        const ok = placePayload(
          editor,
          ids,
          placed,
          ix0,
          iy0,
          iw,
          ih,
          "table-cocktail-cluster",
          leftCell,
          topCell,
          `Cocktail cluster ${cocktailCount + 1}`,
          dbgRec
            ? {
                onPlacementReject: (detail): void => {
                  const ln = `[table-cocktail-cluster|idx i=${i} j=${j}|left=${leftCell.toFixed(1)} top=${topCell.toFixed(1)}]`;
                  let line = ln;
                  if (detail.reason === "candidate_out_of_pack_bounds") {
                    line += ` out_of_bounds candidate=${stringifyBox(detail.candidate)} clip=${stringifyBox(detail.packClipPage)}`;
                  } else if (detail.reason === "overlap_prior_placed_collision_box") {
                    line += ` overlap_prior[${detail.priorIndex}]=${stringifyBox(detail.prior)} candidate=${stringifyBox(
                      detail.candidate,
                    )}`;
                  } else if (detail.reason === "editor_insert_failed_or_empty") {
                    line += ` insert_failed anchor=(${detail.anchor.x.toFixed(1)},${detail.anchor.y.toFixed(1)})`;
                  }
                  receptionDiagNoteReject(dbgRec, detail.reason, line);
                },
              }
            : undefined,
        );
        if (ok) {
          cocktailCount += 1;
          if (dbgRec) dbgRec.diag.cocktailAccepted = (dbgRec.diag.cocktailAccepted ?? 0) + 1;
        }
      }
    }
  }

  const seatedGuests = cocktailCount * clusterSeatCap;
  placeHorizontalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + gp * 0.5, iy0 + ih / 2 - px(2), iw - gp, "Mingle path", px(4));
  placeVerticalAisle(editor, ids, placed, ix0, iy0, iw, ih, ix0 + iw / 2 - px(2), iy0 + gp * 0.5, ih - gp, "Service path", px(4));
  if (options.support?.registration ?? true) {
    placePayload(editor, ids, placed, ix0, iy0, iw, ih, "registration-kiosk", ix0 + gp + regDims.w + px(3), iy0 + ih - gp - kiosk.h, "Badge kiosk");
    placePlanner(editor, ids, placed, ix0, iy0, iw, ih, "registration-queue-lane", ix0 + gp + regDims.w * 0.18, iy0 + ih - gp - regDims.h - px(18), "Entry queue", { w: px(6), h: px(18) }, { reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false });
  }
  if (options.support?.bar ?? true) {
    placePayload(editor, ids, placed, ix0, iy0, iw, ih, "fnb-portable-bar", ix0 + iw - gp - barDims.w, iy0 + ih - gp - barDims.h, "Secondary bar");
  }

  const loungeBaseX = ix0 + iw - gp - lounge.w * 3.1;
  const loungeBaseY = iy0 + ih / 2 + gp * 0.45;
  const loungeOffsets: ReadonlyArray<readonly [number, number, number, string]> = [
    [0, 0, 12, "Lounge chair"],
    [1.4, 0.2, -8, "Lounge chair"],
    [0.45, 1.25, 0, "Lounge chair"],
    [1.85, 1.3, 8, "Lounge chair"],
  ];
  for (const [ox, oy, rotationDeg, label] of loungeOffsets) {
    placePlanner(
      editor,
      ids,
      placed,
      ix0,
      iy0,
      iw,
      ih,
      "lounge-chair",
      loungeBaseX + ox * lounge.w,
      loungeBaseY + oy * lounge.h,
      label,
      undefined,
      { rotationDeg, reserveSpacing: false, ignoreCollisions: true, commitCollisionBox: false },
    );
  }

  if (cocktailCount < 3 || seatedGuests + 1 < targetGuests) {
    warns.push(
      seatedGuests + 4 < targetGuests
        ? `Reception mingle pack stalled at ~${seatedGuests} plated guests (${targetGuests} requested) — widen the shell or tighten density knobs.`
        : "Reception social density looks light versus the requested headcount.",
    );
    if (packOutcome && seatedGuests < targetGuests) packOutcome.exhausted = true;
  }

  dbgRec?.flush();
}

function applyRoomTypeStarterInternal(
  editor: Editor,
  starterId: RoomTypeStarterId,
  ctx: PlannerRoomStarterContext,
  options: StarterCompositionOptions,
): RoomTypeStarterInternalResult {
  const packDiagRoot = options.packDiagRoot ?? createMutablePackDiagRoot(starterId);
  const starterOpts: StarterCompositionOptions = packDiagRoot ? { ...options, packDiagRoot } : options;
  const shellInterior = starterInteriorBoxes(ctx);
  const wallInsetPx = px(shellWallClearanceInsetLu(starterOpts.capacity?.densityPreference));
  const { ix0, iy0, iw, ih } = applyShellWallClearanceInsetRect(shellInterior, wallInsetPx);
  const warns: string[] = [];
  const ids: TLShapeId[] = [];
  const placed: Box[] = [];

  const gpBudget = gapPx(ctx.boundary);
  const interiorTooTight =
    iw < gpBudget * 10 || ih < gpBudget * 10 || ctx.boundary.widthLu < 22 || ctx.boundary.depthLu < 22;

  if (interiorTooTight) warns.push(`Room footprint is unusually tight (${formatRoomShellDimensions(ctx.boundary.widthLu, ctx.boundary.depthLu)}) — widen both axes toward at least ${formatFeet(60)} × ${formatFeet(42)} for fuller kits.`);

  const packOutcome = { exhausted: false };

  editor.run(() => {
    clearStarterObjects(editor);

    switch (starterId) {
      case "banquet": {
        const sightlineDensityPeek = starterOpts.capacity?.densityPreference;
        const front = placeFrontCueStack(editor, ids, placed, ix0, iy0, iw, ih, ctx.boundary, {
          screen: starterOpts.front?.screen ?? "av-projector-screen",
          stage: starterOpts.front?.stage ?? "stage-small",
          av: starterOpts.front?.av ?? false,
          reserveMode: starterOpts.front?.reserveMode ?? "compact",
        }, sightlineDensityPeek);
        banquetAdaptiveStarter(
          editor,
          ids,
          placed,
          ix0,
          iy0,
          iw,
          ih,
          ctx.boundary,
          front.audienceBaselineY,
          { stageBox: front.stageBox, screenBox: front.screenBox },
          warns,
          starterOpts,
          packOutcome,
        );
        if (front.stageBox && (starterOpts.front?.speakerStacks ?? true)) {
          const speaker = plannerFootprint("av-speaker-stack");
          placePlanner(
            editor,
            ids,
            placed,
            ix0,
            iy0,
            iw,
            ih,
            "av-speaker-stack",
            front.stageBox.x - speaker.w - gpBudget,
            front.stageBox.y + gpBudget,
            "PA left",
            undefined,
            { reserveSpacing: false },
          );
          placePlanner(
            editor,
            ids,
            placed,
            ix0,
            iy0,
            iw,
            ih,
            "av-speaker-stack",
            front.stageBox.x + front.stageBox.w + gpBudget,
            front.stageBox.y + gpBudget,
            "PA right",
            undefined,
            { reserveSpacing: false },
          );
        }
        if (!front.hasScreen) warns.push("Screen cue clipped vertically — widen room depth for front-of-house layering.");
        if (!front.hasStage) warns.push("Stage footprint clipped vertically — deepening the room restores production depth cues.");
        break;
      }
      case "classroom": {
        const front = placeFrontCueStack(editor, ids, placed, ix0, iy0, iw, ih, ctx.boundary, {
          screen: starterOpts.front?.screen ?? "av-projector-screen",
          stage: starterOpts.front?.stage ?? "stage-small",
          av: starterOpts.front?.av ?? false,
          reserveMode: starterOpts.front?.reserveMode ?? "compact",
        });
        classroomStarter(
          editor,
          ids,
          placed,
          ix0,
          iy0,
          iw,
          ih,
          ctx.boundary,
          front.audienceBaselineY,
          warns,
          starterOpts,
          packOutcome,
        );
        if (front.stageBox && (starterOpts.front?.speakerStacks ?? false)) {
          const speaker = plannerFootprint("av-speaker-stack");
          placePlanner(editor, ids, placed, ix0, iy0, iw, ih, "av-speaker-stack", front.stageBox.x - speaker.w - gpBudget, front.stageBox.y + gpBudget, "PA left", undefined, { reserveSpacing: false });
          placePlanner(editor, ids, placed, ix0, iy0, iw, ih, "av-speaker-stack", front.stageBox.x + front.stageBox.w + gpBudget, front.stageBox.y + gpBudget, "PA right", undefined, { reserveSpacing: false });
        }
        if (!front.hasScreen) warns.push("Screen cue clipped vertically — widen room depth for instruction tiers.");
        if (!front.hasStage) warns.push("Stage footprint clipped — deepen the room before placing audience cues.");
        break;
      }

      case "theater": {
        const front = placeFrontCueStack(editor, ids, placed, ix0, iy0, iw, ih, ctx.boundary, {
          screen: starterOpts.front?.screen ?? "av-projector-screen",
          stage: starterOpts.front?.stage ?? "stage-riser",
          av: starterOpts.front?.av ?? false,
          reserveMode: starterOpts.front?.reserveMode ?? "compact",
        });
        theaterStarter(
          editor,
          ids,
          placed,
          ix0,
          iy0,
          iw,
          ih,
          ctx.boundary,
          front.audienceBaselineY,
          warns,
          starterOpts,
          packOutcome,
        );
        if (front.stageBox && (starterOpts.front?.speakerStacks ?? false)) {
          const speaker = plannerFootprint("av-speaker-stack");
          placePlanner(editor, ids, placed, ix0, iy0, iw, ih, "av-speaker-stack", front.stageBox.x - speaker.w - gpBudget, front.stageBox.y + gpBudget, "PA left", undefined, { reserveSpacing: false });
          placePlanner(editor, ids, placed, ix0, iy0, iw, ih, "av-speaker-stack", front.stageBox.x + front.stageBox.w + gpBudget, front.stageBox.y + gpBudget, "PA right", undefined, { reserveSpacing: false });
        }
        if (starterOpts.support?.registration) {
          const reg = plannerFootprint("registration-desk");
          placePlanner(editor, ids, placed, ix0, iy0, iw, ih, "registration-desk", ix0 + gpBudget, iy0 + ih - gpBudget - reg.h, "Check-in", undefined, { reserveSpacing: false });
        }
        if (!front.hasScreen) warns.push("Screen cue clipped vertically — widen room depth for instruction tiers.");
        if (!front.hasStage) warns.push("Stage footprint clipped — deepen the room before placing audience cues.");
        break;
      }

      case "reception":
        receptionStarter(editor, ids, placed, ix0, iy0, iw, ih, ctx.boundary, warns, starterOpts, packOutcome);
        break;

      default:
        ((x: never) => void x)(starterId);
    }
  });

  /** Ensure something lands when presets cannot achieve density */
  if (ids.length === 0) {
    editor.run(() => {
      if (placeCenteredRound(editor, ids, placed, ix0, iy0, iw, ih, `${starterId} · seed mingle`)) {
        packOutcome.exhausted = true;
        warns.push(
          "Operational pack degraded to one seed primitive — widen the room shell to unlock deterministic density.",
        );
      }
    });
  }

  if (starterOpts.packDiagRoot) {
    stringifyPackDiagReport({
      editor,
      placedBoxes: [...placed],
      placedIds: ids,
      idsCount: ids.length,
      diag: starterOpts.packDiagRoot,
    });
  }

  editor.setSelectedShapes(ids);
  queueMicrotask(() => zoomEditorToPlannerRoomShell(editor));

  const uniq = [...new Set(warns.filter((linePeek) => linePeek.trim().length > 0))];
  return {
    warningText: uniq.length ? uniq.join("\n") : undefined,
    placedIds: ids,
    packingExhausted: packOutcome.exhausted,
    placedCollisionBoxes: [...placed],
  };
}

/** Public starter entry */
export function applyRoomTypeStarter(
  editor: Editor,
  starterId: RoomTypeStarterId,
  ctx: PlannerRoomStarterContext,
): string | undefined {
  return applyRoomTypeStarterInternal(editor, starterId, ctx, {}).warningText;
}

function generatedSeatedCapacity(editor: Editor, ids: readonly TLShapeId[]): number {
  return ids.reduce((sum, id) => {
    const shape = editor.getShape(id);
    if (!shape || !isPlannerTldrawShapeType(shape.type)) return sum;
    const props = shape.props as { capacitySeated?: unknown };
    return sum + (typeof props.capacitySeated === "number" ? props.capacitySeated : 0);
  }, 0);
}

/** Seats-only footprint LU² summed from placed primitives (table/row footprints). */
function sumSeatingFootprintLu2(editor: Editor, ids: readonly TLShapeId[]): number {
  let footprint = 0;
  for (const id of ids) {
    const shape = editor.getShape(id);
    if (!shape || !isPlannerTldrawShapeType(shape.type)) continue;
    const props = shape.props as { capacitySeated?: unknown; w?: unknown; h?: unknown };
    if (typeof props.capacitySeated !== "number" || props.capacitySeated <= 0) continue;
    const wLu = typeof props.w === "number" ? props.w / PLANNER_PAGE_SCALE : 0;
    const hLu = typeof props.h === "number" ? props.h / PLANNER_PAGE_SCALE : 0;
    footprint += Math.max(0, wLu * hLu);
  }
  return footprint;
}

/** Fit language after adaptive geometry — never co-mingles “physical overload” with “shortfall plating”. */
function geometryFitResolution(
  requestedCapacity: number,
  appliedSeatCapacity: number,
  circulationScore: number,
  prePackedHint: RoomSetFitStatus,
): RoomSetFitStatus {
  if (appliedSeatCapacity === 0 && requestedCapacity > 0) return "insufficient_space";
  if (appliedSeatCapacity < requestedCapacity) return "partial_fit";
  if (prePackedHint === "tight_fit" || circulationScore < 0.14) return "tight_fit";
  return "fits";
}

function applyPlannerPromptComponentAdditions(
  editor: Editor,
  config: RoomSetEventIntentGenerationConfig,
  ctx: PlannerRoomStarterContext,
  plan: RoomSetEventIntentPlan,
  componentDirectives: readonly PlannerComponentPlacementDirective[],
  plannerPrompt?: string,
  applyContext?: Readonly<{ priorAttendeeCount?: number }>,
): Readonly<{ promptSummaryLines: string[]; idsForMetrics: readonly TLShapeId[] }> {
  const promptSummaryLinesHost: string[] = ["Applied edit to current layout."];
  const priorAttendeeCount = applyContext?.priorAttendeeCount;
  if (
    priorAttendeeCount != null &&
    config.attendeeCount !== priorAttendeeCount
  ) {
    promptSummaryLinesHost.push(
      `Capacity target changed to ${config.attendeeCount} (was ${priorAttendeeCount}).`,
    );
  }
  let idsForMetrics: readonly TLShapeId[] = [];
  const densityPreference =
    plan.options.capacity?.densityPreference ?? config.densityPreference;
  editor.run(() => {
    const existingPeek = collectPlannerCollisionBoxesFromEditor(editor);
    let placedWorkingHost = [...existingPeek.placedCollisionBoxes];
    let idsWorkingHost = [...existingPeek.placedIds];
    const authoritativePrimary =
      plan.options.capacity?.primaryComponentId ?? dominantPrimarySeatingComponentId(editor);
    const editIntents = inferPlannerPromptEditIntents(
      plannerPrompt ?? "",
      editor,
      authoritativePrimary,
    );
    const handledComponentIds = new Set<RoomSetComponentId>();

    for (const intent of editIntents) {
      if (intent.kind === "changeCapacity") {
        const targetAttendees = clampNumber(config.attendeeCount, 1, 1200);
        const currentSeated = generatedSeatedCapacity(editor, idsWorkingHost);
        const shortfall = targetAttendees - currentSeated;
        if (shortfall <= 0) {
          promptSummaryLinesHost.push(
            `Capacity target ${targetAttendees} — canvas already plates ~${currentSeated} seats; no additional seating added.`,
          );
          continue;
        }
        const primaryId = authoritativePrimary;
        const perUnit = Math.max(1, seatedCapacityForComponent(primaryId));
        const unitsToAdd = clampNumber(Math.ceil(shortfall / perUnit), 1, 48);
        const directive: PlannerComponentPlacementDirective = {
          componentId: primaryId,
          count: unitsToAdd,
          placementPreference: intent.placementPreference,
          labelNoun: labelNounForCatalogComponent(primaryId),
        };
        const accepted = placePlannerComponentsInOpenInterior(
          editor,
          ctx,
          densityPreference,
          idsWorkingHost,
          placedWorkingHost,
          directive,
        );
        handledComponentIds.add(primaryId);
        const addedSeats = accepted * perUnit;
        if (accepted === unitsToAdd) {
          promptSummaryLinesHost.push(
            `Expanded seating toward ${targetAttendees}: added ${accepted} ${directive.labelNoun} (~${addedSeats} seats, was ~${currentSeated}).`,
          );
        } else if (accepted > 0) {
          promptSummaryLinesHost.push(
            `Expanded seating toward ${targetAttendees}: added ${accepted}/${unitsToAdd} ${directive.labelNoun} (~${currentSeated + addedSeats} plated).`,
          );
        } else {
          promptSummaryLinesHost.push(
            `Capacity target ${targetAttendees} (${shortfall} more seats needed) — no open interior space for additional ${directive.labelNoun}.`,
          );
        }
        continue;
      }

      if (intent.kind === "reflowSymmetric") {
        const symmetricCount = reflowSymmetricSeatingComponents(
          editor,
          ctx,
          densityPreference,
          idsWorkingHost,
          placedWorkingHost,
          intent.sourceComponentIds,
        );
        if (symmetricCount > 0) {
          promptSummaryLinesHost.push(
            `Centered and symmetrically reflowed ${symmetricCount} seating components on the current canvas.`,
          );
        } else {
          promptSummaryLinesHost.push(
            "Center/symmetric reflow: no matching seating components found on the current canvas.",
          );
        }
        continue;
      }

      if (intent.kind === "spreadSeating") {
        const spreadCount = spreadExistingTableComponents(
          editor,
          ctx,
          densityPreference,
          idsWorkingHost,
          placedWorkingHost,
        );
        if (spreadCount > 0) {
          promptSummaryLinesHost.push(`Reflowed/spread ${spreadCount} existing tables with wider spacing.`);
        } else {
          promptSummaryLinesHost.push("Spread tables: no existing banquet tables found on canvas to reflow.");
        }
        continue;
      }
      if ((intent.kind === "addComponent" || intent.kind === "expandSeating") && intent.targetComponentId) {
        const requested = clampNumber(Math.round(intent.count ?? 1), 1, 48);
        const directive: PlannerComponentPlacementDirective = {
          componentId: intent.targetComponentId,
          count: requested,
          placementPreference: intent.placementPreference,
          labelNoun: labelNounForCatalogComponent(intent.targetComponentId),
        };
        const accepted = placePlannerComponentsInOpenInterior(
          editor,
          ctx,
          densityPreference,
          idsWorkingHost,
          placedWorkingHost,
          directive,
        );
        handledComponentIds.add(intent.targetComponentId);
        const label = labelNounForCatalogComponent(intent.targetComponentId);
        if (intent.kind === "addComponent") {
          if (accepted === requested) {
            promptSummaryLinesHost.push(`Added ${accepted}/${requested} ${label}.`);
          } else if (accepted > 0) {
            promptSummaryLinesHost.push(`Added ${accepted}/${requested} ${label} due to available space.`);
          } else {
            promptSummaryLinesHost.push(`Could not add ${label}; no open interior space on current canvas.`);
          }
        } else {
          appendEditPlacementSummary(promptSummaryLinesHost, intent.kind, intent.targetComponentId, requested, accepted);
        }
        continue;
      }

      const matches = collectMatchingPlannerShapes(editor, intent.sourceComponentIds);
      if (matches.length === 0) {
        promptSummaryLinesHost.push(`Edit intent ${intent.kind}: no matching current canvas components found.`);
        continue;
      }

      if (intent.kind === "removeComponent") {
        editor.deleteShapes(matches.map((shape) => shape.id));
        removeIdsFromWorking(idsWorkingHost, matches.map((shape) => shape.id));
        const refreshed = collectPlannerCollisionBoxesFromEditor(editor);
        placedWorkingHost = [...refreshed.placedCollisionBoxes];
        idsWorkingHost = [...refreshed.placedIds];
        promptSummaryLinesHost.push(`Edit intent removeComponent: removed ${matches.length} matching components.`);
        continue;
      }

      if (intent.kind === "reduceSeating") {
        const removeCount = clampNumber(Math.round(intent.count ?? 1), 1, matches.length);
        const toRemove = [...matches]
          .sort((a, b) => b.y - a.y || b.x - a.x)
          .slice(0, removeCount);
        editor.deleteShapes(toRemove.map((shape) => shape.id));
        removeIdsFromWorking(idsWorkingHost, toRemove.map((shape) => shape.id));
        const refreshed = collectPlannerCollisionBoxesFromEditor(editor);
        placedWorkingHost = [...refreshed.placedCollisionBoxes];
        idsWorkingHost = [...refreshed.placedIds];
        promptSummaryLinesHost.push(`Edit intent reduceSeating: removed ${toRemove.length} seating rows.`);
        continue;
      }

      if (intent.kind === "replaceComponent" && intent.targetComponentId) {
        editor.deleteShapes(matches.map((shape) => shape.id));
        removeIdsFromWorking(idsWorkingHost, matches.map((shape) => shape.id));
        const refreshed = collectPlannerCollisionBoxesFromEditor(editor);
        placedWorkingHost = [...refreshed.placedCollisionBoxes];
        idsWorkingHost = [...refreshed.placedIds];
        const requested = replacementCountForIntent(
          intent,
          config.attendeeCount,
          matches.length,
        );
        const directive: PlannerComponentPlacementDirective = {
          componentId: intent.targetComponentId,
          count: requested,
          placementPreference: intent.placementPreference,
          labelNoun: labelNounForCatalogComponent(intent.targetComponentId),
        };
        const accepted = placePlannerComponentsInOpenInterior(
          editor,
          ctx,
          densityPreference,
          idsWorkingHost,
          placedWorkingHost,
          directive,
        );
        if (accepted === 0) {
          const restoredIds = restoreMatchedPlannerShapes(editor, matches);
          const afterRestore = collectPlannerCollisionBoxesFromEditor(editor);
          placedWorkingHost = [...afterRestore.placedCollisionBoxes];
          idsWorkingHost = [...afterRestore.placedIds];
          promptSummaryLinesHost.push(
            `Edit intent replaceComponent: no ${directive.labelNoun} fit, so the original ${restoredIds.length} components were restored.`,
          );
          continue;
        }
        const replacedChairRowsWithRoundTables =
          intent.targetComponentId === "table-round-60" &&
          intent.sourceComponentIds.some((componentId) =>
            CHAIR_ROW_COMPONENT_IDS.includes(componentId as (typeof CHAIR_ROW_COMPONENT_IDS)[number]),
          );
        if (replacedChairRowsWithRoundTables) {
          promptSummaryLinesHost.push(
            "Replaced chair seating with round tables.",
            `Replaced ${matches.length} chair rows with ${accepted} round tables.`,
          );
        } else {
          promptSummaryLinesHost.push(
            `Replaced ${matches.length} matching components with ${accepted} ${directive.labelNoun}.`,
          );
        }
        continue;
      }

      if (intent.kind === "moveComponent") {
        const byComponentId = new Map<RoomSetComponentId, number>();
        for (const match of matches) {
          byComponentId.set(match.componentId, (byComponentId.get(match.componentId) ?? 0) + 1);
        }
        editor.deleteShapes(matches.map((shape) => shape.id));
        removeIdsFromWorking(idsWorkingHost, matches.map((shape) => shape.id));
        const refreshed = collectPlannerCollisionBoxesFromEditor(editor);
        placedWorkingHost = [...refreshed.placedCollisionBoxes];
        idsWorkingHost = [...refreshed.placedIds];
        for (const [componentId, requested] of byComponentId) {
          const directive: PlannerComponentPlacementDirective = {
            componentId,
            count: requested,
            placementPreference: intent.placementPreference,
            labelNoun: labelNounForCatalogComponent(componentId),
          };
          const accepted = placePromptSecondaryComponentsInBands(
            editor,
            ctx,
            densityPreference,
            idsWorkingHost,
            placedWorkingHost,
            directive,
          );
          appendEditPlacementSummary(promptSummaryLinesHost, intent.kind, componentId, requested, accepted);
        }
      }
    }

    for (const directive of componentDirectives) {
      if (handledComponentIds.has(directive.componentId)) continue;
      const acceptedSecondaryPeek = placePromptSecondaryComponentsInBands(
        editor,
        ctx,
        densityPreference,
        idsWorkingHost,
        placedWorkingHost,
        directive,
      );
      appendPromptSecondaryPlacementSummary(promptSummaryLinesHost, directive, acceptedSecondaryPeek);
    }

    if (idsWorkingHost.length > 0) editor.setSelectedShapes(idsWorkingHost);
    idsForMetrics = idsWorkingHost;
  });
  return { promptSummaryLines: promptSummaryLinesHost, idsForMetrics };
}

export function applyRoomSetEventIntentStarter(
  editor: Editor,
  config: RoomSetEventIntentGenerationConfig,
  ctx: PlannerRoomStarterContext,
  applyOptions?: Readonly<{
    plannerPrompt?: string;
    generationMode?: RoomSetPlannerGenerationMode;
    applyContext?: Readonly<{ priorAttendeeCount?: number }>;
  }>,
): RoomSetEventIntentApplyResult {
  const plannerPrompt = applyOptions?.plannerPrompt?.trim() ?? "";
  const plan = resolveRoomSetEventIntentPlan(config, plannerPrompt || undefined);
  const componentRequests = resolvePlannerComponentRequests(config, plannerPrompt || undefined);
  const componentDirectives = aggregatedComponentPlacementDirectives(componentRequests);
  const generationMode =
    applyOptions?.generationMode ??
    inferPlannerGenerationMode(applyOptions?.plannerPrompt?.trim() ?? "");

  if (generationMode === "additive") {
    const additivePeek = applyPlannerPromptComponentAdditions(
      editor,
      config,
      ctx,
      plan,
      componentDirectives,
      applyOptions?.plannerPrompt,
      applyOptions?.applyContext,
    );
    const appliedSeatCapacity = generatedSeatedCapacity(editor, additivePeek.idsForMetrics);
    const shell = starterInteriorBoxes(ctx);
    const usableInteriorLu =
      Math.max(shell.iw / PLANNER_PAGE_SCALE, 1e-6) * Math.max(shell.ih / PLANNER_PAGE_SCALE, 1e-6);
    const seatingFootprintLu2 = sumSeatingFootprintLu2(editor, additivePeek.idsForMetrics);
    const footprintRatio =
      usableInteriorLu <= 1e-9 ? 1 : Math.min(1, seatingFootprintLu2 / usableInteriorLu);
    const circulationScore = Math.max(0, Math.min(1, 1 - footprintRatio));
    return {
      ...plan.validation,
      appliedSeatCapacity,
      densityScore:
        plan.validation.requestedCapacity <= 0
          ? null
          : Math.min(1, appliedSeatCapacity / plan.validation.requestedCapacity),
      circulationScore,
      packingExhausted: false,
      fitStatus: geometryFitResolution(
        plan.validation.requestedCapacity,
        appliedSeatCapacity,
        circulationScore,
        plan.validation.fitStatus,
      ),
      validationWarnings: plan.validation.validationWarnings,
      promptDrivenSecondarySummaryLines: additivePeek.promptSummaryLines,
    };
  }

  const mingleDirective = componentDirectives.find((row) => row.componentId === "table-cocktail-cluster");

  const starterOptions: StarterCompositionOptions =
    plan.starterId === "banquet" && mingleDirective && mingleDirective.count > 0
      ? {
          ...plan.options,
          promptSecondaryReserve: {
            cocktailClusters: mingleDirective.count,
            placementPreference: mingleDirective.placementPreference,
          },
        }
      : plan.options;

  const applied = applyRoomTypeStarterInternal(editor, plan.starterId, ctx, starterOptions);

  const promptSummaryLinesHost: string[] = [];
  let idsForMetrics: readonly TLShapeId[] = applied.placedIds;

  const componentDirectivesForPlacement = componentDirectives.filter((directive) => directive.count > 0);
  if (componentDirectivesForPlacement.length > 0) {
    editor.run(() => {
      const placedWorkingHost = [...applied.placedCollisionBoxes];
      const idsWorkingHost = [...applied.placedIds];
      for (const directive of componentDirectivesForPlacement) {
        const acceptedSecondaryPeek = placePromptSecondaryComponentsInBands(
          editor,
          ctx,
          plan.options.capacity?.densityPreference,
          idsWorkingHost,
          placedWorkingHost,
          directive,
        );
        appendPromptSecondaryPlacementSummary(promptSummaryLinesHost, directive, acceptedSecondaryPeek);
      }
      editor.setSelectedShapes(idsWorkingHost);
      idsForMetrics = idsWorkingHost;
    });
  }

  const appliedSeatCapacity = generatedSeatedCapacity(editor, idsForMetrics);
  const shell = starterInteriorBoxes(ctx);
  const usableInteriorLu =
    Math.max(shell.iw / PLANNER_PAGE_SCALE, 1e-6) * Math.max(shell.ih / PLANNER_PAGE_SCALE, 1e-6);
  const seatingFootprintLu2 = sumSeatingFootprintLu2(editor, idsForMetrics);
  const footprintRatio =
    usableInteriorLu <= 1e-9 ? 1 : Math.min(1, seatingFootprintLu2 / usableInteriorLu);
  const circulationScore = Math.max(0, Math.min(1, 1 - footprintRatio));
  const densityScore =
    plan.validation.requestedCapacity <= 0 ? null : Math.min(1, appliedSeatCapacity / plan.validation.requestedCapacity);
  const fitStatus = geometryFitResolution(
    plan.validation.requestedCapacity,
    appliedSeatCapacity,
    circulationScore,
    plan.validation.fitStatus,
  );
  const packingExhausted = applied.packingExhausted;
  const validationWarnings = [
    ...plan.validation.validationWarnings,
    appliedSeatCapacity < plan.validation.requestedCapacity
      ? plan.starterId === "banquet"
        ? `Banquet plating: ${appliedSeatCapacity}/${plan.validation.requestedCapacity} staged seats (${plan.validation.plannedSeatCapacity} arithmetic ceiling via ${plan.options.capacity?.primaryComponentId ?? "tables"} primitives). Packing stopped early or grid exhausted — see banquet warnings above.`
        : `Partial plating: ${appliedSeatCapacity} seats placed vs ${plan.validation.requestedCapacity} requested (${plan.validation.plannedSeatCapacity} arithmetic plan ceiling).`
      : null,
  ].filter((line): line is string => line !== null);
  return {
    ...plan.validation,
    appliedSeatCapacity,
    densityScore,
    circulationScore,
    packingExhausted,
    fitStatus,
    validationWarnings,
    warningText: applied.warningText,
    promptDrivenSecondarySummaryLines: promptSummaryLinesHost.length ? promptSummaryLinesHost : undefined,
  };
}
