import type {
  RoomSetEventIntentId,
  RoomSetLayoutStylePreference,
} from "./planner-intent-shared";

export type RoomSetLayoutStyleOption = Readonly<{
  id: RoomSetLayoutStylePreference;
  label: string;
  group?: string;
}>;

export const ROOM_SET_STYLE_LOCKED_OPTIONS = [
  { id: "auto", label: "Auto" },
] as const satisfies ReadonlyArray<RoomSetLayoutStyleOption>;

export const ROOM_SET_THEATER_STYLE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "aligned", label: "Rows" },
  { id: "theater_center_aisle", label: "Center aisle" },
  { id: "theater_chevron", label: "Chevron" },
] as const satisfies ReadonlyArray<RoomSetLayoutStyleOption>;

export const ROOM_SET_TOWN_HALL_STYLE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "aligned", label: "Rows" },
  { id: "townhall_center_aisle", label: "Center aisle" },
  { id: "theater_chevron", label: "Chevron" },
] as const satisfies ReadonlyArray<RoomSetLayoutStyleOption>;

export const ROOM_SET_BANQUET_STYLE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "aligned", label: "Structured" },
  { id: "staggered", label: "Staggered" },
  { id: "clusters", label: "Clusters" },
] as const satisfies ReadonlyArray<RoomSetLayoutStyleOption>;

export const ROOM_SET_RECEPTION_STYLE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "reception_clusters", label: "Clusters" },
  { id: "reception_open_center", label: "Open center" },
  { id: "reception_perimeter", label: "Perimeter" },
] as const satisfies ReadonlyArray<RoomSetLayoutStyleOption>;

export const ROOM_SET_CLASSROOM_STYLE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "aligned", label: "Rows" },
  { id: "theater_center_aisle", label: "Center aisle" },
] as const satisfies ReadonlyArray<RoomSetLayoutStyleOption>;

export const ROOM_SET_WORKSHOP_STYLE_OPTIONS = [
  { id: "auto", label: "Auto" },
  { id: "workshop_pods", label: "Pods" },
  { id: "workshop_collaborative", label: "U-shape / Collaborative" },
] as const satisfies ReadonlyArray<RoomSetLayoutStyleOption>;

export const ROOM_SET_PROMPT_STYLE_HINT_OPTIONS: readonly RoomSetLayoutStyleOption[] = [
  { id: "auto", label: "Auto" },
  { id: "aligned", label: "Rows", group: "Audience" },
  { id: "theater_center_aisle", label: "Center aisle", group: "Audience" },
  { id: "theater_chevron", label: "Chevron", group: "Audience" },
  { id: "aligned", label: "Structured", group: "Banquet" },
  { id: "staggered", label: "Staggered", group: "Banquet" },
  { id: "clusters", label: "Clusters", group: "Banquet" },
  { id: "reception_open_center", label: "Open center", group: "Reception / Expo" },
  { id: "reception_perimeter", label: "Perimeter", group: "Reception / Expo" },
  { id: "workshop_pods", label: "Pods", group: "Workshop" },
] as const;

export function layoutStyleOptionsForIntent(
  eventIntent: RoomSetEventIntentId | null | undefined,
): readonly RoomSetLayoutStyleOption[] {
  if (eventIntent === "town_hall") return ROOM_SET_TOWN_HALL_STYLE_OPTIONS;
  if (eventIntent === "general_session") return ROOM_SET_THEATER_STYLE_OPTIONS;
  if (eventIntent === "banquet_remarks" || eventIntent === "awards_dinner") return ROOM_SET_BANQUET_STYLE_OPTIONS;
  if (eventIntent === "networking_reception" || eventIntent === "expo_lounge") return ROOM_SET_RECEPTION_STYLE_OPTIONS;
  if (eventIntent === "training_session") return ROOM_SET_CLASSROOM_STYLE_OPTIONS;
  if (eventIntent === "workshop") return ROOM_SET_WORKSHOP_STYLE_OPTIONS;
  return ROOM_SET_STYLE_LOCKED_OPTIONS;
}
