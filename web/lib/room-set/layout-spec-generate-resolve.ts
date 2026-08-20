/**
 * Deterministic Generate-mode resolution — server overrides flaky AI intent fields.
 */

import {
  inferCapacityTargetFromPrompt,
  inferPrimaryAudienceObjectCountFromPrompt,
} from "@/lib/room-set/planner-component-requests";
import type { RoomSetPrimaryAudienceObjectCountIntent } from "@/lib/room-set/planner-component-requests";
import type {
  RoomSetDensityControl,
  RoomSetDensityPreference,
  RoomSetEventIntentId,
  RoomSetAudienceStyle,
  RoomSetLayoutStylePreference,
} from "@/lib/room-set/planner-intent-shared";
import { normalizeRoomSetAudienceStyle } from "@/lib/room-set/planner-intent-shared";
import type { RoomSetComponentId } from "@/lib/room-set/component-library";
import {
  inferPrimarySeatingComponentFromPrompt,
  isPrimarySeatingComponentId,
  primarySeatingCapacity,
  starterIdFromPrimaryComponentId,
} from "@/lib/room-set/planner-seating-resolve";

import type { LayoutSpec, LayoutSpecAudienceIntent, LayoutSpecItem, LayoutSpecLayoutType } from "./layout-spec";
import { defaultPrimaryForLayoutType } from "./layout-spec-normalize";

function clampAttendees(value: number): number {
  return Math.max(1, Math.min(1200, Math.round(value)));
}

export function layoutTypeForEventIntent(eventIntent: RoomSetEventIntentId): LayoutSpecLayoutType {
  switch (eventIntent) {
    case "banquet_remarks":
    case "awards_dinner":
      return "banquet";
    case "training_session":
    case "workshop":
      return "classroom";
    case "networking_reception":
    case "expo_lounge":
      return "reception";
    case "general_session":
    case "town_hall":
    default:
      return "theater";
  }
}

export function inferLayoutTypeFromPrompt(prompt: string): LayoutSpecLayoutType | null {
  const text = prompt.trim();
  if (!text) return null;

  if (/\b(?:networking\s+reception|cocktail\s+reception|standing\s+reception|reception|networking|cocktail|mingle|lounge|social|clusters?|highboys?|cocktail\s+clusters?)\b/i.test(text)) {
    return "reception";
  }
  if (/\b(?:classroom|training\s+session|training|workshop|instruction|desk\s+rows?)\b/i.test(text)) {
    return "classroom";
  }
  if (/\b(?:banquet|awards\s+dinner|seated\s+dinner|round\s+tables?|rounds?\s+dinner)\b/i.test(text)) {
    return "banquet";
  }
  if (/\b(?:theater|town\s+hall|speaker\s+session|q\s*&\s*a|q&a|general\s+session|keynote|audience\s+rows?|keynote\s+seating)\b/i.test(text)) {
    return "theater";
  }
  return null;
}

export function inferAudienceStyleFromPrompt(
  prompt: string,
  layoutType?: LayoutSpecLayoutType,
): RoomSetAudienceStyle | null {
  const text = prompt.trim();
  if (!text) return null;
  if (layoutType === "theater" && /\bdiagonal\s+(?:audience\s+)?rows?\b|\b(?:audience\s+)?rows?\s+(?:on\s+)?(?:a\s+)?diagonal\b/i.test(text)) {
    return "arc";
  }
  if (/\b(?:diagonal|staggered|offset)\s+(?:audience\s+)?rows?\b|\b(?:audience\s+)?rows?\s+(?:on\s+)?(?:a\s+)?(?:diagonal|staggered|offset)\b/i.test(text)) {
    return "loose";
  }
  if (/\b(?:structured|aligned|grid|rows?|row-based|classroom|theater)\b/i.test(text)) {
    return "grid";
  }
  if (/\b(?:crescent|half[\s-]moon|u[\s-]shaped|curved|fan(?:ned)?|arc(?:ed)?)\b/i.test(text)) {
    return "arc";
  }
  if (/\b(?:clusters?|clustered|scattered|distributed|scatter(?:ed)?|social|spread\s+(?:the\s+)?(?:rounds?|tables?|clusters?)\s+across)\b/i.test(text)) {
    return "scattered";
  }
  if (layoutType === "theater" && /\b(?:staggered|loose|organic|informal|natural)\b/i.test(text)) {
    return null;
  }
  if (/\b(?:loose|organic|staggered|informal|social|natural)\b/i.test(text)) {
    return "loose";
  }
  return null;
}

