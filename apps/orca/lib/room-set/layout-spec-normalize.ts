/**
 * Normalize AI LayoutSpec JSON and build the client operational brief.
 */

import { ROOM_SET_EVENT_INTENTS, normalizeRoomSetInterpretation } from "@/lib/room-set/planner-intent-normalize";
import type { RoomSetOperationalBrief } from "@/lib/room-set/planner-intent-shared";
import { normalizeRoomSetDensityPreference, normalizeRoomSetAudienceStyle } from "@/lib/room-set/planner-intent-shared";
import { isRoomSetSyntheticPolicyComponentId } from "@/lib/room-set/planner-synthetic-policy";
import type { RoomSetComponentId } from "@/lib/room-set/component-library";
import { isPrimarySeatingComponentId, primarySeatingCapacity } from "@/lib/room-set/planner-seating-resolve";

import { isPlaceablePlannerComponentId } from "./planner-layout-schema";

import type {
  LayoutSpec,
  LayoutSpecAudienceIntent,
  LayoutSpecAudienceTopologyIntent,
  LayoutSpecFrontIntent,
  LayoutSpecItem,
  LayoutSpecLayoutType,
} from "./layout-spec";
import { normalizeAudienceTopologyFromUnknown } from "./layout-spec-audience-topology-infer";

const LAYOUT_TYPES = ["banquet", "classroom", "theater", "reception"] as const;
const ZONE_ROLES = ["front", "audience", "perimeter", "rear", "mixed"] as const;
const PLACEMENT_PREFERENCES = ["side", "rear", "perimeter", "front", "mixed"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && allowed.includes(value) ? value : fallback;
}

function normalizeOptionalLabel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().slice(0, 80);
  return trimmed ? trimmed : undefined;
}

export function normalizeLayoutSpecItem(
  value: unknown,
  allowedComponentIds: ReadonlySet<string>,
): LayoutSpecItem | null {
  if (!isRecord(value)) return null;
  const componentIdRaw = typeof value.componentId === "string" ? value.componentId.trim() : "";
  if (!isPlaceablePlannerComponentId(componentIdRaw) || !allowedComponentIds.has(componentIdRaw)) {
    return null;
  }
  const count = clampInt(Number(value.count) || 1, 1, 400);
  const zoneRoleRaw = value.zoneRole;
  const zoneRole =
    typeof zoneRoleRaw === "string" && ZONE_ROLES.includes(zoneRoleRaw as (typeof ZONE_ROLES)[number])
      ? (zoneRoleRaw as LayoutSpecItem["zoneRole"])
      : undefined;
  const placementRaw = value.placementPreference;
  const placementPreference =
    typeof placementRaw === "string" &&
    PLACEMENT_PREFERENCES.includes(placementRaw as (typeof PLACEMENT_PREFERENCES)[number])
      ? (placementRaw as LayoutSpecItem["placementPreference"])
      : undefined;
  const label = normalizeOptionalLabel(value.label);
  return {
    componentId: componentIdRaw,
    count,
    ...(zoneRole ? { zoneRole } : {}),
    ...(placementPreference ? { placementPreference } : {}),
    ...(label ? { label } : {}),
  };
}

export function normalizeOptionalItem(
  value: unknown,
  allowedComponentIds: ReadonlySet<string>,
): LayoutSpecItem | undefined {
  if (value === null || value === undefined) return undefined;
  const item = normalizeLayoutSpecItem(value, allowedComponentIds);
  return item ?? undefined;
}

