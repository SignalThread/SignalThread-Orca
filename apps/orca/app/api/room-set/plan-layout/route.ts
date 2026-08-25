import { NextRequest, NextResponse } from "next/server";

import {
  inferAccessibilityPriorityFromPrompt,
  inferCapacityTargetFromPrompt,
} from "@/lib/room-set/planner-component-requests";
import {
  extractJsonObject,
  normalizeRoomSetInterpretation,
  ROOM_SET_EVENT_INTENTS,
} from "@/lib/room-set/planner-intent-normalize";
import {
  operationalBriefWithAttendeeCount,
  normalizeRoomSetDensityControl,
  normalizeRoomSetLayoutStylePreference,
} from "@/lib/room-set/planner-intent-shared";
import type {
  RoomSetOperationalBrief,
  RoomSetDensityControl,
  RoomSetLayoutStylePreference,
} from "@/lib/room-set/planner-intent-shared";
import {
  normalizeCanvasSnapshotFromUnknown,
  normalizeLayoutPlacementsFromUnknown,
  type RoomSetAiLayoutPlanMode,
} from "@/lib/room-set/planner-layout-schema";
import { plannerSceneFromLayoutPlacements } from "@/lib/room-set/planner-scene";
import { composePlannerLayoutPlacements } from "@/lib/room-set/planner-layout-compose";
import { composeLayoutSpec } from "@/lib/room-set/layout-spec-compose";
import { composeLayoutSpecForApply, buildApplyLayoutSummary } from "@/lib/room-set/layout-spec-apply-compose";
import {
  composeLayoutSpecWithGracefulFallback,
  failedApplyMessage,
  failedGenerationMessage,
} from "@/lib/room-set/planner-layout-graceful-fallback";
import {
  interpretationFromLayoutSpec,
  normalizeLayoutSpecFromUnknown,
  stripSyntheticPolicyFromLayoutSpec,
} from "@/lib/room-set/layout-spec-normalize";
import { finalizeGenerateLayoutSpec, inferAudienceStyleFromPrompt } from "@/lib/room-set/layout-spec-generate-resolve";
import type { LayoutSpec } from "@/lib/room-set/layout-spec";
import { applyLayoutPatch, summarizeLayoutSpecSecondary } from "@/lib/room-set/layout-patch-apply";
import {
  normalizeLayoutPatchFromUnknown,
  summarizeLayoutPatchNormalizeFailures,
  summarizeLayoutPatchOps,
} from "@/lib/room-set/layout-patch-normalize";
import { supplementLayoutPatchFromPrompt } from "@/lib/room-set/layout-patch-prompt-supplement";
import { supplementLayoutPatchTopologyFromPrompt } from "@/lib/room-set/layout-patch-topology-supplement";
import {
  buildDeterministicApplyLayoutPatch,
  supplementLayoutPatchSeatingStyleFromPrompt,
} from "@/lib/room-set/layout-patch-deterministic-fallback";
import type { LayoutPatch } from "@/lib/room-set/layout-spec";
import {
  formatPlannerLayoutValidationErrors,
  plannerValidationIssuesToFailureDetails,
  sumPlatedSeatCapacity,
  validatePlannerLayoutPlacements,
} from "@/lib/room-set/planner-layout-validator";
import {
  applySpatialDirectivesToLayout,
  inferSpatialApplyDirectives,
} from "@/lib/room-set/layout-spatial-directives";
import { resolveRoomSetOpenAiModel, buildRoomSetOpenAiChatCompletionBody, resolveRoomSetOpenAiRequestOptions } from "@/lib/room-set/openai-model-config";
import { alignOperationalBriefToPlacements } from "@/lib/room-set/planner-seating-resolve";
import {
  GENERATE_LAYOUT_SYNTHETIC_POLICY_PROMPT_RULE,
  roomSetGenerateLayoutComponentIds,
  userExplicitlyRequestedSyntheticPolicyComponents,
} from "@/lib/room-set/planner-synthetic-policy";
import { ROOM_SET_COMPONENTS } from "@/lib/room-set/component-library";
import type { RoomSetComponentId } from "@/lib/room-set/component-library";
import type {
  RoomSetPlanFailureDetails,
  RoomSetPlanResultMessage,
} from "@/lib/room-set/spatial-types";

import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { roomSetAndSeatingUnavailableResponse } from "@/lib/room-set/availability";

export const runtime = "nodejs";

const PLACEABLE_COMPONENT_IDS = ROOM_SET_COMPONENTS.map(
  (component) => component.id,
) as readonly RoomSetComponentId[];

