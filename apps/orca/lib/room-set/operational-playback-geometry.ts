import type { RoomSetDocumentV1 } from "./spatial-types";
import type { RoomSetSpatialObject } from "./spatial-types";

/** Visible layout objects for a lifecycle slice — local playback helper (no persistence). */
export function visibleObjectsForOperationalState(
  doc: RoomSetDocumentV1,
  stateId: string,
): RoomSetSpatialObject[] | null {
  const prog = doc.operational;

  if (!prog) return null;

  const st = prog.states[stateId];

  if (!st) return null;

  const slice = doc.layouts[st.layoutId];

  if (!slice) return null;

  const suppressed = new Set(st.suppressedObjectIds);

  return slice.objects.filter((o) => !suppressed.has(o.id));
}