function normalizeItemArray(
  value: unknown,
  allowedComponentIds: ReadonlySet<string>,
  maxItems: number,
): LayoutSpecItem[] {
  if (!Array.isArray(value)) return [];
  const out: LayoutSpecItem[] = [];
  for (const entry of value) {
    const item = normalizeLayoutSpecItem(entry, allowedComponentIds);
    if (item) out.push(item);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeFrontIntent(
  value: unknown,
  allowedComponentIds: ReadonlySet<string>,
): LayoutSpecFrontIntent {
  const row = isRecord(value) ? value : {};
  const screen = normalizeOptionalItem(row.screen, allowedComponentIds);
  const stage = normalizeOptionalItem(row.stage, allowedComponentIds);
  return {
    ...(screen ? { screen } : {}),
    ...(stage ? { stage } : {}),
    av: normalizeItemArray(row.av, allowedComponentIds, 24),
  };
}

function normalizeAudienceIntent(
  value: unknown,
  allowedComponentIds: ReadonlySet<string>,
  attendeeTarget: number,
  layoutType: LayoutSpecLayoutType,
): LayoutSpecAudienceIntent {
  const row = isRecord(value) ? value : {};
  const fallbackPrimary = defaultPrimaryForLayoutType(layoutType);
  const primaryRaw = typeof row.primaryComponentId === "string" ? row.primaryComponentId.trim() : "";
  const primaryComponentId: RoomSetComponentId =
    isPlaceablePlannerComponentId(primaryRaw) &&
    allowedComponentIds.has(primaryRaw) &&
    isPrimarySeatingComponentId(primaryRaw)
      ? primaryRaw
      : fallbackPrimary;
  const catalogCapacity = primarySeatingCapacity(primaryComponentId) ?? 8;
  const primaryComponentCapacity = clampInt(
    Number(row.primaryComponentCapacity) || catalogCapacity,
    1,
    24,
  );
  const requiredPrimaryComponents = clampInt(
    Number(row.requiredPrimaryComponents) ||
      Math.ceil(attendeeTarget / primaryComponentCapacity),
    1,
    400,
  );
  return { primaryComponentId, primaryComponentCapacity, requiredPrimaryComponents };
}

export function defaultPrimaryForLayoutType(layoutType: LayoutSpecLayoutType): RoomSetComponentId {
  switch (layoutType) {
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

export function normalizeLayoutSpecFromUnknown(
  value: unknown,
  allowedComponentIds: readonly RoomSetComponentId[],
): LayoutSpec | null {
  if (!isRecord(value)) return null;
  const allowed = new Set<string>(allowedComponentIds);

  const eventIntent = enumValue(value.eventIntent, ROOM_SET_EVENT_INTENTS, "general_session");
  const layoutType = enumValue(value.layoutType, LAYOUT_TYPES, "theater");
  const attendeeTarget = clampInt(Number(value.attendeeTarget) || 100, 1, 1200);
  const densityPreference = normalizeRoomSetDensityPreference(
    enumValue(value.densityPreference, ["premium", "balanced", "compact", "comfortable", "high"], "balanced"),
  );
  const audienceStyle = normalizeRoomSetAudienceStyle(
    typeof value.audienceStyle === "string" ? value.audienceStyle : undefined,
    layoutType,
  );

  const front = normalizeFrontIntent(value.front, allowed);
  const audience = normalizeAudienceIntent(value.audience, allowed, attendeeTarget, layoutType);
  const secondary = normalizeItemArray(value.secondary, allowed, 48);
  const audienceTopology = normalizeAudienceTopologyFromUnknown(value.audienceTopology) ?? undefined;

  return {
    version: 1,
    source: "ai-generate",
    eventIntent,
    layoutType,
    attendeeTarget,
    densityPreference,
    audienceStyle,
    front,
    audience,
    ...(audienceTopology ? { audienceTopology } : {}),
    secondary,
  };
}

export function interpretationFromLayoutSpec(
  spec: LayoutSpec,
  args: Readonly<{
    accessibilityPriority: boolean;
    attendeeCount: number;
  }>,
): RoomSetOperationalBrief {
  const attendeeCount = clampInt(args.attendeeCount, 1, 1200);
  const briefBase = normalizeRoomSetInterpretation({
    archetype: spec.eventIntent,
    eventIntent: spec.eventIntent,
    requestedAttendees: attendeeCount,
    attendeeCount,
    densityPreference: spec.densityPreference,
    capacityStrategy: {
      requestedSeats: attendeeCount,
      seatingStyle: spec.layoutType,
      capacityIsHardRequirement: true,
      primaryComponentId: spec.audience.primaryComponentId,
      primaryComponentCapacity: spec.audience.primaryComponentCapacity,
      requiredPrimaryComponents: spec.audience.requiredPrimaryComponents,
      plannedPrimaryComponents: spec.audience.requiredPrimaryComponents,
      overflowPolicy: "recommend_larger_room",
    },
    accessibilityPriority: args.accessibilityPriority,
    componentRequests: [],
  });
  if (!briefBase) {
    throw new Error("Failed to build operational brief from layout spec.");
  }
  return {
    ...briefBase,
    densityPreference: spec.densityPreference,
    accessibilityPriority: args.accessibilityPriority,
    componentRequests: [],
    componentRequestInterpretation: undefined,
  };
}

export function stripSyntheticPolicyFromLayoutSpec(spec: LayoutSpec): LayoutSpec {
  const keepItem = (item: LayoutSpecItem | undefined): LayoutSpecItem | undefined => {
    if (!item || isRoomSetSyntheticPolicyComponentId(item.componentId)) return undefined;
    return item;
  };
  const keepItems = (items: readonly LayoutSpecItem[]): LayoutSpecItem[] =>
    items.filter((item) => !isRoomSetSyntheticPolicyComponentId(item.componentId));

  return {
    ...spec,
    front: {
      ...(keepItem(spec.front.screen) ? { screen: keepItem(spec.front.screen) } : {}),
      ...(keepItem(spec.front.stage) ? { stage: keepItem(spec.front.stage) } : {}),
      av: keepItems(spec.front.av),
    },
    secondary: keepItems(spec.secondary),
  };
}
