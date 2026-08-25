/**
 * Deterministic validation for AI layout plans — catalog schema and room bounds only.
 * Does not correct, clamp, reflow, or drop placements. Invalid plans are rejected as-is.
 */

import { getRoomSetComponent } from "@/lib/room-set/component-library";

import type { RoomSetLayoutPlacement } from "./planner-layout-schema";
import { isPlaceablePlannerComponentId } from "./planner-layout-schema";
import { formatFeetDimensions, formatRoomShellDimensions } from "./room-units";
import type {
  RoomSetPlanFailureAffectedObject,
  RoomSetPlanFailureDetails,
} from "./spatial-types";

export type PlannerLayoutValidationIssue = Readonly<{
  code: string;
  message: string;
  check?: string;
  affectedObjects?: readonly RoomSetPlanFailureAffectedObject[];
}>;

export type ValidatePlannerLayoutResult = Readonly<{
  ok: boolean;
  placements: readonly RoomSetLayoutPlacement[];
  issues: readonly PlannerLayoutValidationIssue[];
}>;

function placementInsideRoomBounds(
  placement: RoomSetLayoutPlacement,
  roomWidthLu: number,
  roomDepthLu: number,
): boolean {
  const def = getRoomSetComponent(placement.componentId);
  if (!def) return false;
  return (
    placement.xLu >= 0 &&
    placement.yLu >= 0 &&
    placement.xLu + def.widthLu <= roomWidthLu + 1e-6 &&
    placement.yLu + def.depthLu <= roomDepthLu + 1e-6
  );
}

function placementBounds(
  placement: RoomSetLayoutPlacement,
): Readonly<{ x: number; y: number; w: number; h: number }> | null {
  const def = getRoomSetComponent(placement.componentId);
  if (!def) return null;
  return {
    x: placement.xLu,
    y: placement.yLu,
    w: def.widthLu,
    h: def.depthLu,
  };
}

function affectedObjectForPlacement(
  placement: RoomSetLayoutPlacement,
  index: number,
): RoomSetPlanFailureAffectedObject {
  const def = getRoomSetComponent(placement.componentId);
  return {
    placementIndex: index + 1,
    componentId: placement.componentId,
    name: placement.label || def?.label || placement.componentId,
  };
}

function boundsOverlap(
  a: Readonly<{ x: number; y: number; w: number; h: number }>,
  b: Readonly<{ x: number; y: number; w: number; h: number }>,
): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

export function findPlannerLayoutPlacementOverlaps(
  placements: readonly RoomSetLayoutPlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
): PlannerLayoutValidationIssue[] {
  const issues: PlannerLayoutValidationIssue[] = [];
  for (let i = 0; i < placements.length; i += 1) {
    const a = placementBounds(placements[i]!);
    if (!a) continue;
    if (!placementInsideRoomBounds(placements[i]!, roomWidthLu, roomDepthLu)) {
      issues.push({
        code: "out_of_bounds",
        check: "room_bounds",
        message: `Placement ${i + 1}: ${placements[i]!.componentId} extends outside the room.`,
        affectedObjects: [affectedObjectForPlacement(placements[i]!, i)],
      });
    }
    for (let j = i + 1; j < placements.length; j += 1) {
      const b = placementBounds(placements[j]!);
      if (!b) continue;
      if (boundsOverlap(a, b)) {
        issues.push({
          code: "overlap",
          check: "collision",
          message: `Placements ${i + 1} (${placements[i]!.componentId}) and ${j + 1} (${placements[j]!.componentId}) overlap.`,
          affectedObjects: [
            affectedObjectForPlacement(placements[i]!, i),
            affectedObjectForPlacement(placements[j]!, j),
          ],
        });
      }
    }
  }
  return issues;
}

export function formatPlannerLayoutValidationErrors(
  issues: readonly PlannerLayoutValidationIssue[],
): string {
  if (issues.length === 0) return "Layout validation failed.";
  return issues.map((issue) => issue.message).join(" ");
}

