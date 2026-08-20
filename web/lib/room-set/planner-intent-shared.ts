/**
 * Server-safe planner intent types and normalization (no React, tldraw, or canvas runtime).
 */

import type { RoomSetComponentId } from "@/lib/room-set/component-library";

import type {
  RoomSetComponentRequestInterpretationMeta,
  RoomSetPlannerComponentRequest,
} from "./planner-component-requests";

export type RoomTypeStarterId = "banquet" | "classroom" | "theater" | "reception";

export type RoomSetEventIntentId =
  | "banquet_remarks"
  | "awards_dinner"
  | "training_session"
  | "workshop"
  | "general_session"
  | "networking_reception"
  | "town_hall"
  | "expo_lounge";

/** Packing modes: widen aisles/perimeter (premium) → neutral (balanced) → denser aisles/spacing (compact). */
export type RoomSetDensityPreference = "premium" | "balanced" | "compact";

/** UI/request control; LayoutSpec still stores a concrete RoomSetDensityPreference. */
export type RoomSetDensityControl = "auto" | RoomSetDensityPreference;

/** UI/request topology control; LayoutSpec resolves this into RoomSetAudienceStyle. */
export type RoomSetLayoutStylePreference =
  | "auto"
  | "aligned"
  | "staggered"
  | "clusters"
  | "theater_classic"
  | "theater_center_aisle"
  | "theater_split_aisles"
  | "theater_chevron"
  | "theater_fan"
  | "theater_diagonal"
  | "townhall_center_aisle"
  | "townhall_qa_aisles"
  | "townhall_forum"
  | "reception_clusters"
  | "reception_social_zones"
  | "reception_open_center"
  | "reception_perimeter"
  | "workshop_pods"
  | "workshop_collaborative";

/** Audience composition — composer-owned placement behavior. */
export type RoomSetAudienceStyle = "grid" | "loose" | "scattered" | "arc";

export const ROOM_SET_AUDIENCE_STYLES = ["grid", "loose", "scattered", "arc"] as const;

export type RoomSetPresentationScale = "none" | "light" | "moderate" | "production";

export type RoomSetOperationalScale = "none" | "light" | "moderate" | "production";

export type RoomSetServicePriority =
  | "seating_capacity"
  | "sightlines"
  | "distributed_power"
  | "breakout_collaboration"
  | "teaching_av"
  | "registration"
  | "fnb"
  | "networking"
  | "recording"
  | "egress"
  | "accessibility"
  | "service_flow";

export type RoomSetCapacityStrategy = Readonly<{
  requestedSeats: number;
  seatingStyle: RoomTypeStarterId;
  capacityIsHardRequirement: boolean;
  primaryComponentId: RoomSetComponentId;
  primaryComponentCapacity: number;
  requiredPrimaryComponents: number;
  plannedPrimaryComponents: number;
  overflowPolicy: "warn" | "reduce_secondary_zones" | "recommend_larger_room";
}>;

/** Accept legacy UI / model tokens and normalize to {@link RoomSetDensityPreference}. */
/** Recompute primary-component counts when an apply/edit prompt changes headcount. */
export function operationalBriefWithAttendeeCount(
  brief: RoomSetOperationalBrief,
  attendeeCount: number,
): RoomSetOperationalBrief {
  const requestedAttendees = Math.max(1, Math.min(1200, Math.round(attendeeCount)));
  const primaryComponentCapacity = Math.max(1, brief.capacityStrategy.primaryComponentCapacity);
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
      requiredPrimaryComponents,
      plannedPrimaryComponents: requiredPrimaryComponents,
    },
  };
}

export function normalizeRoomSetDensityPreference(raw: string): RoomSetDensityPreference {
  const v = raw.trim().toLowerCase();
  if (v === "comfortable" || v === "premium") return "premium";
  if (v === "high" || v === "compact") return "compact";
  return "balanced";
}

export function normalizeRoomSetDensityControl(raw: string | undefined): RoomSetDensityControl {
  const v = (raw ?? "auto").trim().toLowerCase();
  if (v === "auto" || v === "automatic") return "auto";
  return normalizeRoomSetDensityPreference(v);
}

