/**
 * Apply-to-current-layout edit plan — prompt intent is authoritative over stale metadata.
 * Server-safe except canvas inventory is supplied by the client editor scan.
 */

import type { RoomSetComponentId } from "@/lib/room-set/component-library";

import {
  buildPlannerComponentRequestsWithProvenance,
  inferCapacityTargetFromPrompt,
  type RoomSetComponentRequestInterpretationMeta,
  type RoomSetPlannerComponentRequest,
  resolveAccessibilityPriorityForApply,
} from "./planner-component-requests";
import type {
  RoomSetDensityPreference,
  RoomSetEventIntentId,
  RoomSetOperationalBrief,
  RoomTypeStarterId,
} from "./planner-intent-shared";
import {
  inferPrimarySeatingComponentFromPrompt,
  isPrimarySeatingComponentId,
  operationalBriefWithPrimarySeating,
  primarySeatingCapacity,
  starterIdFromPrimaryComponentId,
} from "./planner-seating-resolve";

/** Mirrors canvas edit intent kinds (server-safe; client supplies via inferRoomSetPlannerEditIntentKinds). */
export type ApplyEditOperationKind =
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

export type CanvasLayoutInventory = Readonly<{
  seatedCapacity: number;
  dominantPrimarySeatingComponentId: RoomSetComponentId | null;
  tableCount: number;
  chairRowCount: number;
}>;

export type ApplyLayoutContext = Readonly<{
  intentId: RoomSetEventIntentId;
  attendeeCount: number;
  densityPreference: RoomSetDensityPreference;
  accessibilityPriority: boolean;
  primarySeatingComponentId: RoomSetComponentId;
  seatingStyle: RoomTypeStarterId;
  componentRequests: readonly RoomSetPlannerComponentRequest[];
  componentRequestInterpretation?: RoomSetComponentRequestInterpretationMeta;
}>;

export type ApplyUserIntentSnapshot = Readonly<{
  promptPrimarySeating: RoomSetComponentId | null;
  promptCapacityTarget: number | null;
  aiInterpretationSucceeded: boolean;
  interpretFailureReason: string | null;
}>;

export type ResolvedApplyEditPlan = Readonly<{
  mode: "apply";
  prompt: string;
  previousContext: ApplyLayoutContext;
  userIntent: ApplyUserIntentSnapshot;
  finalContext: ApplyLayoutContext;
  operationKinds: readonly ApplyEditOperationKind[];
  interpretFailureReason: string | null;
}>;

function clampAttendeeCount(value: number): number {
  return Math.max(1, Math.min(1200, Math.round(value)));
}

function resolvePrimarySeatingAuthoritative(args: Readonly<{
  prompt: string;
  canvasDominant: RoomSetComponentId | null;
  aiBrief: RoomSetOperationalBrief | null;
  briefPrimary: RoomSetComponentId;
  archetypeStarterId: RoomTypeStarterId;
}>): RoomSetComponentId {
  const promptPrimary = inferPrimarySeatingComponentFromPrompt(args.prompt);
  if (promptPrimary) return promptPrimary;

  if (args.canvasDominant && isPrimarySeatingComponentId(args.canvasDominant)) {
    return args.canvasDominant;
  }

  if (
    args.aiBrief &&
    isPrimarySeatingComponentId(args.aiBrief.capacityStrategy.primaryComponentId) &&
    !promptPrimary
  ) {
    return args.aiBrief.capacityStrategy.primaryComponentId;
  }

  if (isPrimarySeatingComponentId(args.briefPrimary)) return args.briefPrimary;

  switch (args.archetypeStarterId) {
    case "banquet":
      return "table-round-60";
    case "classroom":
      return "seating-classroom-row";
    case "reception":
      return "table-cocktail-cluster";
    case "theater":
    default:
      return "seating-theater-row";
  }
}

function layoutContextFromBrief(
  brief: RoomSetOperationalBrief,
  componentRequests: readonly RoomSetPlannerComponentRequest[],
  componentRequestInterpretation?: RoomSetComponentRequestInterpretationMeta,
): ApplyLayoutContext {
  return {
    intentId: brief.eventIntent,
    attendeeCount: brief.requestedAttendees,
    densityPreference: brief.densityPreference,
    accessibilityPriority: brief.accessibilityPriority,
    primarySeatingComponentId: brief.capacityStrategy.primaryComponentId,
    seatingStyle: brief.capacityStrategy.seatingStyle,
    componentRequests,
    componentRequestInterpretation,
  };
}