const DENSITY_PREFERENCES = ["premium", "balanced", "compact"] as const;
const AUDIENCE_STYLES = ["grid", "loose", "scattered", "arc"] as const;
const SCALES = ["none", "light", "moderate", "production"] as const;
const SERVICE_PRIORITIES = [
  "seating_capacity",
  "sightlines",
  "distributed_power",
  "breakout_collaboration",
  "teaching_av",
  "registration",
  "fnb",
  "networking",
  "recording",
  "egress",
  "accessibility",
  "service_flow",
] as const;
const ROOM_TYPE_STARTERS = ["banquet", "classroom", "theater", "reception"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampAttendees(value: number): number {
  return Math.max(1, Math.min(1200, Math.round(value)));
}

function finalizeInterpretation(args: Readonly<{
  interpretation: RoomSetOperationalBrief;
  prompt: string;
  priorAttendeeCount: number;
  sidebarAccessibility: boolean;
  capacityChangeRequested: boolean;
  promptCapacityTarget: number | null;
}>): RoomSetOperationalBrief {
  const capacityChangeRequested = args.capacityChangeRequested;
  const attendeeCount =
    args.promptCapacityTarget !== null
      ? clampAttendees(args.promptCapacityTarget)
      : capacityChangeRequested
        ? clampAttendees(args.interpretation.requestedAttendees)
        : clampAttendees(args.priorAttendeeCount);

  let brief = capacityChangeRequested
    ? operationalBriefWithAttendeeCount(args.interpretation, attendeeCount)
    : {
        ...args.interpretation,
        requestedAttendees: attendeeCount,
        attendeeCount,
        capacityStrategy: {
          ...args.interpretation.capacityStrategy,
          requestedSeats: attendeeCount,
        },
      };

  const accessibilityPriority = inferAccessibilityPriorityFromPrompt(args.prompt)
    ? true
    : args.sidebarAccessibility;

  brief = {
    ...brief,
    accessibilityPriority,
    componentRequests: [],
    componentRequestInterpretation: undefined,
  };

  return brief;
}

function appendComposeWarnings(
  brief: RoomSetOperationalBrief,
  warnings: readonly string[],
): RoomSetOperationalBrief {
  if (warnings.length === 0) return brief;
  const normalizedWarnings = [...new Set(warnings.map((warning) => warning.trim()).filter(Boolean))];
  return {
    ...brief,
    operationalRisks: [...brief.operationalRisks, ...normalizedWarnings].slice(0, 6),
  };
}

function successResultMessage(): RoomSetPlanResultMessage {
  return {
    resultStatus: "success",
    userMessageTitle: "Last Generation",
    userMessageBody: "Layout created successfully.",
    adjustments: [],
    suggestions: [],
  };
}

function failedResultResponse(args: Readonly<{
  mode: RoomSetAiLayoutPlanMode;
  debugReason: string;
  failureDetails?: RoomSetPlanFailureDetails;
  timingMs: number;
  currentLayout?: ReturnType<typeof normalizeCanvasSnapshotFromUnknown>;
}>): NextResponse {
  const message =
    args.mode === "apply"
      ? failedApplyMessage(args.debugReason, args.failureDetails)
      : failedGenerationMessage(args.debugReason, args.failureDetails);
  return NextResponse.json({
    mode: args.mode,
    ...message,
    placements: args.currentLayout?.placements ?? [],
    scene: args.currentLayout
      ? plannerSceneFromLayoutPlacements(args.currentLayout.placements, {
          widthLu: args.currentLayout.roomWidthLu,
          depthLu: args.currentLayout.roomDepthLu,
        })
      : null,
    capacityChangeRequested: false,
    appliedSeatCapacity: args.currentLayout
      ? sumPlatedSeatCapacity(args.currentLayout.placements)
      : 0,
    timingMs: args.timingMs,
  });
}

const interpretationSchemaProperties = {
  archetype: { type: "string", enum: ROOM_SET_EVENT_INTENTS },
  eventIntent: { type: "string", enum: ROOM_SET_EVENT_INTENTS },
  requestedAttendees: { type: "integer", minimum: 1, maximum: 1200 },
  attendeeCount: { type: "integer", minimum: 1, maximum: 1200 },
  productionScale: { type: "string", enum: SCALES },
  densityPreference: { type: "string", enum: DENSITY_PREFERENCES },
  servicePriorities: {
    type: "array",
    items: { type: "string", enum: SERVICE_PRIORITIES },
    maxItems: 12,
  },
  requiredZones: { type: "array", items: { type: "string" }, maxItems: 8 },
  optionalZones: { type: "array", items: { type: "string" }, maxItems: 8 },
  capacityStrategy: {
    type: "object",
    additionalProperties: false,
    properties: {
      requestedSeats: { type: "integer", minimum: 1, maximum: 1200 },
      seatingStyle: { type: "string", enum: ROOM_TYPE_STARTERS },
      capacityIsHardRequirement: { type: "boolean" },
      primaryComponentId: { type: "string", enum: PLACEABLE_COMPONENT_IDS },
      primaryComponentCapacity: { type: "integer", minimum: 1, maximum: 24 },
      requiredPrimaryComponents: { type: "integer", minimum: 1, maximum: 400 },
      plannedPrimaryComponents: { type: "integer", minimum: 1, maximum: 400 },
      overflowPolicy: {
        type: "string",
        enum: ["warn", "reduce_secondary_zones", "recommend_larger_room"],
      },
    },
    required: [
      "requestedSeats",
      "seatingStyle",
      "capacityIsHardRequirement",
      "primaryComponentId",
      "primaryComponentCapacity",
      "requiredPrimaryComponents",
      "plannedPrimaryComponents",
      "overflowPolicy",
    ],
  },
  layoutTradeoffs: { type: "array", items: { type: "string" }, maxItems: 6 },
  operationalRisks: { type: "array", items: { type: "string" }, maxItems: 6 },
  generationInstructions: { type: "array", items: { type: "string" }, maxItems: 6 },
  presentationScale: { type: "string", enum: SCALES },
  seatingPriority: { type: "number", minimum: 0, maximum: 1 },
  networkingPriority: { type: "number", minimum: 0, maximum: 1 },
  fnbPriority: { type: "number", minimum: 0, maximum: 1 },
  accessibilityPriority: { type: "boolean" },
  stageScale: { type: "string", enum: SCALES },
  avScale: { type: "string", enum: SCALES },
  notes: { type: "array", items: { type: "string" }, maxItems: 6 },
  assumptions: { type: "array", items: { type: "string" }, maxItems: 6 },
  componentRequests: {
    type: "array",
    maxItems: 0,
    items: { type: "object", additionalProperties: false, properties: {} },
  },
} as const;

const LAYOUT_SPEC_ZONE_ROLES = ["front", "audience", "perimeter", "rear", "mixed"] as const;
const LAYOUT_SPEC_PLACEMENT_PREFERENCES = ["side", "rear", "perimeter", "front", "mixed"] as const;

function buildLayoutSpecItemSchema(allowedComponentIds: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      componentId: { type: "string", enum: allowedComponentIds },
      count: { type: "integer", minimum: 1, maximum: 400 },
      zoneRole: { type: ["string", "null"], enum: [...LAYOUT_SPEC_ZONE_ROLES, null] },
      placementPreference: {
        type: ["string", "null"],
        enum: [...LAYOUT_SPEC_PLACEMENT_PREFERENCES, null],
      },
      label: { type: ["string", "null"] },
    },
    required: ["componentId", "count", "zoneRole", "placementPreference", "label"],
  } as const;
}

function buildOptionalLayoutSpecItemSchema(allowedComponentIds: readonly string[]) {
  return {
    anyOf: [{ type: "null" }, buildLayoutSpecItemSchema(allowedComponentIds)],
  } as const;
}

function buildGenerateLayoutSchema(allowedComponentIds: readonly string[]) {
  const itemSchema = buildLayoutSpecItemSchema(allowedComponentIds);
  const optionalItemSchema = buildOptionalLayoutSpecItemSchema(allowedComponentIds);
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      layoutSpec: {
        type: "object",
        additionalProperties: false,
        properties: {
          eventIntent: { type: "string", enum: ROOM_SET_EVENT_INTENTS },
          layoutType: { type: "string", enum: ROOM_TYPE_STARTERS },
          attendeeTarget: { type: "integer", minimum: 1, maximum: 1200 },
          densityPreference: { type: "string", enum: DENSITY_PREFERENCES },
          audienceStyle: { type: "string", enum: AUDIENCE_STYLES },
          front: {
            type: "object",
            additionalProperties: false,
            properties: {
              screen: optionalItemSchema,
              stage: optionalItemSchema,
              av: { type: "array", items: itemSchema, maxItems: 24 },
            },
            required: ["screen", "stage", "av"],
          },
          audience: {
            type: "object",
            additionalProperties: false,
            properties: {
              primaryComponentId: { type: "string", enum: allowedComponentIds },
              primaryComponentCapacity: { type: "integer", minimum: 1, maximum: 24 },
              requiredPrimaryComponents: { type: "integer", minimum: 1, maximum: 400 },
            },
            required: [
              "primaryComponentId",
              "primaryComponentCapacity",
              "requiredPrimaryComponents",
            ],
          },
          secondary: { type: "array", items: itemSchema, maxItems: 48 },
        },
        required: [
          "eventIntent",
          "layoutType",
          "attendeeTarget",
          "densityPreference",
          "audienceStyle",
          "front",
          "audience",
          "secondary",
        ],
      },
      capacityChangeRequested: { type: "boolean" },
      accessibilityChangeRequested: { type: "boolean" },
    },
    required: ["layoutSpec", "capacityChangeRequested", "accessibilityChangeRequested"],
  } as const;
}