export function normalizeRoomSetLayoutStylePreference(
  raw: string | undefined,
): RoomSetLayoutStylePreference {
  const v = (raw ?? "auto").trim().toLowerCase();
  if (v === "classic" || v === "classic rows" || v === "theater_classic") return "theater_classic";
  if (v === "center aisle" || v === "center_aisle" || v === "theater_center_aisle") return "theater_center_aisle";
  if (v === "split aisles" || v === "split_aisles" || v === "theater_split_aisles") return "theater_split_aisles";
  if (v === "chevron" || v === "chevron rows" || v === "theater_chevron") return "theater_chevron";
  if (v === "fan" || v === "fan seating" || v === "theater_fan") return "theater_fan";
  if (v === "diagonal" || v === "diagonal rows" || v === "theater_diagonal") return "theater_diagonal";
  if (v === "q&a aisles" || v === "qa aisles" || v === "townhall_qa_aisles") return "townhall_qa_aisles";
  if (v === "forum" || v === "forum style" || v === "townhall_forum") return "townhall_forum";
  if (v === "reception_clusters") return "reception_clusters";
  if (v === "social zones" || v === "social_zones" || v === "reception_social_zones") return "reception_social_zones";
  if (v === "open center" || v === "open_center" || v === "reception_open_center") return "reception_open_center";
  if (v === "perimeter" || v === "perimeter flow" || v === "reception_perimeter") return "reception_perimeter";
  if (v === "pods" || v === "workshop_pods") return "workshop_pods";
  if (
    v === "u-shape" ||
    v === "u shape" ||
    v === "collaborative" ||
    v === "u-shape / collaborative" ||
    v === "workshop_collaborative"
  ) {
    return "workshop_collaborative";
  }
  if (v === "aligned" || v === "structured" || v === "grid" || v === "rows") return "aligned";
  if (v === "staggered" || v === "organic" || v === "loose" || v === "natural") return "staggered";
  if (
    v === "clusters" ||
    v === "clustered" ||
    v === "scattered" ||
    v === "scatter" ||
    v === "distributed" ||
    v === "reception"
  ) {
    return "clusters";
  }
  return "auto";
}

export function normalizeRoomSetAudienceStyle(
  raw: string | undefined,
  layoutType: RoomTypeStarterId,
): RoomSetAudienceStyle {
  const v = (raw ?? "grid").trim().toLowerCase();
  if (v === "clusters" || v === "clustered") {
    return layoutType === "reception" ? "scattered" : layoutType === "banquet" ? "loose" : "grid";
  }
  if (v === "scattered" || v === "scatter" || v === "distributed") {
    return layoutType === "banquet" || layoutType === "reception" ? "scattered" : "grid";
  }
  if (v === "loose" || v === "organic" || v === "staggered") return "loose";
  if (v === "aligned" || v === "structured") return "grid";
  if (v === "arc") return layoutType === "banquet" || layoutType === "theater" ? "arc" : "grid";
  return "grid";
}

export type RoomSetOperationalBrief = Readonly<{
  archetype: RoomSetEventIntentId;
  eventIntent: RoomSetEventIntentId;
  requestedAttendees: number;
  attendeeCount: number;
  productionScale: RoomSetOperationalScale;
  densityPreference: RoomSetDensityPreference;
  servicePriorities: readonly RoomSetServicePriority[];
  accessibilityPriority: boolean;
  requiredZones: readonly string[];
  optionalZones: readonly string[];
  capacityStrategy: RoomSetCapacityStrategy;
  layoutTradeoffs: readonly string[];
  operationalRisks: readonly string[];
  assumptions: readonly string[];
  generationInstructions: readonly string[];
  presentationScale: RoomSetPresentationScale;
  stageScale: RoomSetOperationalScale;
  avScale: RoomSetOperationalScale;
  seatingPriority: number;
  networkingPriority: number;
  fnbPriority: number;
  notes: readonly string[];
  componentRequests: readonly RoomSetPlannerComponentRequest[];
  /** How componentRequests were produced (AI vs local fallback). Set by interpret-intent. */
  componentRequestInterpretation?: RoomSetComponentRequestInterpretationMeta;
}>;