function inferLayoutStyleFromPrompt(prompt: string): RoomSetLayoutStylePreference | null {
  const text = prompt.trim();
  if (!text) return null;
  if (/\bdiagonal\s+(?:audience\s+)?rows?\b|\b(?:audience\s+)?rows?\s+(?:on\s+)?(?:a\s+)?diagonal\b/i.test(text)) {
    return "theater_diagonal";
  }
  if (/\b(?:staggered|offset|chevron)\s+(?:audience\s+)?rows?\b|\b(?:audience\s+)?rows?\s+(?:on\s+)?(?:a\s+)?(?:staggered|offset|chevron)\b/i.test(text)) {
    return "theater_chevron";
  }
  if (/\b(?:center|central)\s+aisle\b/i.test(text)) {
    return "theater_center_aisle";
  }
  if (/\b(?:split|side)\s+aisles?\b/i.test(text)) {
    return "theater_split_aisles";
  }
  if (/\b(?:fan seating|fanned seating|fan rows?)\b/i.test(text)) {
    return "theater_fan";
  }
  if (/\b(?:staggered|offset)\s+(?:rounds?|tables?)\b|\b(?:rounds?|tables?)\s+(?:on\s+)?(?:a\s+)?(?:staggered|offset)\b/i.test(text)) {
    return "staggered";
  }
  if (/\b(?:structured|aligned|grid|row-based|clean rows?|classroom rows?|theater rows?)\b/i.test(text)) {
    return "aligned";
  }
  if (/\b(?:clusters?|clustered|scattered|distributed|loose clusters?|mingle|networking|reception|lounge|social)\b/i.test(text)) {
    return "clusters";
  }
  if (/\b(?:organic|staggered|natural|planner-quality variation|less rigid)\b/i.test(text)) {
    return "staggered";
  }
  return null;
}

export function defaultLayoutStyleForEventIntent(
  eventIntent: RoomSetEventIntentId,
  prompt = "",
): RoomSetLayoutStylePreference {
  const promptStyle = inferLayoutStyleFromPrompt(prompt);
  if (promptStyle) return promptStyle;

  switch (eventIntent) {
    case "banquet_remarks":
    case "awards_dinner":
      return "staggered";
    case "networking_reception":
    case "expo_lounge":
      return "clusters";
    case "workshop":
      return /\b(?:round\s+tables?|breakouts?|collaborative|organic|staggered|natural|banquet|social|networking|clusters?)\b/i.test(prompt)
        ? "staggered"
        : "aligned";
    case "training_session":
    case "general_session":
    case "town_hall":
    default:
      return "aligned";
  }
}

function audienceStyleForLayoutStyle(
  layoutType: LayoutSpecLayoutType,
  layoutStyle: RoomSetLayoutStylePreference,
  aiAudienceStyle: RoomSetAudienceStyle,
): RoomSetAudienceStyle {
  if (
    layoutStyle === "theater_classic" ||
    layoutStyle === "theater_split_aisles" ||
    layoutStyle === "theater_fan" ||
    layoutStyle === "townhall_qa_aisles" ||
    layoutStyle === "townhall_forum"
  ) {
    return "grid";
  }
  if (layoutStyle === "townhall_center_aisle") {
    return layoutType === "theater" ? "scattered" : "grid";
  }
  if (layoutStyle === "theater_center_aisle") {
    return layoutType === "theater" || layoutType === "classroom" ? "scattered" : "grid";
  }
  if (layoutStyle === "theater_chevron") {
    return layoutType === "theater" ? "loose" : "grid";
  }
  if (layoutStyle === "theater_diagonal") {
    return layoutType === "theater" ? "arc" : "grid";
  }
  if (layoutStyle === "reception_clusters" || layoutStyle === "reception_social_zones") {
    return layoutType === "reception" ? "scattered" : "grid";
  }
  if (layoutStyle === "reception_open_center") {
    return layoutType === "reception" ? "arc" : "grid";
  }
  if (layoutStyle === "reception_perimeter") {
    return layoutType === "reception" ? "loose" : "grid";
  }
  if (layoutStyle === "workshop_pods") {
    return layoutType === "classroom" ? "scattered" : "grid";
  }
  if (layoutStyle === "workshop_collaborative") {
    return layoutType === "classroom" ? "arc" : "grid";
  }
  if (layoutStyle === "aligned") return "grid";
  if (layoutStyle === "staggered") return layoutType === "theater" ? "grid" : normalizeRoomSetAudienceStyle("loose", layoutType);
  if (layoutStyle === "clusters") {
    return layoutType === "reception" || layoutType === "banquet"
      ? normalizeRoomSetAudienceStyle("scattered", layoutType)
      : normalizeRoomSetAudienceStyle("loose", layoutType);
  }
  return normalizeRoomSetAudienceStyle(aiAudienceStyle, layoutType);
}