async function handleGenerateLayoutRequest(args: Readonly<{
  requestStartedMs: number;
  apiKey: string;
  prompt: string;
  roomWidthLu: number;
  roomDepthLu: number;
  priorAttendeeCount: number;
  sidebarAccessibility: boolean;
  sidebarDensityPreference: RoomSetDensityControl;
  sidebarLayoutStyle: RoomSetLayoutStylePreference;
}>): Promise<NextResponse> {
  const allowedComponentIds = roomSetGenerateLayoutComponentIds(args.prompt);
  const generateSchema = buildGenerateLayoutSchema(allowedComponentIds);

  const systemPrompt = [
    "You are the Room Set layout intent planner for Generate mode.",
    "Return a semantic layoutSpec only. Do not return coordinates, placements, x/y positions, or geometry.",
    "A deterministic server-side composer will place every object.",
    GENERATE_LAYOUT_SYNTHETIC_POLICY_PROMPT_RULE,
    "layoutSpec.front: optional screen and stage items plus av support items (speakers, FOH, confidence monitors).",
    "layoutSpec.audience: primary seating or table componentId, seats per unit, and requiredPrimaryComponents count.",
    "layoutSpec.secondary: F&B, registration, decor, lounge, and other non-primary catalog items.",
    "Each item uses componentId, count, and optional placementPreference (perimeter, side, rear, front, mixed).",
    "Set layoutType and eventIntent to match the prompt (reception/networking → reception with cocktail clusters; classroom/training → classroom rows).",
    "For banquet/reception layouts, set audienceStyle: grid (Aligned rows), loose (Staggered banquet/social flow), scattered (Clusters for reception/networking/lounge zones), or arc (soft fan toward stage). Use explicit prompt topology over defaults.",
    "The server resolves attendeeTarget from attendee/headcount language and preserves explicit primary object counts like '25 banquet rounds' — focus on correct layout intent, front production, and secondary items.",
    "Set accessibilityChangeRequested true ONLY when the user explicitly requests accessibility, ADA, or wheelchair seating.",
    "Use only catalog componentId values from the schema.",
  ].join(" ");

  const userPayload = {
    mode: "generate" as const,
    prompt: args.prompt,
    roomWidthLu: args.roomWidthLu,
    roomDepthLu: args.roomDepthLu,
    priorAttendeeCount: args.priorAttendeeCount,
    sidebarAccessibility: args.sidebarAccessibility,
    sidebarDensityPreference: args.sidebarDensityPreference,
    sidebarLayoutStyle: args.sidebarLayoutStyle,
  };

  const { model, source: modelSource } = resolveRoomSetOpenAiModel();
  const { temperature } = resolveRoomSetOpenAiRequestOptions(model);

  const chatCompletionBody = buildRoomSetOpenAiChatCompletionBody({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "room_set_generate_layout_spec",
        schema: generateSchema,
        strict: true,
      },
    },
  });

  try {
    console.info("[room-set/plan-layout] generate AI request start", {
      model,
      modelSource,
      temperature,
      roomWidthLu: args.roomWidthLu,
      roomDepthLu: args.roomDepthLu,
    });
    const aiStartedMs = performance.now();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(chatCompletionBody),
    });
    console.info("[room-set/plan-layout] generate AI request end", {
      ms: elapsedMs(aiStartedMs),
      ok: response.ok,
      status: response.status,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn("[room-set/plan-layout] generate AI request failed", {
        status: response.status,
        body: errorText.slice(0, 500),
      });
      return layoutComposeErrorResponse({
        code: "ai_request_failed",
        stage: "ai_request",
        message: "Layout planning failed: AI request was rejected.",
        issues: [],
        timingMs: elapsedMs(args.requestStartedMs),
      });
    }

    const data = (await response.json()) as unknown;
    const choices = isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
    const firstChoice = choices[0];
    const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = message && typeof message.content === "string" ? message.content : "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonObject(content) ?? content) as unknown;
    } catch {
      return layoutComposeErrorResponse({
        code: "ai_response_malformed",
        stage: "ai_parse",
        message: "Layout plan was malformed: AI response was not valid JSON.",
        issues: [],
        timingMs: elapsedMs(args.requestStartedMs),
      });
    }

    if (!isRecord(parsed) || !isRecord(parsed.layoutSpec)) {
      return layoutComposeErrorResponse({
        code: "spec_malformed",
        stage: "spec_parse",
        message: "Layout plan was malformed: expected layoutSpec object.",
        issues: [],
        timingMs: elapsedMs(args.requestStartedMs),
      });
    }

    const layoutSpecRaw = normalizeLayoutSpecFromUnknown(parsed.layoutSpec, allowedComponentIds);
    if (!layoutSpecRaw) {
      return layoutComposeErrorResponse({
        code: "spec_malformed",
        stage: "spec_normalize",
        message: "Layout spec was malformed.",
        issues: [],
        timingMs: elapsedMs(args.requestStartedMs),
      });
    }

    const accessibilityChangeRequested = parsed.accessibilityChangeRequested === true;
    const accessibilityPriority = accessibilityChangeRequested
      || inferAccessibilityPriorityFromPrompt(args.prompt)
      || args.sidebarAccessibility;

    let layoutSpec = userExplicitlyRequestedSyntheticPolicyComponents(args.prompt)
      ? layoutSpecRaw
      : stripSyntheticPolicyFromLayoutSpec(layoutSpecRaw);

    const finalized = finalizeGenerateLayoutSpec({
      spec: layoutSpec,
      prompt: args.prompt,
      sidebarCount: args.priorAttendeeCount,
      sidebarDensityPreference: args.sidebarDensityPreference,
      sidebarLayoutStyle: args.sidebarLayoutStyle,
      roomWidthLu: args.roomWidthLu,
      roomDepthLu: args.roomDepthLu,
    });
    layoutSpec = finalized.spec;
    const attendeeCount = layoutSpec.attendeeTarget;
    const capacityChangeRequested = finalized.capacityChangeRequested;

    console.info("[room-set/plan-layout] generate resolved", {
      promptCount: finalized.promptCount,
      sidebarCount: finalized.sidebarCount,
      attendeeSource: finalized.attendeeSource,
      attendeeTarget: layoutSpec.attendeeTarget,
      layoutType: layoutSpec.layoutType,
      eventIntent: layoutSpec.eventIntent,
      primaryComponentId: layoutSpec.audience.primaryComponentId,
      primaryComponentCapacity: layoutSpec.audience.primaryComponentCapacity,
      requiredPrimaryComponents: layoutSpec.audience.requiredPrimaryComponents,
      densityPreference: layoutSpec.densityPreference,
      aiAudienceStyle: layoutSpecRaw.audienceStyle,
      promptAudienceStyle: inferAudienceStyleFromPrompt(args.prompt, layoutSpec.layoutType),
      audienceStyle: layoutSpec.audienceStyle,
      promptPrimaryObjectCount: finalized.promptPrimaryObjectCount,
    });

    const composeStartedMs = performance.now();
    const gracefulCompose = composeLayoutSpecWithGracefulFallback({
      spec: layoutSpec,
      roomWidthLu: args.roomWidthLu,
      roomDepthLu: args.roomDepthLu,
      compose: (candidateSpec) => ({
        layoutSpec: candidateSpec,
        result: composeLayoutSpec({
          spec: candidateSpec,
          roomWidthLu: args.roomWidthLu,
          roomDepthLu: args.roomDepthLu,
        }),
      }),
    });
    const composed = gracefulCompose.composed;
    console.info("[room-set/plan-layout] composeLayoutSpec end", {
      ms: elapsedMs(composeStartedMs),
      resultStatus: gracefulCompose.resultStatus,
      ok: composed?.ok ?? false,
      placementCount: composed?.placements.length ?? 0,
      issueCount: composed?.issues.length ?? 0,
      adjustments: gracefulCompose.adjustments,
    });

    if (gracefulCompose.resultStatus === "failed" || !composed || !gracefulCompose.layoutSpec) {
      console.warn("[room-set/plan-layout] generate graceful compose failed", {
        debugReason: gracefulCompose.debugReason,
        totalMs: elapsedMs(args.requestStartedMs),
      });
      return failedResultResponse({
        mode: "generate",
        debugReason: gracefulCompose.debugReason ?? "compose_failed",
        timingMs: elapsedMs(args.requestStartedMs),
      });
    }

    const originalAttendeeCount = attendeeCount;
    layoutSpec = gracefulCompose.layoutSpec;

    const validationStartedMs = performance.now();
    const validated = validatePlannerLayoutPlacements(
      composed.placements,
      args.roomWidthLu,
      args.roomDepthLu,
    );
    console.info("[room-set/plan-layout] generate validation end", {
      ms: elapsedMs(validationStartedMs),
      ok: validated.ok,
      placementCount: composed.placements.length,
      issueCount: validated.issues.length,
    });

    if (!validated.ok) {
      const validationDetail = formatPlannerLayoutValidationErrors(validated.issues);
      return failedResultResponse({
        mode: "generate",
        debugReason: `validation_failed: ${validationDetail}`,
        failureDetails: plannerValidationIssuesToFailureDetails(validated.issues, {
          code: "validation_failed",
          reason: validationDetail,
        }),
        timingMs: elapsedMs(args.requestStartedMs),
      });
    }

    let interpretation = interpretationFromLayoutSpec(layoutSpec, {
      accessibilityPriority,
      attendeeCount: layoutSpec.attendeeTarget,
    });
    interpretation = alignOperationalBriefToPlacements(
      interpretation,
      validated.placements,
      layoutSpec.attendeeTarget,
    );
    interpretation = appendComposeWarnings(interpretation, composed.warnings);

    console.info("[room-set/plan-layout] generate request complete", {
      totalMs: elapsedMs(args.requestStartedMs),
      placementCount: validated.placements.length,
      appliedSeatCapacity: sumPlatedSeatCapacity(validated.placements),
      resultStatus: gracefulCompose.resultStatus,
      adjustments: gracefulCompose.adjustments,
    });

    const promptObjectCountAdjustments = finalized.promptPrimaryObjectCount
      ? [
          `${finalized.promptPrimaryObjectCount.count} ${finalized.promptPrimaryObjectCount.label} requested.`,
          `Nominal seats: ${layoutSpec.audience.requiredPrimaryComponents * layoutSpec.audience.primaryComponentCapacity}.`,
          `Attendee count: ${layoutSpec.attendeeTarget}.`,
        ]
      : [];

    return NextResponse.json({
      mode: "generate",
      resultStatus: gracefulCompose.resultStatus,
      userMessageTitle: gracefulCompose.userMessageTitle,
      userMessageBody: gracefulCompose.userMessageBody,
      adjustments: [...promptObjectCountAdjustments, ...gracefulCompose.adjustments],
      suggestions: gracefulCompose.suggestions,
      debugReason: gracefulCompose.debugReason,
      interpretation,
      layoutSpec,
      scene: composed.scene,
      placements: validated.placements,
      capacityChangeRequested: capacityChangeRequested || layoutSpec.attendeeTarget !== originalAttendeeCount,
      appliedSeatCapacity: sumPlatedSeatCapacity(validated.placements),
      applyPath: "spec",
    });
  } catch (error) {
    observeHandledRouteError(error);
    console.warn("[room-set/plan-layout] generate unexpected failure", {
      message: error instanceof Error ? error.message : "unknown error",
      totalMs: elapsedMs(args.requestStartedMs),
    });
    return failedResultResponse({
      mode: "generate",
      debugReason: error instanceof Error ? error.message : "unexpected_failure",
      timingMs: elapsedMs(args.requestStartedMs),
    });
  }
}