export function resolveApplyEditPlan(args: Readonly<{
  prompt: string;
  operationKinds: readonly ApplyEditOperationKind[];
  sidebar: Readonly<{
    intentId: RoomSetEventIntentId;
    attendeeCount: number;
    densityPreference: RoomSetDensityPreference;
    accessibilityPriority: boolean;
  }>;
  canvas: CanvasLayoutInventory;
  aiBrief: RoomSetOperationalBrief | null;
  priorBrief: RoomSetOperationalBrief | null;
  interpretFailureReason: string | null;
}>): ResolvedApplyEditPlan {
  const prompt = args.prompt.trim();
  const archetypeStarterId =
    args.priorBrief?.capacityStrategy.seatingStyle ??
    starterIdFromPrimaryComponentId(
      args.canvas.dominantPrimarySeatingComponentId ?? "seating-theater-row",
    ) ??
    "theater";

  const briefSeed =
    args.priorBrief ??
    ({
      archetype: args.sidebar.intentId,
      eventIntent: args.sidebar.intentId,
      requestedAttendees: args.sidebar.attendeeCount,
      attendeeCount: args.sidebar.attendeeCount,
      productionScale: "moderate",
      densityPreference: args.sidebar.densityPreference,
      servicePriorities: ["seating_capacity", "egress"],
      accessibilityPriority: args.sidebar.accessibilityPriority,
      requiredZones: [],
      optionalZones: [],
      capacityStrategy: {
        requestedSeats: args.sidebar.attendeeCount,
        seatingStyle: archetypeStarterId,
        capacityIsHardRequirement: true,
        primaryComponentId: resolvePrimarySeatingAuthoritative({
          prompt: "",
          canvasDominant: args.canvas.dominantPrimarySeatingComponentId,
          aiBrief: null,
          briefPrimary: "seating-theater-row",
          archetypeStarterId,
        }),
        primaryComponentCapacity:
          primarySeatingCapacity(
            resolvePrimarySeatingAuthoritative({
              prompt: "",
              canvasDominant: args.canvas.dominantPrimarySeatingComponentId,
              aiBrief: null,
              briefPrimary: "seating-theater-row",
              archetypeStarterId,
            }),
          ) ?? 8,
        requiredPrimaryComponents: 1,
        plannedPrimaryComponents: 1,
        overflowPolicy: "recommend_larger_room",
      },
      layoutTradeoffs: [],
      operationalRisks: [],
      assumptions: [],
      generationInstructions: [],
      presentationScale: "moderate",
      stageScale: "moderate",
      avScale: "moderate",
      seatingPriority: 0.8,
      networkingPriority: 0.2,
      fnbPriority: 0.2,
      notes: [],
      componentRequests: [],
    } satisfies RoomSetOperationalBrief);

  const previousPrimary = resolvePrimarySeatingAuthoritative({
    prompt: "",
    canvasDominant: args.canvas.dominantPrimarySeatingComponentId,
    aiBrief: args.priorBrief,
    briefPrimary: briefSeed.capacityStrategy.primaryComponentId,
    archetypeStarterId: briefSeed.capacityStrategy.seatingStyle,
  });

  const previousContext: ApplyLayoutContext = {
    intentId: briefSeed.eventIntent,
    attendeeCount: clampAttendeeCount(
      briefSeed.requestedAttendees ?? args.sidebar.attendeeCount,
    ),
    densityPreference: briefSeed.densityPreference,
    accessibilityPriority: args.sidebar.accessibilityPriority,
    primarySeatingComponentId: previousPrimary,
    seatingStyle:
      starterIdFromPrimaryComponentId(previousPrimary) ?? briefSeed.capacityStrategy.seatingStyle,
    componentRequests: [...briefSeed.componentRequests],
    componentRequestInterpretation: briefSeed.componentRequestInterpretation,
  };

  const promptPrimarySeating = inferPrimarySeatingComponentFromPrompt(prompt);
  const promptCapacityTarget = inferCapacityTargetFromPrompt(prompt);

  const aiSucceeded = args.aiBrief != null && !args.interpretFailureReason;
  const componentResolution = buildPlannerComponentRequestsWithProvenance(
    args.aiBrief?.componentRequests ?? [],
    prompt,
    clampAttendeeCount(
      promptCapacityTarget ?? previousContext.attendeeCount,
    ),
    aiSucceeded,
  );

  const finalPrimary = resolvePrimarySeatingAuthoritative({
    prompt,
    canvasDominant: args.canvas.dominantPrimarySeatingComponentId,
    aiBrief: args.aiBrief,
    briefPrimary: previousContext.primarySeatingComponentId,
    archetypeStarterId: previousContext.seatingStyle,
  });

  const finalAttendeeCount = clampAttendeeCount(
    promptCapacityTarget ?? previousContext.attendeeCount,
  );

  const finalAccessibility = resolveAccessibilityPriorityForApply(
    prompt,
    previousContext.accessibilityPriority,
  );

  let mergedBrief: RoomSetOperationalBrief = {
    ...(args.aiBrief ?? briefSeed),
    requestedAttendees: finalAttendeeCount,
    attendeeCount: finalAttendeeCount,
    densityPreference: args.sidebar.densityPreference,
    accessibilityPriority: finalAccessibility,
    componentRequests: componentResolution.requests,
    componentRequestInterpretation: componentResolution.interpretation,
  };

  mergedBrief = operationalBriefWithPrimarySeating(
    mergedBrief,
    finalPrimary,
    finalAttendeeCount,
  );

  const finalContext = layoutContextFromBrief(
    mergedBrief,
    componentResolution.requests,
    componentResolution.interpretation,
  );

  return {
    mode: "apply",
    prompt,
    previousContext,
    userIntent: {
      promptPrimarySeating,
      promptCapacityTarget,
      aiInterpretationSucceeded: aiSucceeded,
      interpretFailureReason: args.interpretFailureReason,
    },
    finalContext,
    operationKinds: args.operationKinds,
    interpretFailureReason: args.interpretFailureReason,
  };
}

