/**
 * Normalize AI operational brief JSON (server-safe).
 */

import { normalizePlannerComponentRequestsFromUnknown } from "@/lib/room-set/planner-component-requests";
import {
  normalizeRoomSetDensityPreference,
  type RoomSetOperationalBrief,
  type RoomTypeStarterId,
} from "@/lib/room-set/planner-intent-shared";
import type { RoomSetComponentId } from "@/lib/room-set/component-library";
import {
  isPrimarySeatingComponentId,
  primarySeatingCapacity,
  starterIdFromPrimaryComponentId,
} from "@/lib/room-set/planner-seating-resolve";

export const ROOM_SET_EVENT_INTENTS = [
  "banquet_remarks",
  "awards_dinner",
  "training_session",
  "workshop",
  "general_session",
  "networking_reception",
  "town_hall",
  "expo_lounge",
] as const;

export type RoomSetEventIntentNormalized = (typeof ROOM_SET_EVENT_INTENTS)[number];

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

type RoomTypeStarter = (typeof ROOM_TYPE_STARTERS)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").slice(0, 6);
}

function enumArray<T extends readonly string[]>(value: unknown, allowed: T): T[number][] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is T[number] => typeof entry === "string" && allowed.includes(entry),
  );
}

function starterForIntent(intent: RoomSetEventIntentNormalized): RoomTypeStarter {
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

export function normalizeRoomSetInterpretation(value: unknown): RoomSetOperationalBrief | null {
  if (!isRecord(value)) return null;
  const eventIntent = enumValue(value.eventIntent, ROOM_SET_EVENT_INTENTS, "general_session");
  const requestedAttendees = clamp(
    Math.round(Number(value.requestedAttendees ?? value.attendeeCount) || 100),
    1,
    1200,
  );
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
    archetype: enumValue(value.archetype, ROOM_SET_EVENT_INTENTS, eventIntent),
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

export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}