function buildLayoutPatchSchema(allowedComponentIds: readonly string[]) {
  const itemSchema = buildLayoutSpecItemSchema(allowedComponentIds);
  const optionalItemSchema = buildOptionalLayoutSpecItemSchema(allowedComponentIds);
  const audienceTopologySchema = {
    type: "object",
    additionalProperties: false,
    properties: {
      preferredRows: { type: ["integer", "null"], minimum: 1, maximum: 12 },
      widthBias: { type: ["string", "null"], enum: ["narrower", "wider", null] },
      depthBias: { type: ["string", "null"], enum: ["shallower", "deeper", null] },
      arcStrength: { type: ["string", "null"], enum: ["softer", "normal", "stronger", null] },
    },
    required: ["preferredRows", "widthBias", "depthBias", "arcStrength"],
  } as const;
  const opSchema = {
    anyOf: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "addItems" },
          items: { type: "array", items: itemSchema, minItems: 1, maxItems: 24 },
        },
        required: ["op", "items"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "removeItems" },
          componentId: { type: "string", enum: allowedComponentIds },
          count: { type: ["integer", "null"], minimum: 1, maximum: 400 },
        },
        required: ["op", "componentId", "count"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "setAttendeeTarget" },
          value: { type: "integer", minimum: 1, maximum: 1200 },
        },
        required: ["op", "value"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "setLayoutType" },
          layoutType: { type: "string", enum: ROOM_TYPE_STARTERS },
        },
        required: ["op", "layoutType"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "setAudienceStyle" },
          audienceStyle: { type: "string", enum: AUDIENCE_STYLES },
        },
        required: ["op", "audienceStyle"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "setAudienceTopology" },
          topology: audienceTopologySchema,
        },
        required: ["op", "topology"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "setFrontScreen" },
          item: optionalItemSchema,
        },
        required: ["op", "item"],
      },
      {
        type: "object",
        additionalProperties: false,
        properties: {
          op: { type: "string", const: "setFrontStage" },
          item: optionalItemSchema,
        },
        required: ["op", "item"],
      },
    ],
  } as const;

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      layoutPatch: {
        type: "object",
        additionalProperties: false,
        properties: {
          version: { type: "integer", const: 1 },
          ops: { type: "array", items: opSchema, minItems: 1, maxItems: 24 },
        },
        required: ["version", "ops"],
      },
    },
    required: ["layoutPatch"],
  } as const;
}

