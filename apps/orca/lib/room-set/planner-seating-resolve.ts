/**
 * Server-safe seating primitive → layout starter resolution (no canvas/tldraw runtime).
 */

import {
  getRoomSetComponent,
  type RoomSetComponentId,
} from "@/lib/room-set/component-library";

import type { RoomSetOperationalBrief, RoomTypeStarterId } from "./planner-intent-shared";

export const PRIMARY_SEATING_COMPONENT_IDS = [
  "seating-theater-row",
  "seating-classroom-row",
  "table-round-60",
  "table-round-72",
  "table-banquet-6ft",
  "table-cocktail-cluster",
  "table-cocktail",
] as const;

export type PrimarySeatingComponentId = (typeof PRIMARY_SEATING_COMPONENT_IDS)[number];

export function isPrimarySeatingComponentId(value: string): value is PrimarySeatingComponentId {
  return (PRIMARY_SEATING_COMPONENT_IDS as readonly string[]).includes(value);
}

export function starterIdFromPrimaryComponentId(componentId: RoomSetComponentId): RoomTypeStarterId | null {
  switch (componentId) {
    case "seating-theater-row":
      return "theater";
    case "seating-classroom-row":
      return "classroom";
    case "table-round-60":
    case "table-round-72":
    case "table-banquet-6ft":
      return "banquet";
    case "table-cocktail-cluster":
    case "table-cocktail":
      return "reception";
    default:
      return null;
  }
}

export function primarySeatingCapacity(componentId: RoomSetComponentId): number | null {
  if (!isPrimarySeatingComponentId(componentId)) return null;
  const def = getRoomSetComponent(componentId);
  if (!def) return null;
  return Math.max(1, def.capacitySeated);
}

/** Prompt-level seating primitive cues (generic catalog mapping, not event-specific rules). */
export function inferPrimarySeatingComponentFromPrompt(prompt: string): RoomSetComponentId | null {
  const text = prompt.trim();
  if (!text) return null;

  const wantsTablesNotChairs =
    /\b(?:tables?\s+not\s+chairs?|not\s+chairs?\b[\s\S]{0,24}\btables?|want\s+tables?\s+instead\s+of\s+chairs?)\b/i.test(
      text,
    );
  const wantsChairsNotTables =
    /\b(?:chairs?\s+not\s+tables?|not\s+tables?\b[\s\S]{0,24}\bchairs?|want\s+chairs?\s+instead\s+of\s+tables?|replace\s+tables?\s+with\s+chairs?)\b/i.test(
      text,
    );
  if (wantsTablesNotChairs) return "table-round-60";
  if (wantsChairsNotTables) {
    return /\b(?:classroom|training|workshop|desk)\b/i.test(text)
      ? "seating-classroom-row"
      : "seating-theater-row";
  }

  if (/\b(?:classroom\s+rows?|desk\s+rows?|training\s+rows?)\b/i.test(text)) {
    return "seating-classroom-row";
  }
  if (/\b(?:theater\s+rows?|audience\s+rows?|chair\s+rows?|rows?\s+of\s+chairs?)\b/i.test(text)) {
    return "seating-theater-row";
  }
  if (/\b(?:72\s*(?:in|inch)?\s+rounds?|round\s+72)\b/i.test(text)) return "table-round-72";
  if (/\b(?:round\s+tables?|banquet\s+tables?|rounds?)\b/i.test(text)) return "table-round-60";
  if (/\b(?:6\s*ft|six\s+foot)\s+(?:banquet\s+)?tables?\b/i.test(text)) return "table-banquet-6ft";
  if (/\b(?:cocktail\s+clusters?|highboys?|mingle\s+clusters?)\b/i.test(text)) {
    return "table-cocktail-cluster";
  }
  if (/\b(?:tables?|banquet)\b/i.test(text) && !/\b(?:cocktail|highboy|buffet|registration)\b/i.test(text)) {
    return "table-round-60";
  }
  if (/\b(?:chairs?|theater|audience\s+seating)\b/i.test(text) && !/\b(?:table|round|banquet)\b/i.test(text)) {
    return "seating-theater-row";
  }
  return null;
}

