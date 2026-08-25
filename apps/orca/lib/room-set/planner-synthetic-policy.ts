/**
 * Synthetic policy / circulation aisle objects excluded from Generate New Layout
 * unless the user prompt explicitly requests them.
 */

import {
  getRoomSetComponent,
  ROOM_SET_COMPONENTS,
  type RoomSetComponentId,
} from "@/lib/room-set/component-library";

const EXPLICIT_SYNTHETIC_POLICY_PROMPT_RE =
  /\b(?:emergency\s+egress|egress\s+path|safety[\s-]egress|staff\s+(?:access\s+)?lane|service\s+(?:staff\s+)?access\s+lane|ada\s+clearance(?:\s+zone)?|accessibility\s+clearance|service\s+corridor|circulation\s+(?:path|overlay|zone)|comfort\s+inset|aisle\s+policy|service\s+path)\b/i;

/** Safety/service aisle-zone overlays — not user-visible furniture unless explicitly requested. */
export function isRoomSetSyntheticPolicyComponentId(componentId: string): componentId is RoomSetComponentId {
  const def = getRoomSetComponent(componentId);
  if (!def) return false;
  return def.shapeType === "planner-aisle-zone" && (def.category === "safety" || def.category === "service");
}

export function userExplicitlyRequestedSyntheticPolicyComponents(prompt: string): boolean {
  return EXPLICIT_SYNTHETIC_POLICY_PROMPT_RE.test(prompt.trim());
}

export function roomSetGenerateLayoutComponentIds(prompt: string): readonly RoomSetComponentId[] {
  const allIds = ROOM_SET_COMPONENTS.map((component) => component.id) as RoomSetComponentId[];
  if (userExplicitlyRequestedSyntheticPolicyComponents(prompt)) {
    return allIds;
  }
  return allIds.filter((componentId) => !isRoomSetSyntheticPolicyComponentId(componentId));
}

export function filterSyntheticPolicyPlacementsForGenerate<T extends Readonly<{ componentId: RoomSetComponentId }>>(
  placements: readonly T[],
  prompt: string,
): T[] {
  if (userExplicitlyRequestedSyntheticPolicyComponents(prompt)) {
    return [...placements];
  }
  return placements.filter((placement) => !isRoomSetSyntheticPolicyComponentId(placement.componentId));
}

export const GENERATE_LAYOUT_SYNTHETIC_POLICY_PROMPT_RULE =
  "Do not add safety egress paths, staff access lanes, ADA clearance zones, service corridors, circulation overlays, comfort insets, or other synthetic policy aisle objects unless the user prompt explicitly names them.";