function shouldUseLegacyApplyPlacement(body: unknown, hasLayoutSpec: boolean): boolean {
  if (process.env.ROOM_SET_APPLY_LEGACY_PLACEMENT === "true") return true;
  if (isRecord(body) && body.applyLegacyPlacement === true) return true;
  return !hasLayoutSpec;
}

async function handleApplyLayoutPatchRequest(args: Readonly<{
  requestStartedMs: number;
  apiKey: string;
  prompt: string;
  roomWidthLu: number;
  roomDepthLu: number;
  currentLayout: ReturnType<typeof normalizeCanvasSnapshotFromUnknown>;
  sidebarAccessibility: boolean;
  sidebarDensityPreference: RoomSetDensityControl;
  sidebarLayoutStyle: RoomSetLayoutStylePreference;
  sidebarAttendeeCount: number;
  baseLayoutSpec: LayoutSpec;
}>): Promise<NextResponse> {
  console.info("[ROOM_SET_APPLY_PATCH_ENTERED]", {
    prompt: args.prompt,
    baseAttendeeTarget: args.baseLayoutSpec.attendeeTarget,
    baseLayoutType: args.baseLayoutSpec.layoutType,
    baseSecondaryCount: args.baseLayoutSpec.secondary.length,
    baseSecondaryComponentIds: args.baseLayoutSpec.secondary.map((item) => item.componentId),
  });

  const allowedComponentIds = PLACEABLE_COMPONENT_IDS;
  const patchSchema = buildLayoutPatchSchema(allowedComponentIds);

  const layoutSummary = buildApplyLayoutSummary(
    args.baseLayoutSpec,
    args.roomWidthLu,
    args.roomDepthLu,
  );

  const systemPrompt = [
    "You are the Room Set semantic layout editor for Apply mode.",
    "Return layoutPatch only. Do not return coordinates, placements, geometry, or topology instructions.",
    "Map the user prompt to supported semantic patch operations only.",
    "Supported edits: addItems (cocktail tables, buffet, registration, bar, decor, lounge), removeItems, setAttendeeTarget, setLayoutType, setAudienceStyle, setAudienceTopology, setFrontScreen, setFrontStage.",
    "Use setAudienceTopology for banquet row/shape intent only — never coordinates. Fields: preferredRows, widthBias (narrower|wider), depthBias (shallower|deeper), arcStrength (softer|normal|stronger).",
    "Examples: '4 rows instead of 3' → setAudienceTopology preferredRows 4; 'spread wider' → widthBias wider; 'deeper pack' → depthBias deeper; 'more dramatic crescent' → setAudienceStyle arc plus setAudienceTopology arcStrength stronger.",
    "Use addItems with catalog componentId and count. Examples: bars → fnb-portable-bar; registration/check-in → registration-desk; buffet → fnb-buffet-line; cocktail tables → table-cocktail-cluster.",
    "Use addItems only to add support items — do not emit removeItems for components that are not already in baseLayoutSpec.",
    "Use removeItems with componentId; count null removes all matching items that already exist in the layout.",
    "Use setFrontScreen item null to remove the screen; setFrontStage item null to remove the stage.",
    "Ignore requests to move, shift, preserve exact positions, or nudge objects — translate to add/remove/count or audience topology intent only.",
    "Do not add synthetic policy aisle objects.",
  ].join(" ");

  const userPayload = {
    mode: "apply" as const,
    prompt: args.prompt,
    roomWidthLu: args.roomWidthLu,
    roomDepthLu: args.roomDepthLu,
    baseLayoutSpec: args.baseLayoutSpec,
    layoutSummary,
  };

  const { model, source: modelSource } = resolveRoomSetOpenAiModel();
  const { temperature } = resolveRoomSetOpenAiRequestOptions(model);

  const chatCompletionBody = buildRoomSetOpenAiChatCompletionBody({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "room_set_layout_patch",
        schema: patchSchema,
        strict: true,
      },
    },
  });

  try {
    console.info("[room-set/plan-layout] apply patch AI request start", {
      model,
      modelSource,
      temperature,
      baseAttendeeTarget: args.baseLayoutSpec.attendeeTarget,
      baseLayoutType: args.baseLayoutSpec.layoutType,
    });
    const aiStartedMs = performance.now();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(chatCompletionBody),
    });
    console.info("[room-set/plan-layout] apply patch AI request end", {
      ms: elapsedMs(aiStartedMs),
      ok: response.ok,
      status: response.status,
    });

    let layoutPatch: LayoutPatch | null = null;

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn("[room-set/plan-layout] apply patch AI request failed", {
        status: response.status,
        body: errorText.slice(0, 800),
      });
      layoutPatch = buildDeterministicApplyLayoutPatch({
        prompt: args.prompt,
        currentTopologyRows: layoutSummary.topologyRows,
        baseLayoutType: args.baseLayoutSpec.layoutType,
      });
      if (layoutPatch) {
        console.info("[room-set/plan-layout] apply patch deterministic fallback", {
          reason: "ai_request_failed",
          ops: summarizeLayoutPatchOps(layoutPatch),
        });
      }
    } else {
      const data = (await response.json()) as unknown;
      const choices = isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
      const firstChoice = choices[0];
      const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
      const content = message && typeof message.content === "string" ? message.content : "";

      let parsed: unknown;
      try {
        parsed = JSON.parse(extractJsonObject(content) ?? content) as unknown;
      } catch {
        console.warn("[room-set/plan-layout] apply patch AI response parse failed");
        layoutPatch = buildDeterministicApplyLayoutPatch({
          prompt: args.prompt,
          currentTopologyRows: layoutSummary.topologyRows,
          baseLayoutType: args.baseLayoutSpec.layoutType,
        });
        parsed = undefined;
      }

      if (layoutPatch === null && parsed !== undefined) {
        if (!isRecord(parsed) || !isRecord(parsed.layoutPatch)) {
          console.warn("[room-set/plan-layout] apply patch AI response missing layoutPatch");
          layoutPatch = buildDeterministicApplyLayoutPatch({
            prompt: args.prompt,
            currentTopologyRows: layoutSummary.topologyRows,
            baseLayoutType: args.baseLayoutSpec.layoutType,
          });
        } else {
          console.info("[room-set/plan-layout] apply patch raw AI layoutPatch", {
            layoutPatch: parsed.layoutPatch,
          });
          const normalizeFailures = summarizeLayoutPatchNormalizeFailures(
            parsed.layoutPatch,
            allowedComponentIds,
          );
          if (normalizeFailures.length > 0) {
            console.warn("[room-set/plan-layout] apply patch rejected ops", {
              rejectedOps: normalizeFailures,
            });
          }
          layoutPatch = normalizeLayoutPatchFromUnknown(parsed.layoutPatch, allowedComponentIds);
          if (!layoutPatch) {
            console.warn("[room-set/plan-layout] apply patch normalize failed", {
              rejectedOps: normalizeFailures,
            });
            layoutPatch = buildDeterministicApplyLayoutPatch({
              prompt: args.prompt,
              currentTopologyRows: layoutSummary.topologyRows,
              baseLayoutType: args.baseLayoutSpec.layoutType,
            });
            if (layoutPatch) {
              console.info("[room-set/plan-layout] apply patch deterministic fallback", {
                reason: "patch_normalize_failed",
                ops: summarizeLayoutPatchOps(layoutPatch),
              });
            }
          }
        }
      }
    }

    if (!layoutPatch) {
      return failedResultResponse({
        mode: "apply",
        debugReason: "ai_request_failed",
        currentLayout: args.currentLayout,
        timingMs: elapsedMs(args.requestStartedMs),
      });
    }

    console.info("[room-set/plan-layout] apply patch normalized ops (pre-supplement)", {
      opCount: layoutPatch.ops.length,
      ops: summarizeLayoutPatchOps(layoutPatch),
      baseSecondaryCount: args.baseLayoutSpec.secondary.length,
    });

    layoutPatch = supplementLayoutPatchFromPrompt(
      layoutPatch,
      args.prompt,
      args.baseLayoutSpec.attendeeTarget,
      { baseLayoutSpec: args.baseLayoutSpec },
    );

    layoutPatch = supplementLayoutPatchSeatingStyleFromPrompt(layoutPatch, {
      prompt: args.prompt,
      baseLayoutType: args.baseLayoutSpec.layoutType,
    });

    layoutPatch = supplementLayoutPatchTopologyFromPrompt(
      layoutPatch,
      args.prompt,
      layoutSummary.topologyRows,
    );

    console.info("[room-set/plan-layout] apply patch normalized ops", {
      opCount: layoutPatch.ops.length,
      ops: summarizeLayoutPatchOps(layoutPatch),
      baseSecondaryCount: args.baseLayoutSpec.secondary.length,
    });

    const baseSecondarySummary = summarizeLayoutSpecSecondary(args.baseLayoutSpec);
    const patchedSpec = applyLayoutPatch(args.baseLayoutSpec, layoutPatch);
    const mergedSecondarySummary = summarizeLayoutSpecSecondary(patchedSpec);
    const spatialDirectives = inferSpatialApplyDirectives(args.prompt);

    console.info("[room-set/plan-layout] apply patch mergedSpec.secondary before compose", {
      secondary: patchedSpec.secondary.map((item) => ({
        componentId: item.componentId,
        count: item.count,
        zoneRole: item.zoneRole ?? null,
        placementPreference: item.placementPreference ?? null,
      })),
    });

    console.info("[room-set/plan-layout] apply patch merged", {
      opCount: layoutPatch.ops.length,
      addedSecondaryCount:
        mergedSecondarySummary.secondaryTotalUnits - baseSecondarySummary.secondaryTotalUnits,
      secondaryComponentIds: mergedSecondarySummary.secondaryComponentIds,
      secondaryCount: mergedSecondarySummary.secondaryCount,
      secondaryTotalUnits: mergedSecondarySummary.secondaryTotalUnits,
      attendeeTarget: patchedSpec.attendeeTarget,
      layoutType: patchedSpec.layoutType,
      requiredPrimaryComponents: patchedSpec.audience.requiredPrimaryComponents,
      hasScreen: patchedSpec.front.screen != null,
      hasStage: patchedSpec.front.stage != null,
    });

    const layoutPatchHasStructuralOps = layoutPatch.ops.some((op) =>
      op.op === "addItems" ||
      op.op === "removeItems" ||
      op.op === "setAttendeeTarget" ||
      op.op === "setLayoutType" ||
      op.op === "setFrontScreen" ||
      op.op === "setFrontStage",
    );

    if (args.currentLayout && spatialDirectives.length > 0 && !layoutPatchHasStructuralOps) {
      const spatialApplied = applySpatialDirectivesToLayout({
        placements: args.currentLayout.placements,
        roomWidthLu: args.roomWidthLu,
        roomDepthLu: args.roomDepthLu,
        primaryAudienceComponentId: args.baseLayoutSpec.audience.primaryComponentId,
        directives: spatialDirectives,
      });

      const spatialValidated = validatePlannerLayoutPlacements(
        spatialApplied.placements,
        args.roomWidthLu,
        args.roomDepthLu,
      );

      if (spatialValidated.ok) {
        const accessibilityPriority =
          inferAccessibilityPriorityFromPrompt(args.prompt) || args.sidebarAccessibility;
        const attendeeCount = patchedSpec.attendeeTarget;
        let interpretation = interpretationFromLayoutSpec(patchedSpec, {
          accessibilityPriority,
          attendeeCount,
        });
        interpretation = alignOperationalBriefToPlacements(
          interpretation,
          spatialValidated.placements,
          attendeeCount,
        );
        interpretation = appendComposeWarnings(interpretation, spatialApplied.warnings);

        return NextResponse.json({
          mode: "apply",
          ...successResultMessage(),
          interpretation,
          layoutSpec: patchedSpec,
          scene: plannerSceneFromLayoutPlacements(spatialValidated.placements, {
            widthLu: args.roomWidthLu,
            depthLu: args.roomDepthLu,
          }),
          placements: spatialValidated.placements,
          capacityChangeRequested: false,
          appliedSeatCapacity: sumPlatedSeatCapacity(spatialValidated.placements),
          applyPath: "spatial",
        });
      }

      console.warn("[room-set/plan-layout] spatial apply validation failed; falling back to compose", {
        directives: spatialDirectives,
        issues: spatialValidated.issues,
      });
    }

    const applyComposed = composeLayoutSpecForApply({
      spec: patchedSpec,
      roomWidthLu: args.roomWidthLu,
      roomDepthLu: args.roomDepthLu,
      applyContext: {
        baseSpec: args.baseLayoutSpec,
        prompt: args.prompt,
        sidebarAttendeeCount: args.sidebarAttendeeCount,
        sidebarDensityPreference: args.sidebarDensityPreference,
        sidebarLayoutStyle: args.sidebarLayoutStyle,
      },
    });
    const layoutSpec = applyComposed.layoutSpec;
    const composed = applyComposed.result;

    if (!composed.ok) {
      const composeDetail = formatPlannerLayoutValidationErrors(composed.issues);
      return failedResultResponse({
        mode: "apply",
        debugReason: `${composed.issues[0]?.code ?? "compose_failed"}: ${composeDetail}`,
        failureDetails: plannerValidationIssuesToFailureDetails(composed.issues, {
          code: composed.issues[0]?.code ?? "compose_failed",
          reason: composeDetail,
        }),
        currentLayout: args.currentLayout,
        timingMs: elapsedMs(args.requestStartedMs),
      });
    }

    const validated = validatePlannerLayoutPlacements(
      composed.placements,
      args.roomWidthLu,
      args.roomDepthLu,
    );

    if (!validated.ok) {
      const validationDetail = formatPlannerLayoutValidationErrors(validated.issues);
      return failedResultResponse({
        mode: "apply",
        debugReason: `validation_failed: ${validationDetail}`,
        failureDetails: plannerValidationIssuesToFailureDetails(validated.issues, {
          code: "validation_failed",
          reason: validationDetail,
        }),
        currentLayout: args.currentLayout,
        timingMs: elapsedMs(args.requestStartedMs),
      });
    }

    const accessibilityPriority =
      inferAccessibilityPriorityFromPrompt(args.prompt) || args.sidebarAccessibility;
    const attendeeCount = layoutSpec.attendeeTarget;
    const capacityChangeRequested = attendeeCount !== args.baseLayoutSpec.attendeeTarget;

    let interpretation = interpretationFromLayoutSpec(layoutSpec, {
      accessibilityPriority,
      attendeeCount,
    });
    interpretation = alignOperationalBriefToPlacements(
      interpretation,
      validated.placements,
      attendeeCount,
    );
    interpretation = appendComposeWarnings(interpretation, composed.warnings);

    return NextResponse.json({
      mode: "apply",
      ...successResultMessage(),
      interpretation,
      layoutSpec,
      scene: composed.scene,
      placements: validated.placements,
      capacityChangeRequested,
      appliedSeatCapacity: sumPlatedSeatCapacity(validated.placements),
      applyPath: "patch",
    });
  } catch (error) {
    observeHandledRouteError(error);
    return failedResultResponse({
      mode: "apply",
      debugReason: error instanceof Error ? error.message : "unexpected_failure",
      currentLayout: args.currentLayout,
      timingMs: elapsedMs(args.requestStartedMs),
    });
  }
}