export function resolveDensityPreferenceFromControl(args: Readonly<{
  control: RoomSetDensityControl | undefined;
  prompt: string;
  eventIntent: RoomSetEventIntentId;
  attendeeTarget: number;
  roomWidthLu?: number;
  roomDepthLu?: number;
  fallback?: RoomSetDensityPreference;
}>): RoomSetDensityPreference {
  if (/\b(?:compact|tight|tighter|dense|maximum capacity|max capacity)\b/i.test(args.prompt)) {
    return "compact";
  }
  if (/\b(?:premium|spacious|comfortable|spread out|space out|wide aisles?)\b/i.test(args.prompt)) {
    return "premium";
  }
  if (args.control && args.control !== "auto") return args.control;

  const roomArea = (args.roomWidthLu ?? 0) * (args.roomDepthLu ?? 0);
  const areaPerAttendee = roomArea > 0 ? roomArea / Math.max(1, args.attendeeTarget) : null;
  if (areaPerAttendee !== null) {
    if (areaPerAttendee < 42) return "compact";
    if (
      areaPerAttendee > 90 &&
      (args.eventIntent === "banquet_remarks" ||
        args.eventIntent === "awards_dinner" ||
        args.eventIntent === "networking_reception" ||
        args.eventIntent === "expo_lounge")
    ) {
      return "premium";
    }
  }

  return args.fallback ?? "balanced";
}

export function resolveAudienceStyleFromLayoutStyle(args: Readonly<{
  control: RoomSetLayoutStylePreference | undefined;
  prompt: string;
  eventIntent: RoomSetEventIntentId;
  layoutType: LayoutSpecLayoutType;
  aiAudienceStyle: RoomSetAudienceStyle;
}>): RoomSetAudienceStyle {
  const promptAudienceStyle = inferAudienceStyleFromPrompt(args.prompt, args.layoutType);
  if (promptAudienceStyle) return normalizeRoomSetAudienceStyle(promptAudienceStyle, args.layoutType);
  const resolvedStyle =
    args.control && args.control !== "auto"
      ? args.control
      : defaultLayoutStyleForEventIntent(args.eventIntent, args.prompt);
  return audienceStyleForLayoutStyle(args.layoutType, resolvedStyle, args.aiAudienceStyle);
}

export function resolveGenerateAttendeeTarget(args: Readonly<{
  prompt: string;
  sidebarCount: number;
}>): Readonly<{ attendeeTarget: number; promptCount: number | null; sidebarCount: number; source: "prompt" | "sidebar" }> {
  const sidebarCount = clampAttendees(args.sidebarCount);
  const promptCount = inferCapacityTargetFromPrompt(args.prompt);
  if (promptCount !== null) {
    return {
      attendeeTarget: clampAttendees(promptCount),
      promptCount,
      sidebarCount,
      source: "prompt",
    };
  }
  return {
    attendeeTarget: sidebarCount,
    promptCount: null,
    sidebarCount,
    source: "sidebar",
  };
}