export function generationConfigFromApplyPlan(applyPlan: ResolvedApplyEditPlan): Readonly<{
  intentId: RoomSetEventIntentId;
  attendeeCount: number;
  densityPreference: RoomSetDensityPreference;
  accessibilityPriority: boolean;
  operationalBrief: RoomSetOperationalBrief;
  componentRequests: readonly RoomSetPlannerComponentRequest[];
  componentRequestInterpretation?: RoomSetComponentRequestInterpretationMeta;
}> {
  const { finalContext } = applyPlan;
  const brief = operationalBriefWithPrimarySeating(
    {
      archetype: finalContext.intentId,
      eventIntent: finalContext.intentId,
      requestedAttendees: finalContext.attendeeCount,
      attendeeCount: finalContext.attendeeCount,
      productionScale: "moderate",
      densityPreference: finalContext.densityPreference,
      servicePriorities: ["seating_capacity", "egress"],
      accessibilityPriority: finalContext.accessibilityPriority,
      requiredZones: ["primary audience seating", "front presentation", "circulation / egress"],
      optionalZones: [],
      capacityStrategy: {
        requestedSeats: finalContext.attendeeCount,
        seatingStyle: finalContext.seatingStyle,
        capacityIsHardRequirement: true,
        primaryComponentId: finalContext.primarySeatingComponentId,
        primaryComponentCapacity:
          primarySeatingCapacity(finalContext.primarySeatingComponentId) ?? 8,
        requiredPrimaryComponents: Math.max(
          1,
          Math.ceil(
            finalContext.attendeeCount /
              Math.max(1, primarySeatingCapacity(finalContext.primarySeatingComponentId) ?? 8),
          ),
        ),
        plannedPrimaryComponents: Math.max(
          1,
          Math.ceil(
            finalContext.attendeeCount /
              Math.max(1, primarySeatingCapacity(finalContext.primarySeatingComponentId) ?? 8),
          ),
        ),
        overflowPolicy: "recommend_larger_room",
      },
      layoutTradeoffs: [],
      operationalRisks: [],
      assumptions: [],
      generationInstructions: [],
      presentationScale: "moderate",
      stageScale: "moderate",
      avScale: "moderate",
      seatingPriority: 0.8,
      networkingPriority: 0.2,
      fnbPriority: 0.2,
      notes: [],
      componentRequests: finalContext.componentRequests,
      componentRequestInterpretation: finalContext.componentRequestInterpretation,
    },
    finalContext.primarySeatingComponentId,
    finalContext.attendeeCount,
  );

  return {
    intentId: finalContext.intentId,
    attendeeCount: finalContext.attendeeCount,
    densityPreference: finalContext.densityPreference,
    accessibilityPriority: finalContext.accessibilityPriority,
    operationalBrief: brief,
    componentRequests: finalContext.componentRequests,
    componentRequestInterpretation: finalContext.componentRequestInterpretation,
  };
}