function buildPlanLayoutSchema(placementComponentIds: readonly string[]) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      interpretation: {
        type: "object",
        additionalProperties: false,
        properties: interpretationSchemaProperties,
        required: Object.keys(interpretationSchemaProperties),
      },
      placements: {
        type: "array",
        maxItems: 400,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            componentId: { type: "string", enum: placementComponentIds },
            xLu: { type: "number" },
            yLu: { type: "number" },
            rotationDeg: { type: "number" },
            label: { type: ["string", "null"] },
          },
          required: ["componentId", "xLu", "yLu", "rotationDeg", "label"],
        },
      },
      capacityChangeRequested: { type: "boolean" },
      accessibilityChangeRequested: { type: "boolean" },
    },
    required: [
      "interpretation",
      "placements",
      "capacityChangeRequested",
      "accessibilityChangeRequested",
    ],
  } as const;
}

function elapsedMs(sinceMs: number): number {
  return Math.round(performance.now() - sinceMs);
}

function layoutComposeErrorResponse(args: Readonly<{
  code: string;
  message: string;
  issues: readonly { code: string; message: string }[];
  stage: string;
  timingMs: number;
}>): NextResponse {
  return NextResponse.json(
    {
      error: args.message,
      ...failedGenerationMessage(`${args.stage}:${args.code}`),
      code: args.code,
      stage: args.stage,
      issues: args.issues,
      timingMs: args.timingMs,
    },
    { status: 502 },
  );
}