function reconcileAudienceIntent(args: Readonly<{
  layoutType: LayoutSpecLayoutType;
  prompt: string;
  attendeeTarget: number;
  aiAudience: LayoutSpecAudienceIntent;
}>): LayoutSpecAudienceIntent {
  const promptPrimary = inferPrimarySeatingComponentFromPrompt(args.prompt);
  const promptObjectCount = inferPrimaryAudienceObjectCountFromPrompt(args.prompt);
  let primaryComponentId = defaultPrimaryForLayoutType(args.layoutType);

  if (
    promptObjectCount &&
    isPrimarySeatingComponentId(promptObjectCount.componentId) &&
    starterIdFromPrimaryComponentId(promptObjectCount.componentId) === args.layoutType
  ) {
    primaryComponentId = promptObjectCount.componentId;
  } else if (
    promptPrimary &&
    isPrimarySeatingComponentId(promptPrimary) &&
    starterIdFromPrimaryComponentId(promptPrimary) === args.layoutType
  ) {
    primaryComponentId = promptPrimary;
  } else if (
    isPrimarySeatingComponentId(args.aiAudience.primaryComponentId) &&
    starterIdFromPrimaryComponentId(args.aiAudience.primaryComponentId) === args.layoutType
  ) {
    primaryComponentId = args.aiAudience.primaryComponentId;
  }

  const primaryLayout = starterIdFromPrimaryComponentId(primaryComponentId);
  if (primaryLayout !== args.layoutType) {
    primaryComponentId = defaultPrimaryForLayoutType(args.layoutType);
  }

  const catalogCapacity = primarySeatingCapacity(primaryComponentId) ?? 8;
  const primaryComponentCapacity = Math.max(1, catalogCapacity);
  const requiredPrimaryComponents =
    promptObjectCount &&
    promptObjectCount.componentId === primaryComponentId
      ? promptObjectCount.count
      : Math.max(
          1,
          Math.min(400, Math.ceil(args.attendeeTarget / primaryComponentCapacity)),
        );

  return {
    primaryComponentId,
    primaryComponentCapacity,
    requiredPrimaryComponents,
  };
}

const BANQUET_REMARKS_SUPPORT_DEFAULTS = [
  { componentId: "fnb-buffet-line", count: 1, zoneRole: "rear" },
  { componentId: "fnb-portable-bar", count: 2, zoneRole: "rear" },
  { componentId: "registration-desk", count: 1, zoneRole: "rear" },
] satisfies readonly LayoutSpecItem[];

function promptRemovalMentions(prompt: string, targetPattern: string): boolean {
  const text = prompt.trim();
  if (!text) return false;
  const removalBeforeTarget = new RegExp(
    `\\b(?:no|without|remove|omit|skip|exclude|don't|do\\s+not)\\b[^.?!,;]{0,80}\\b(?:${targetPattern})\\b`,
    "i",
  );
  const targetBeforeRemoval = new RegExp(
    `\\b(?:${targetPattern})\\b[^.?!,;]{0,60}\\b(?:not\\s+needed|unneeded|unnecessary|removed|omitted|excluded)\\b`,
    "i",
  );
  return removalBeforeTarget.test(text) || targetBeforeRemoval.test(text);
}

function banquetRemarksSupportDefaultsForPrompt(prompt: string): readonly LayoutSpecItem[] {
  const removesFoodService = promptRemovalMentions(
    prompt,
    "food|f\\s*&\\s*b|fnb|catering|meal\\s+service|buffets?|bar\\s+service|service\\s+package",
  );
  const removesBuffet = removesFoodService || promptRemovalMentions(prompt, "buffets?|food\\s+stations?");
  const removesBar = removesFoodService || promptRemovalMentions(prompt, "bars?|beverage|drinks?|alcohol");
  const removesRegistration = promptRemovalMentions(prompt, "registration|check-?in|host\\s+check-?in");

  return BANQUET_REMARKS_SUPPORT_DEFAULTS.filter((item) => {
    if (item.componentId === "fnb-buffet-line") return !removesBuffet;
    if (item.componentId === "fnb-portable-bar") return !removesBar;
    if (item.componentId === "registration-desk") return !removesRegistration;
    return true;
  });
}