export function plannerValidationIssuesToFailureDetails(
  issues: readonly PlannerLayoutValidationIssue[],
  options?: Readonly<{ code?: string; reason?: string }>,
): RoomSetPlanFailureDetails {
  const reason = options?.reason ?? formatPlannerLayoutValidationErrors(issues);
  const affectedObjects: RoomSetPlanFailureAffectedObject[] = [];
  const seen = new Set<string>();

  for (const issue of issues) {
    for (const object of issue.affectedObjects ?? []) {
      const key = [
        object.id ?? "",
        object.placementIndex ?? "",
        object.componentId ?? "",
        object.name ?? "",
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      affectedObjects.push(object);
    }
  }

  return {
    code: options?.code ?? issues[0]?.code ?? "validation_failed",
    reason,
    failedValidationChecks: issues.map((issue) =>
      issue.check ? `${issue.check}: ${issue.message}` : issue.message,
    ),
    affectedObjects,
  };
}

export function validatePlannerLayoutPlacements(
  rawPlacements: readonly RoomSetLayoutPlacement[],
  roomWidthLu: number,
  roomDepthLu: number,
): ValidatePlannerLayoutResult {
  const issues: PlannerLayoutValidationIssue[] = [];

  if (!(roomWidthLu > 0 && roomDepthLu > 0)) {
    return {
      ok: false,
      placements: [],
      issues: [
        {
          code: "invalid_room",
          check: "room_dimensions",
          message: "Room dimensions must be positive.",
        },
      ],
    };
  }

  if (rawPlacements.length === 0) {
    return {
      ok: false,
      placements: [],
      issues: [
        {
          code: "empty_layout",
          check: "placement_count",
          message: "Layout must include at least one placement.",
        },
      ],
    };
  }

  for (let index = 0; index < rawPlacements.length; index += 1) {
    const placement = rawPlacements[index]!;
    const label = `Placement ${index + 1}`;

    if (!isPlaceablePlannerComponentId(placement.componentId)) {
      issues.push({
        code: "unknown_component",
        check: "component_catalog",
        message: `${label}: unknown or unsupported componentId "${String(placement.componentId)}".`,
        affectedObjects: [affectedObjectForPlacement(placement, index)],
      });
      continue;
    }

    if (!getRoomSetComponent(placement.componentId)) {
      issues.push({
        code: "unknown_component",
        check: "component_catalog",
        message: `${label}: componentId "${placement.componentId}" is not in the catalog.`,
        affectedObjects: [affectedObjectForPlacement(placement, index)],
      });
      continue;
    }

    if (!Number.isFinite(placement.xLu) || !Number.isFinite(placement.yLu)) {
      issues.push({
        code: "invalid_coordinates",
        check: "coordinates",
        message: `${label}: xLu and yLu must be finite numbers.`,
        affectedObjects: [affectedObjectForPlacement(placement, index)],
      });
      continue;
    }

    if (!placementInsideRoomBounds(placement, roomWidthLu, roomDepthLu)) {
      const def = getRoomSetComponent(placement.componentId)!;
      issues.push({
        code: "out_of_bounds",
        check: "room_bounds",
        message: `${label}: ${placement.componentId} at (${placement.xLu}, ${placement.yLu}) with size ${formatFeetDimensions(def.widthLu, def.depthLu)} extends outside the ${formatRoomShellDimensions(roomWidthLu, roomDepthLu)} room.`,
        affectedObjects: [affectedObjectForPlacement(placement, index)],
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, placements: [], issues };
  }

  return { ok: true, placements: rawPlacements, issues: [] };
}

export function sumPlatedSeatCapacity(
  placements: readonly RoomSetLayoutPlacement[],
): number {
  let total = 0;
  for (const placement of placements) {
    const def = getRoomSetComponent(placement.componentId);
    if (def) total += Math.max(0, def.capacitySeated);
  }
  return total;
}
