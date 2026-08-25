import type { RoomSetObjectType } from "@/lib/room-set/spatial-types";

export const PLANNER_TLDRAW_SHAPE_TYPES = [
  "planner-banquet-round",
  "planner-classroom-table",
  "planner-theater-row",
  "planner-stage",
  "planner-av-table",
  "planner-screen-led",
  "planner-buffet",
  "planner-bar",
  "planner-registration-desk",
  "planner-aisle-zone",
  "planner-operational-fixture",
] as const;

export type PlannerTldrawShapeType = (typeof PLANNER_TLDRAW_SHAPE_TYPES)[number];

export type PlannerTldrawKind = PlannerTldrawShapeType;

export const PLANNER_SHAPE_TO_DOMAIN: Record<PlannerTldrawKind, RoomSetObjectType> = {
  "planner-banquet-round": "banquet_table",
  "planner-classroom-table": "classroom_table",
  "planner-theater-row": "chair_block",
  "planner-stage": "stage",
  "planner-av-table": "av_table",
  "planner-screen-led": "screen",
  "planner-buffet": "buffet",
  "planner-bar": "bar",
  "planner-registration-desk": "registration_desk",
  "planner-aisle-zone": "aisle_zone",
  "planner-operational-fixture": "aisle_zone",
};

export const PLANNER_KIND_LABELS: Record<PlannerTldrawKind, string> = {
  "planner-banquet-round": "Banquet round",
  "planner-classroom-table": "Classroom table row",
  "planner-theater-row": "Theater seating row",
  "planner-stage": "Stage",
  "planner-av-table": "AV table",
  "planner-screen-led": "Screen / LED",
  "planner-buffet": "Buffet",
  "planner-bar": "Bar",
  "planner-registration-desk": "Registration desk",
  "planner-aisle-zone": "Aisle / circulation",
  "planner-operational-fixture": "Operational component",
};

export const PLANNER_TLDRAW_SHAPE_SET: ReadonlySet<string> = new Set(
  PLANNER_TLDRAW_SHAPE_TYPES,
);

export function isPlannerTldrawShapeType(value: string): value is PlannerTldrawKind {
  return PLANNER_TLDRAW_SHAPE_SET.has(value);
}
