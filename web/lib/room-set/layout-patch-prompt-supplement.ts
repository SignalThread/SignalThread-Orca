/**
 * Fill missing prompt-requested secondary items when AI patch ops omit addItems (Apply path only).
 */

import {
  inferAddByEachAnchorComponentRequestFromPrompt,
  inferPlacementPreferenceFromPrompt,
  inferPlannerComponentRequestsFromPrompt,
} from "@/lib/room-set/planner-component-requests";

import type {
  LayoutPatch,
  LayoutPatchOp,
  LayoutSpec,
  LayoutSpecItem,
  LayoutSpecZoneRole,
} from "./layout-spec";
import type { RoomSetComponentId } from "@/lib/room-set/component-library";

function collectAddItemsComponentIds(patch: LayoutPatch): Set<RoomSetComponentId> {
  const ids = new Set<RoomSetComponentId>();
  for (const op of patch.ops) {
    if (op.op !== "addItems") continue;
    for (const item of op.items) {
      ids.add(item.componentId);
    }
  }
  return ids;
}

function removeMisresolvedAnchorAdds(
  patch: LayoutPatch,
  anchorComponentId: RoomSetComponentId,
): LayoutPatch {
  let changed = false;
  const correctedOps: LayoutPatchOp[] = [];
  for (const op of patch.ops) {
    if (op.op !== "addItems") {
      correctedOps.push(op);
      continue;
    }
    const filteredItems = op.items.filter((item) => {
      if (item.componentId !== anchorComponentId) return true;
      changed = true;
      return false;
    });
    if (filteredItems.length > 0) {
      correctedOps.push({ op: "addItems", items: filteredItems });
    }
  }
  return changed ? { version: 1, ops: correctedOps } : patch;
}

function inferZoneRoleFromPrompt(prompt: string): LayoutSpecZoneRole | undefined {
  if (/\bnear\s+the\s+rear\b|\brear\b|\bback\s+of\s+(?:the\s+)?room\b/i.test(prompt)) {
    return "rear";
  }
  if (/\bperimeter\b|\baround\s+the\s+(?:room|walls?)\b/i.test(prompt)) {
    return "perimeter";
  }
  return undefined;
}

export function supplementLayoutPatchFromPrompt(
  patch: LayoutPatch,
  prompt: string,
  attendeeCount: number,
  options: Readonly<{ baseLayoutSpec?: LayoutSpec | null }> = {},
): LayoutPatch {
  const addByEachAnchor = inferAddByEachAnchorComponentRequestFromPrompt(prompt, {
    baseLayoutSpec: options.baseLayoutSpec,
  });
  const correctedPatch = addByEachAnchor
    ? removeMisresolvedAnchorAdds(
        patch,
        addByEachAnchor.anchorComponentId,
      )
    : patch;
  const inferred = inferPlannerComponentRequestsFromPrompt(prompt, attendeeCount, {
    baseLayoutSpec: options.baseLayoutSpec,
  });
  if (inferred.length === 0) return correctedPatch;

  const alreadyAdding = collectAddItemsComponentIds(correctedPatch);
  const placementPreference = inferPlacementPreferenceFromPrompt(prompt);
  const zoneRole = inferZoneRoleFromPrompt(prompt);
  const supplementItems: LayoutSpecItem[] = [];

  for (const request of inferred) {
    if (alreadyAdding.has(request.catalogComponentId)) continue;
    supplementItems.push({
      componentId: request.catalogComponentId,
      count: request.count,
      ...(request.placementPreference ?? placementPreference
        ? { placementPreference: request.placementPreference ?? placementPreference }
        : {}),
      ...(zoneRole ? { zoneRole } : {}),
    });
  }

  if (supplementItems.length === 0) return correctedPatch;

  return {
    version: 1,
    ops: [...correctedPatch.ops, { op: "addItems", items: supplementItems }],
  };
}