async function postHandler(request: NextRequest) {
  const unavailableResponse = roomSetAndSeatingUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

  const requestStartedMs = performance.now();
  const currentUserResult = await resolveRequestUser(request);
  if ("error" in currentUserResult) {
    return NextResponse.json(
      { error: `Unauthorized: ${currentUserResult.error.reason}` },
      { status: currentUserResult.error.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = isRecord(body) && typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

  const mode: RoomSetAiLayoutPlanMode =
    isRecord(body) && body.mode === "apply" ? "apply" : "generate";

  const sidebar = isRecord(body) && isRecord(body.sidebar) ? body.sidebar : {};
  const priorAttendeeCount = clampAttendees(
    Number(sidebar.attendeeCount) || 100,
  );
  const sidebarAccessibility = sidebar.accessibilityPriority === true;
  const sidebarDensityPreference = normalizeRoomSetDensityControl(
    typeof sidebar.densityPreference === "string" ? sidebar.densityPreference : "auto",
  );
  const sidebarLayoutStyle = normalizeRoomSetLayoutStylePreference(
    typeof sidebar.layoutStyle === "string" ? sidebar.layoutStyle : "auto",
  );

  const currentLayout = normalizeCanvasSnapshotFromUnknown(
    isRecord(body) ? body.currentLayout : null,
  );
  const roomWidthLu = currentLayout?.roomWidthLu ?? (Number(sidebar.roomWidthLu) || 120);
  const roomDepthLu = currentLayout?.roomDepthLu ?? (Number(sidebar.roomDepthLu) || 80);

  if (mode === "apply" && !currentLayout) {
    return NextResponse.json(
      { error: "currentLayout is required for apply mode" },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  if (mode === "generate") {
    return handleGenerateLayoutRequest({
      requestStartedMs,
      apiKey,
      prompt,
      roomWidthLu,
      roomDepthLu,
      priorAttendeeCount,
      sidebarAccessibility,
      sidebarDensityPreference,
      sidebarLayoutStyle,
    });
  }

  const baseLayoutSpecRaw = isRecord(body) ? body.currentLayoutSpec : null;
  const baseLayoutSpec = baseLayoutSpecRaw
    ? normalizeLayoutSpecFromUnknown(baseLayoutSpecRaw, PLACEABLE_COMPONENT_IDS)
    : null;

  const useLegacyApply = shouldUseLegacyApplyPlacement(body, baseLayoutSpec != null);
  console.info("[room-set/plan-layout] apply mode branch decision", {
    hasCurrentLayoutSpec: baseLayoutSpecRaw != null,
    baseLayoutSpecNormalized: baseLayoutSpec != null,
    useLegacyApply,
    applyLegacyPlacement: isRecord(body) ? body.applyLegacyPlacement === true : false,
  });

  if (!useLegacyApply && baseLayoutSpec) {
    return handleApplyLayoutPatchRequest({
      requestStartedMs,
      apiKey,
      prompt,
      roomWidthLu,
      roomDepthLu,
      currentLayout,
      sidebarAccessibility,
      sidebarDensityPreference,
      sidebarLayoutStyle,
      sidebarAttendeeCount: priorAttendeeCount,
      baseLayoutSpec,
    });
  }

  const placementComponentIds = PLACEABLE_COMPONENT_IDS;
  const planLayoutSchema = buildPlanLayoutSchema(placementComponentIds);

  const systemPrompt = [
    "You are the authoritative Room Set spatial planner.",
    "Return a complete layout as placements plus an operational brief.",
    "Coordinates use layout units (LU) from the top-left interior origin (0,0) to (roomWidthLu, roomDepthLu).",
    "Each placement must use a catalog componentId, position xLu/yLu, and rotationDeg (coordinates are recomposed deterministically server-side).",
    "You must output the full revised layout every time — not deltas, patches, or edit operations.",
    "Apply mode: read currentLayout placements and the user prompt, then return the entire new layout that satisfies the latest prompt. Do not preserve stale topology the prompt contradicts.",
    "Place realistic event production: stage/AV at the front, seating or tables in the audience zone, F&B/registration/lounge where the prompt requires.",
    "Set capacityChangeRequested true ONLY when the user clearly changes attendee/seat/guest count in the prompt.",
    "Set accessibilityChangeRequested true ONLY when the user explicitly requests accessibility, ADA, or wheelchair seating in the prompt.",
    "If capacityChangeRequested is false, keep requestedAttendees aligned with the prior attendee count provided in the user payload.",
    "Do not enable accessibility unless accessibilityChangeRequested is true.",
    "componentRequests must be an empty array — all furniture and seating must appear in placements.",
    "Every placement must fit entirely inside the room rectangle (0,0) to (roomWidthLu, roomDepthLu) using each component catalog widthLu and depthLu.",
    "Use only catalog componentId values from the schema.",
  ].join(" ");

  const userPayload = {
    mode,
    prompt,
    roomWidthLu,
    roomDepthLu,
    priorAttendeeCount,
    sidebarAccessibility,
    currentLayout,
  };

  const { model, source: modelSource } = resolveRoomSetOpenAiModel();
  const { temperature } = resolveRoomSetOpenAiRequestOptions(model);

  type LayoutChatMessage = Readonly<{ role: "system" | "user" | "assistant"; content: string }>;
  const messages: LayoutChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(userPayload) },
  ];

  const chatCompletionBody = buildRoomSetOpenAiChatCompletionBody({
    model,
    messages,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "room_set_ai_layout_plan",
        schema: planLayoutSchema,
        strict: true,
      },
    },
  });

  try {
    console.info("[room-set/plan-layout] AI request start", {
      mode,
      model,
      modelSource,
      temperature,
      roomWidthLu,
      roomDepthLu,
      regenerationAttempts: 0,
    });
    const aiStartedMs = performance.now();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(chatCompletionBody),
    });
    console.info("[room-set/plan-layout] AI request end", {
      ms: elapsedMs(aiStartedMs),
      ok: response.ok,
      status: response.status,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn("[room-set/plan-layout] AI request failed", {
        status: response.status,
        body: errorText.slice(0, 500),
        totalMs: elapsedMs(requestStartedMs),
      });
      return layoutComposeErrorResponse({
        code: "ai_request_failed",
        stage: "ai_request",
        message: "Layout planning failed: AI request was rejected.",
        issues: [],
        timingMs: elapsedMs(requestStartedMs),
      });
    }

    const data = (await response.json()) as unknown;
    const choices = isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
    const firstChoice = choices[0];
    const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = message && typeof message.content === "string" ? message.content : "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJsonObject(content) ?? content) as unknown;
    } catch {
      console.warn("[room-set/plan-layout] AI response parse failure", {
        totalMs: elapsedMs(requestStartedMs),
      });
      return layoutComposeErrorResponse({
        code: "ai_response_malformed",
        stage: "ai_parse",
        message: "Layout plan was malformed: AI response was not valid JSON.",
        issues: [],
        timingMs: elapsedMs(requestStartedMs),
      });
    }

    if (!isRecord(parsed)) {
      return layoutComposeErrorResponse({
        code: "ai_response_malformed",
        stage: "ai_parse",
        message: "Layout plan was malformed: expected a JSON object.",
        issues: [],
        timingMs: elapsedMs(requestStartedMs),
      });
    }

    const interpretationRaw = parsed.interpretation;
    const interpretationBase = normalizeRoomSetInterpretation(interpretationRaw);
    if (!interpretationBase) {
      return layoutComposeErrorResponse({
        code: "brief_malformed",
        stage: "brief_normalize",
        message: "Layout plan brief was malformed.",
        issues: [],
        timingMs: elapsedMs(requestStartedMs),
      });
    }

    const promptCapacityTarget = inferCapacityTargetFromPrompt(prompt);
    const capacityChangeRequested = promptCapacityTarget !== null;

    let interpretation = finalizeInterpretation({
      interpretation: interpretationBase,
      prompt,
      priorAttendeeCount,
      sidebarAccessibility,
      capacityChangeRequested,
      promptCapacityTarget,
    });

    const rawPlacements = normalizeLayoutPlacementsFromUnknown(parsed.placements);
    const validationStartedMs = performance.now();
    const validated = validatePlannerLayoutPlacements(
      rawPlacements,
      roomWidthLu,
      roomDepthLu,
    );
    console.info("[room-set/plan-layout] schema validation end", {
      ms: elapsedMs(validationStartedMs),
      ok: validated.ok,
      placementCount: rawPlacements.length,
      issueCount: validated.issues.length,
    });

    if (!validated.ok) {
      const validationDetail = formatPlannerLayoutValidationErrors(validated.issues);
      return failedResultResponse({
        mode,
        debugReason: `schema_validation_failed: ${validationDetail}`,
        failureDetails: plannerValidationIssuesToFailureDetails(validated.issues, {
          code: "schema_validation_failed",
          reason: validationDetail,
        }),
        currentLayout: mode === "apply" ? currentLayout : undefined,
        timingMs: elapsedMs(requestStartedMs),
      });
    }

    const composeStartedMs = performance.now();
    const composed = composePlannerLayoutPlacements(
      validated.placements,
      roomWidthLu,
      roomDepthLu,
      interpretation.densityPreference,
    );
    console.info("[room-set/plan-layout] composer end", {
      ms: elapsedMs(composeStartedMs),
      ok: composed.ok,
      placementCount: composed.placements.length,
      issueCount: composed.issues.length,
      inputPlacementCount: validated.placements.length,
    });

    if (!composed.ok) {
      const composeDetail = formatPlannerLayoutValidationErrors(composed.issues);
      return failedResultResponse({
        mode,
        debugReason: `${composed.issues[0]?.code ?? "compose_failed"}: ${composeDetail}`,
        failureDetails: plannerValidationIssuesToFailureDetails(composed.issues, {
          code: composed.issues[0]?.code ?? "compose_failed",
          reason: composeDetail,
        }),
        currentLayout: mode === "apply" ? currentLayout : undefined,
        timingMs: elapsedMs(requestStartedMs),
      });
    }

    interpretation = alignOperationalBriefToPlacements(
      interpretation,
      composed.placements,
      interpretation.attendeeCount,
    );
    interpretation = appendComposeWarnings(interpretation, composed.warnings);

    console.info("[room-set/plan-layout] request complete", {
      totalMs: elapsedMs(requestStartedMs),
      placementCount: composed.placements.length,
      appliedSeatCapacity: sumPlatedSeatCapacity(composed.placements),
    });

    return NextResponse.json({
      mode,
      ...successResultMessage(),
      interpretation,
      scene: composed.scene,
      placements: composed.placements,
      capacityChangeRequested,
      appliedSeatCapacity: sumPlatedSeatCapacity(composed.placements),
      applyPath: "legacy",
    });
  } catch (error) {
    observeHandledRouteError(error);
    console.warn("[room-set/plan-layout] unexpected failure", {
      message: error instanceof Error ? error.message : "unknown error",
      totalMs: elapsedMs(requestStartedMs),
    });
    return failedResultResponse({
      mode,
      debugReason: error instanceof Error ? error.message : "unexpected_failure",
      currentLayout: mode === "apply" ? currentLayout : undefined,
      timingMs: elapsedMs(requestStartedMs),
    });
  }
}

const postWithLogging = withApiRequestLogging("POST /api/room-set/plan-layout", postHandler);

export async function POST(request: NextRequest) {
  return postWithLogging(request, undefined);
}
