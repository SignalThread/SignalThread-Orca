/**
 * AI planner layout plan — server-safe types (no canvas/tldraw).
 */

import { ROOM_SET_COMPONENT_BY_ID } from "@/lib/room-set/component-library";
import type { RoomSetComponentId } from "@/lib/room-set/component-library";

import type { RoomSetPlannerPlacementPreference } from "@/lib/room-set/planner-component-requests";
import type { LayoutSpecZoneRole } from "@/lib/room-set/layout-spec";

export const PLANNER_LAYOUT_MAX_PLACEMENTS = 400;

export type RoomSetLayoutPlacement = Readonly<{
  componentId: RoomSetComponentId;
  xLu: number;
  yLu: number;
  rotationDeg: number;
  label?: string;
  placementPreference?: RoomSetPlannerPlacementPreference;
  zoneRole?: LayoutSpecZoneRole;
}>;

export type RoomSetCanvasLayoutSnapshot = Readonly<{
  roomWidthLu: number;
  roomDepthLu: number;
  placements: readonly RoomSetLayoutPlacement[];
}>;

export type RoomSetAiLayoutPlanMode = "generate" | "apply";

export function isPlaceablePlannerComponentId(value: string): value is RoomSetComponentId {
  return ROOM_SET_COMPONENT_BY_ID.has(value);
}

export function normalizeLayoutPlacementsFromUnknown(
  value: unknown,
): RoomSetLayoutPlacement[] {
  if (!Array.isArray(value)) return [];
  const out: RoomSetLayoutPlacement[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const componentIdRaw = typeof row.componentId === "string" ? row.componentId.trim() : "";
    if (!isPlaceablePlannerComponentId(componentIdRaw)) continue;
    const xLu = Number(row.xLu);
    const yLu = Number(row.yLu);
    if (!Number.isFinite(xLu) || !Number.isFinite(yLu)) continue;
    const rotationDeg = Number(row.rotationDeg);
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 80) : undefined;
    out.push({
      componentId: componentIdRaw,
      xLu,
      yLu,
      rotationDeg: Number.isFinite(rotationDeg) ? rotationDeg : 0,
      ...(label ? { label } : {}),
    });
    if (out.length >= PLANNER_LAYOUT_MAX_PLACEMENTS) break;
  }
  return out;
}

export function normalizeCanvasSnapshotFromUnknown(
  value: unknown,
): RoomSetCanvasLayoutSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const roomWidthLu = Number(row.roomWidthLu);
  const roomDepthLu = Number(row.roomDepthLu);
  if (!(roomWidthLu > 0 && roomDepthLu > 0)) return null;
  return {
    roomWidthLu,
    roomDepthLu,
    placements: normalizeLayoutPlacementsFromUnknown(row.placements),
  };
}
