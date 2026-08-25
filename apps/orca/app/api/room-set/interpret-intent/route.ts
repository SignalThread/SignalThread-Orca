import { NextRequest, NextResponse } from "next/server";

import {
  buildPlannerComponentRequestsWithProvenance,
  normalizePlannerComponentRequestsFromUnknown,
  PROMPT_ADDABLE_CATALOG_COMPONENT_IDS,
} from "@/lib/room-set/planner-component-requests";
import {
  normalizeRoomSetDensityPreference,
  type RoomSetOperationalBrief,
} from "@/lib/room-set/planner-intent-shared";
import type { RoomSetComponentId } from "@/lib/room-set/component-library";
import {
  isPrimarySeatingComponentId,
  primarySeatingCapacity,
  starterIdFromPrimaryComponentId,
} from "@/lib/room-set/planner-seating-resolve";
import type { RoomTypeStarterId } from "@/lib/room-set/planner-intent-shared";
import { resolveRoomSetOpenAiModel, buildRoomSetOpenAiChatCompletionBody, resolveRoomSetOpenAiRequestOptions } from "@/lib/room-set/openai-model-config";

import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { resolveRequestUser } from "@/lib/request-user";
import { roomSetAndSeatingUnavailableResponse } from "@/lib/room-set/availability";

export const runtime = "nodejs";

const EVENT_INTENTS = [
  "banquet_remarks",
  "awards_dinner",
  "training_session",
  "workshop",
  "general_session",
  "networking_reception",
  "town_hall",
  "expo_lounge",
] as const;

const DENSITY_PREFERENCES = ["premium", "balanced", "compact", "comfortable", "high"] as const;
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

type EventIntent = (typeof EVENT_INTENTS)[number];
type OperationalScale = (typeof SCALES)[number];
type ServicePriority = (typeof SERVICE_PRIORITIES)[number];
type RoomTypeStarter = (typeof ROOM_TYPE_STARTERS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").slice(0, 6);
}

function enumArray<T extends readonly string[]>(value: unknown, allowed: T): T[number][] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is T[number] => typeof entry === "string" && allowed.includes(entry));
}

function starterForIntent(intent: EventIntent): RoomTypeStarter {
  switch (intent) {
    case "banquet_remarks":
    case "awards_dinner":
      return "banquet";
    case "training_session":
    case "workshop":
      return "classroom";
    case "general_session":
    case "town_hall":
      return "theater";
    case "networking_reception":
    case "expo_lounge":
      return "reception";
    default:
      ((x: never) => void x)(intent);
      return "theater";
  }
}

function primaryCapacityForStarter(starter: RoomTypeStarter): {
  id: RoomSetComponentId;
  capacity: number;
} {
  switch (starter) {
    case "classroom":
      return { id: "seating-classroom-row", capacity: 12 };
    case "theater":
      return { id: "seating-theater-row", capacity: 14 };
    case "banquet":
      return { id: "table-round-60", capacity: 8 };
    case "reception":
      return { id: "table-cocktail-cluster", capacity: 4 };
    default:
      ((x: never) => void x)(starter);
      return { id: "seating-theater-row", capacity: 14 };
  }
}