function mergeSecondaryDefaults(
  secondary: readonly LayoutSpecItem[],
  defaults: readonly LayoutSpecItem[],
): readonly LayoutSpecItem[] {
  if (defaults.length === 0) return secondary;
  let changed = false;
  const merged = secondary.map((item) => ({ ...item }));

  for (const defaultItem of defaults) {
    const existingIndex = merged.findIndex((item) => item.componentId === defaultItem.componentId);
    if (existingIndex < 0) {
      merged.push(defaultItem);
      changed = true;
      continue;
    }

    const existing = merged[existingIndex]!;
    const count = Math.max(existing.count, defaultItem.count);
    const next: LayoutSpecItem = {
      ...existing,
      count,
      zoneRole: existing.zoneRole ?? defaultItem.zoneRole,
      placementPreference: existing.placementPreference ?? defaultItem.placementPreference,
    };
    if (
      next.count !== existing.count ||
      next.zoneRole !== existing.zoneRole ||
      next.placementPreference !== existing.placementPreference
    ) {
      merged[existingIndex] = next;
      changed = true;
    }
  }

  return changed ? merged : secondary;
}

function withBanquetRemarksSupportDefaults(spec: LayoutSpec, prompt: string): LayoutSpec {
  if (spec.eventIntent !== "banquet_remarks" || spec.layoutType !== "banquet") return spec;
  const secondary = mergeSecondaryDefaults(
    spec.secondary,
    banquetRemarksSupportDefaultsForPrompt(prompt),
  );
  return secondary === spec.secondary ? spec : { ...spec, secondary };
}

export function finalizeGenerateLayoutSpec(args: Readonly<{
  spec: LayoutSpec;
  prompt: string;
  sidebarCount: number;
  sidebarDensityPreference?: RoomSetDensityControl;
  sidebarLayoutStyle?: RoomSetLayoutStylePreference;
  roomWidthLu?: number;
  roomDepthLu?: number;
}>): Readonly<{
  spec: LayoutSpec;
  attendeeTarget: number;
  promptCount: number | null;
  sidebarCount: number;
  attendeeSource: "prompt" | "sidebar";
  capacityChangeRequested: boolean;
  promptPrimaryObjectCount: RoomSetPrimaryAudienceObjectCountIntent | null;
}> {
  const attendee = resolveGenerateAttendeeTarget({
    prompt: args.prompt,
    sidebarCount: args.sidebarCount,
  });

  const promptLayoutType = inferLayoutTypeFromPrompt(args.prompt);
  const intentLayoutType = layoutTypeForEventIntent(args.spec.eventIntent);
  const layoutType = promptLayoutType ?? intentLayoutType ?? args.spec.layoutType;

  const audience = reconcileAudienceIntent({
    layoutType,
    prompt: args.prompt,
    attendeeTarget: attendee.attendeeTarget,
    aiAudience: args.spec.audience,
  });
  const promptPrimaryObjectCountRaw = inferPrimaryAudienceObjectCountFromPrompt(args.prompt);
  const promptPrimaryObjectCount =
    promptPrimaryObjectCountRaw?.componentId === audience.primaryComponentId
      ? promptPrimaryObjectCountRaw
      : null;

  const spec: LayoutSpec = withBanquetRemarksSupportDefaults({
    ...args.spec,
    layoutType,
    attendeeTarget: attendee.attendeeTarget,
    densityPreference: resolveDensityPreferenceFromControl({
      control: args.sidebarDensityPreference,
      prompt: args.prompt,
      eventIntent: args.spec.eventIntent,
      attendeeTarget: attendee.attendeeTarget,
      roomWidthLu: args.roomWidthLu,
      roomDepthLu: args.roomDepthLu,
      fallback: args.spec.densityPreference,
    }),
    audience,
    audienceStyle: resolveAudienceStyleFromLayoutStyle({
      control: args.sidebarLayoutStyle,
      prompt: args.prompt,
      eventIntent: args.spec.eventIntent,
      layoutType,
      aiAudienceStyle: args.spec.audienceStyle,
    }),
  }, args.prompt);

  const capacityChangeRequested =
    attendee.promptCount !== null && attendee.promptCount !== attendee.sidebarCount;

  return {
    spec,
    attendeeTarget: attendee.attendeeTarget,
    promptCount: attendee.promptCount,
    sidebarCount: attendee.sidebarCount,
    attendeeSource: attendee.source,
    capacityChangeRequested,
    promptPrimaryObjectCount,
  };
}