/**
 * Seating starter selection priority:
 * 1. Explicit prompt seating primitive
 * 2. Interpreted brief primary component / seatingStyle
 * 3. Archetype preset default
 */
export function resolveEffectiveStarterId(args: Readonly<{
  brief: RoomSetOperationalBrief;
  archetypeStarterId: RoomTypeStarterId;
  plannerPrompt?: string;
}>): RoomTypeStarterId {
  const promptPrimary = args.plannerPrompt?.trim()
    ? inferPrimarySeatingComponentFromPrompt(args.plannerPrompt)
    : null;
  if (promptPrimary) {
    const fromPrompt = starterIdFromPrimaryComponentId(promptPrimary);
    if (fromPrompt) return fromPrompt;
  }

  const fromBriefPrimary = starterIdFromPrimaryComponentId(args.brief.capacityStrategy.primaryComponentId);
  if (fromBriefPrimary) return fromBriefPrimary;

  return args.brief.capacityStrategy.seatingStyle ?? args.archetypeStarterId;
}

/** Match operational brief seating metadata to the dominant primary primitive on canvas. */
export function alignOperationalBriefToPlacements(
  brief: RoomSetOperationalBrief,
  placements: readonly Readonly<{ componentId: RoomSetComponentId }>[],
  attendeeCount: number,
): RoomSetOperationalBrief {
  const counts = new Map<RoomSetComponentId, number>();
  for (const placement of placements) {
    if (!isPrimarySeatingComponentId(placement.componentId)) continue;
    counts.set(placement.componentId, (counts.get(placement.componentId) ?? 0) + 1);
  }
  if (counts.size === 0) {
    return {
      ...brief,
      requestedAttendees: attendeeCount,
      attendeeCount,
      capacityStrategy: {
        ...brief.capacityStrategy,
        requestedSeats: attendeeCount,
      },
    };
  }
  const dominantPrimary = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return operationalBriefWithPrimarySeating(brief, dominantPrimary, attendeeCount);
}

export function operationalBriefWithPrimarySeating(
  brief: RoomSetOperationalBrief,
  primaryComponentId: RoomSetComponentId,
  attendeeCount: number,
): RoomSetOperationalBrief {
  const primaryComponentCapacity = primarySeatingCapacity(primaryComponentId) ?? 8;
  const seatingStyle =
    starterIdFromPrimaryComponentId(primaryComponentId) ?? brief.capacityStrategy.seatingStyle;
  const requestedAttendees = Math.max(1, Math.min(1200, Math.round(attendeeCount)));
  const requiredPrimaryComponents = Math.max(
    1,
    Math.ceil(requestedAttendees / primaryComponentCapacity),
  );
  return {
    ...brief,
    requestedAttendees,
    attendeeCount: requestedAttendees,
    capacityStrategy: {
      ...brief.capacityStrategy,
      requestedSeats: requestedAttendees,
      seatingStyle,
      primaryComponentId,
      primaryComponentCapacity,
      requiredPrimaryComponents,
      plannedPrimaryComponents: requiredPrimaryComponents,
    },
  };
}

export function resolveEffectivePrimarySeatingComponentId(args: Readonly<{
  brief: RoomSetOperationalBrief;
  archetypeStarterId: RoomTypeStarterId;
  plannerPrompt?: string;
  canvasDominantPrimarySeating?: RoomSetComponentId | null;
}>): RoomSetComponentId {
  const promptPrimary = args.plannerPrompt?.trim()
    ? inferPrimarySeatingComponentFromPrompt(args.plannerPrompt)
    : null;
  if (promptPrimary) return promptPrimary;

  if (
    args.canvasDominantPrimarySeating &&
    isPrimarySeatingComponentId(args.canvasDominantPrimarySeating)
  ) {
    return args.canvasDominantPrimarySeating;
  }

  if (isPrimarySeatingComponentId(args.brief.capacityStrategy.primaryComponentId)) {
    return args.brief.capacityStrategy.primaryComponentId;
  }

  const starter = args.archetypeStarterId;
  switch (starter) {
    case "classroom":
      return "seating-classroom-row";
    case "banquet":
      return "table-round-60";
    case "reception":
      return "table-cocktail-cluster";
    case "theater":
    default:
      return "seating-theater-row";
  }
}
