/**
 * Resolve AI patch component aliases to catalog component IDs (Apply patch path only).
 */

import type { RoomSetComponentId } from "@/lib/room-set/component-library";
import { isPlaceablePlannerComponentId } from "@/lib/room-set/planner-layout-schema";

const PATCH_COMPONENT_ALIASES: Readonly<Record<string, RoomSetComponentId>> = {
  bar: "fnb-portable-bar",
  bars: "fnb-portable-bar",
  "portable-bar": "fnb-portable-bar",
  "portable-bars": "fnb-portable-bar",
  "fnb-bar": "fnb-portable-bar",
  "bar-service": "fnb-portable-bar",
  "beverage-station": "fnb-portable-bar",
  registration: "registration-desk",
  "registration-table": "registration-desk",
  "registration-desk-table": "registration-desk",
  "check-in": "registration-desk",
  "check-in-desk": "registration-desk",
  "check-in-table": "registration-desk",
  "checkin-desk": "registration-desk",
  buffet: "fnb-buffet-line",
  "buffet-line": "fnb-buffet-line",
  "buffet-station": "fnb-buffet-line",
  "fnb-buffet": "fnb-buffet-line",
  "food-station": "fnb-buffet-line",
};

export function resolvePatchComponentId(raw: string): RoomSetComponentId | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (isPlaceablePlannerComponentId(trimmed)) {
    return trimmed;
  }

  const alias = PATCH_COMPONENT_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;

  return null;
}
