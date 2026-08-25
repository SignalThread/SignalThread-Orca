/**
 * Expand LayoutSpec → flat placement requests → geometry compose.
 */

import type { RoomSetLayoutPlacement } from "./planner-layout-schema";
import { composePlannerLayoutPlacements, type ComposePlannerLayoutResult } from "./planner-layout-compose";
import type { LayoutSpec, LayoutSpecComposeInput, LayoutSpecItem } from "./layout-spec";

function expandSpecItem(item: LayoutSpecItem): RoomSetLayoutPlacement[] {
  const count = Math.max(1, Math.min(400, Math.round(item.count)));
  const label = item.label?.trim();
  return Array.from({ length: count }, () => ({
    componentId: item.componentId,
    xLu: 0,
    yLu: 0,
    rotationDeg: 0,
    ...(label ? { label } : {}),
    ...(item.placementPreference ? { placementPreference: item.placementPreference } : {}),
    ...(item.zoneRole ? { zoneRole: item.zoneRole } : {}),
  }));
}

export function expandLayoutSpecToPlacements(spec: LayoutSpec): RoomSetLayoutPlacement[] {
  const out: RoomSetLayoutPlacement[] = [];

  if (spec.front.screen) out.push(...expandSpecItem(spec.front.screen));
  if (spec.front.stage) out.push(...expandSpecItem(spec.front.stage));
  for (const avItem of spec.front.av) out.push(...expandSpecItem(avItem));

  const audienceCount = Math.max(
    1,
    Math.min(400, Math.round(spec.audience.requiredPrimaryComponents)),
  );
  for (let index = 0; index < audienceCount; index += 1) {
    out.push({
      componentId: spec.audience.primaryComponentId,
      xLu: 0,
      yLu: 0,
      rotationDeg: 0,
    });
  }

  for (const secondaryItem of spec.secondary) {
    out.push(...expandSpecItem(secondaryItem));
  }

  return out;
}

export function composeLayoutSpec(input: LayoutSpecComposeInput): ComposePlannerLayoutResult {
  const placementRequests = expandLayoutSpecToPlacements(input.spec);
  console.info("[room-set/compose] layout spec expanded", {
    itemCount: placementRequests.length,
    frontAvCount: input.spec.front.av.length,
    audienceComponents: input.spec.audience.requiredPrimaryComponents,
    secondaryCount: input.spec.secondary.length,
    densityPreference: input.spec.densityPreference,
    audienceStyle: input.spec.audienceStyle,
    layoutType: input.spec.layoutType,
  });
  return composePlannerLayoutPlacements(
    placementRequests,
    input.roomWidthLu,
    input.roomDepthLu,
    input.spec.densityPreference,
    input.spec.audienceStyle,
    input.spec.layoutType,
    input.spec.eventIntent,
    input.spec.audienceTopology,
    input.applySemanticDirectives,
    input.spec.attendeeTarget,
  );
}