function normalizeInterpretation(value: unknown): RoomSetOperationalBrief | null {
  if (!isRecord(value)) return null;
  const eventIntent = enumValue(value.eventIntent, EVENT_INTENTS, "general_session");
  const requestedAttendees = clamp(Math.round(Number(value.requestedAttendees ?? value.attendeeCount) || 100), 1, 1200);
  const capacityRaw = isRecord(value.capacityStrategy) ? value.capacityStrategy : null;
  const seatingStyleFromModel = enumValue(
    capacityRaw?.seatingStyle,
    ROOM_TYPE_STARTERS,
    starterForIntent(eventIntent),
  );
  const aiPrimaryRaw =
    typeof capacityRaw?.primaryComponentId === "string" ? capacityRaw.primaryComponentId : null;
  const primaryComponentId: RoomSetComponentId =
    aiPrimaryRaw && isPrimarySeatingComponentId(aiPrimaryRaw)
      ? aiPrimaryRaw
      : primaryCapacityForStarter(seatingStyleFromModel).id;
  const seatingStyle: RoomTypeStarterId =
    starterIdFromPrimaryComponentId(primaryComponentId) ?? seatingStyleFromModel;
  const catalogCapacity = primarySeatingCapacity(primaryComponentId);
  const primaryComponentCapacity = clamp(
    Math.round(
      Number(capacityRaw?.primaryComponentCapacity) ||
        catalogCapacity ||
        primaryCapacityForStarter(seatingStyle).capacity,
    ),
    1,
    24,
  );
  const requiredPrimaryComponents = clamp(
    Math.round(
      Number(capacityRaw?.requiredPrimaryComponents) ||
        Math.ceil(requestedAttendees / primaryComponentCapacity),
    ),
    1,
    400,
  );
  const plannedPrimaryComponents = clamp(
    Math.round(
      Number(capacityRaw?.plannedPrimaryComponents) || requiredPrimaryComponents,
    ),
    1,
    400,
  );
  const servicePriorities = enumArray(value.servicePriorities, SERVICE_PRIORITIES);
  return {
    archetype: enumValue(value.archetype, EVENT_INTENTS, eventIntent),
    eventIntent,
    requestedAttendees,
    attendeeCount: requestedAttendees,
    productionScale: enumValue(value.productionScale, SCALES, "moderate"),
    densityPreference: normalizeRoomSetDensityPreference(
      enumValue(value.densityPreference, DENSITY_PREFERENCES, "balanced"),
    ),
    servicePriorities: servicePriorities.length ? servicePriorities : ["seating_capacity", "egress"],
    requiredZones: stringArray(value.requiredZones),
    optionalZones: stringArray(value.optionalZones),
    capacityStrategy: {
      requestedSeats: requestedAttendees,
      seatingStyle,
      capacityIsHardRequirement: capacityRaw
        ? capacityRaw.capacityIsHardRequirement !== false
        : true,
      primaryComponentId,
      primaryComponentCapacity,
      requiredPrimaryComponents,
      plannedPrimaryComponents,
      overflowPolicy: enumValue(
        isRecord(value.capacityStrategy) ? value.capacityStrategy.overflowPolicy : undefined,
        ["warn", "reduce_secondary_zones", "recommend_larger_room"] as const,
        "recommend_larger_room",
      ),
    },
    layoutTradeoffs: stringArray(value.layoutTradeoffs),
    operationalRisks: stringArray(value.operationalRisks),
    generationInstructions: stringArray(value.generationInstructions),
    presentationScale: enumValue(value.presentationScale, SCALES, "moderate"),
    seatingPriority: clamp(Number(value.seatingPriority) || 0.8, 0, 1),
    networkingPriority: clamp(Number(value.networkingPriority) || 0.2, 0, 1),
    fnbPriority: clamp(Number(value.fnbPriority) || 0.2, 0, 1),
    accessibilityPriority: value.accessibilityPriority === true,
    stageScale: enumValue(value.stageScale, SCALES, "moderate"),
    avScale: enumValue(value.avScale, SCALES, "moderate"),
    notes: stringArray(value.notes),
    assumptions: stringArray(value.assumptions),
    componentRequests: normalizePlannerComponentRequestsFromUnknown(value.componentRequests),
  };
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

async function postHandler(request: NextRequest) {
  const unavailableResponse = roomSetAndSeatingUnavailableResponse();
  if (unavailableResponse) return unavailableResponse;

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

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 503 });
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      archetype: { type: "string", enum: EVENT_INTENTS },
      eventIntent: { type: "string", enum: EVENT_INTENTS },
      requestedAttendees: { type: "integer", minimum: 1, maximum: 1200 },
      attendeeCount: { type: "integer", minimum: 1, maximum: 1200 },
      productionScale: { type: "string", enum: SCALES },
      densityPreference: { type: "string", enum: ["premium", "balanced", "compact"] },
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
          primaryComponentId: { type: "string" },
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
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            catalogComponentId: {
              type: ["string", "null"],
              enum: [...PROMPT_ADDABLE_CATALOG_COMPONENT_IDS, null],
            },
            componentType: {
              type: ["string", "null"],
              enum: ["cocktailCluster", "networkingPod", "sponsorLounge", null],
            },
            count: { type: "integer", minimum: 1, maximum: 48 },
            placementPreference: {
              type: ["string", "null"],
              enum: ["side", "rear", "perimeter", "mixed", null],
            },
          },
          required: ["catalogComponentId", "componentType", "count", "placementPreference"],
        },
      },
    },
    required: [
      "archetype",
      "eventIntent",
      "requestedAttendees",
      "attendeeCount",
      "productionScale",
      "densityPreference",
      "servicePriorities",
      "requiredZones",
      "optionalZones",
      "capacityStrategy",
      "layoutTradeoffs",
      "operationalRisks",
      "generationInstructions",
      "presentationScale",
      "seatingPriority",
      "networkingPriority",
      "fnbPriority",
      "accessibilityPriority",
      "stageScale",
      "avScale",
      "notes",
      "assumptions",
      "componentRequests",
    ],
  } as const;

  const systemPrompt = [
    "You are an event-planner operations analyst for Room Set generation.",
    "Return a structured operational brief only. Never return geometry, coordinates, dimensions, or object placements.",
    "The deterministic solver and layout engine will calculate capacity, fit, and geometry after your brief.",
    "Choose eventIntent from the enum. Map plain language like awards, training, workshop, town hall, reception, expo, and general session.",
    "Set requestedAttendees from the prompt. If a prompt says 300 attendees, 300 seats is a hard capacity requirement unless the solver later proves the room cannot fit it.",
    "Classroom/training prompts should prioritize classroom seating, sightlines, teaching AV, egress, and any stated power or breakout requirements.",
    "Distributed power is an operational priority, not a decoration. Breakout collaboration zones are secondary to stated attendee capacity unless explicitly primary.",
    "Use presentationScale, stageScale, and avScale carefully: light remarks or 'not a giant stage' means light stage and light/moderate AV, not production.",
    "Training and classroom sessions normally use teaching-scale AV, not awards/keynote production, unless broadcast/mainstage language appears.",
    "Full AV, keynote production, broadcast, recording, streaming, LED wall, or mainstage language can justify production scale.",
    "capacityStrategy must express component math, e.g. classroom row blocks at 12 seats each, theater row blocks at 14, banquet compound rounds modeled as eight-seat primitives unless prompts demand ten-seat units.",
    "Use layoutTradeoffs for anything deprioritized. Use operationalRisks for things that can break the plan, such as tight aisle depth, power distribution, sightline conflicts, or insufficient room capacity.",
    "Priorities are 0 to 1 and represent relative emphasis, not geometry.",
    "Keep notes, assumptions, and generationInstructions short, planner-readable, and non-technical.",
    "Populate componentRequests whenever the planner asks for secondary furniture or zones.",
    "Prefer catalogComponentId for supported add-ons: table-cocktail-cluster, decor-plant-cluster, fnb-portable-bar, fnb-buffet-line, fnb-coffee-station, registration-desk, registration-kiosk, lounge-chair, booth-10x10, av-speaker-stack, av-foh-control, av-confidence-monitor.",
    "Examples: cocktail tables or mingle clusters → table-cocktail-cluster; planters or scenic plants → decor-plant-cluster; bars → fnb-portable-bar.",
    "If they ask for cocktail clusters without a number, return a scaled count (roughly requestedAttendees/50, clamp between 4 and 12). Use [] only when no secondary components are requested.",
    "You must populate componentRequests whenever the prompt asks for secondary furniture or zones (cocktail tables, plants, bars, buffets, registration, lounge, sponsor areas). Do not rely on downstream keyword parsing for items you can interpret.",
    "Set componentType only for legacy aliases when useful; otherwise return componentType as null.",
    "A small local supplement may add catalog items only if you omit them entirely; your structured componentRequests are authoritative for count and placementPreference.",
    "Map placement cues to placementPreference on each componentRequest entry:",
    "perimeter — around/along/outside walls, room edge, spread around the perimeter, periphery;",
    "side — side wings, left/right sides, lateral wings;",
    "rear — back of room, far from stage;",
    "mixed — only when no placement cue is given.",
    "Example: 'spread cocktail tables around the outside walls' → placementPreference perimeter (not mixed).",
  ].join(" ");

  const { model, source: modelSource } = resolveRoomSetOpenAiModel();
  const { temperature } = resolveRoomSetOpenAiRequestOptions(model);

  const chatCompletionBody = buildRoomSetOpenAiChatCompletionBody({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ prompt }) },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "room_set_intent_interpretation",
        schema,
        strict: true,
      },
    },
  });

  try {
    console.info("[room-set/interpret-intent] AI request start", {
      model,
      modelSource,
      temperature,
    });
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(chatCompletionBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.warn("[room-set/interpret-intent] AI request failed", {
        status: response.status,
        body: errorText.slice(0, 500),
      });
      return NextResponse.json({ error: "Intent interpretation failed" }, { status: 502 });
    }

    const data = (await response.json()) as unknown;
    const choices = isRecord(data) && Array.isArray(data.choices) ? data.choices : [];
    const firstChoice = choices[0];
    const message = isRecord(firstChoice) && isRecord(firstChoice.message) ? firstChoice.message : null;
    const content = message && typeof message.content === "string" ? message.content : "";
    const parsed = JSON.parse(extractJsonObject(content) ?? content) as unknown;
    const interpretation = normalizeInterpretation(parsed);
    if (!interpretation) {
      return NextResponse.json({ error: "Intent interpretation was malformed" }, { status: 502 });
    }

    const componentResolution = buildPlannerComponentRequestsWithProvenance(
      interpretation.componentRequests,
      prompt,
      interpretation.requestedAttendees,
      true,
    );

    const interpretationWithComponents: RoomSetOperationalBrief = {
      ...interpretation,
      componentRequests: componentResolution.requests,
      componentRequestInterpretation: componentResolution.interpretation,
    };

    return NextResponse.json({ interpretation: interpretationWithComponents });
  } catch (error) {
    observeHandledRouteError(error);
    console.warn("[room-set/interpret-intent] parse failure", {
      message: error instanceof Error ? error.message : "unknown error",
    });
    return NextResponse.json({ error: "Intent interpretation failed" }, { status: 502 });
  }
}

const postWithLogging = withApiRequestLogging("POST /api/room-set/interpret-intent", postHandler);

export async function POST(request: NextRequest) {
  return postWithLogging(request, undefined);
}
