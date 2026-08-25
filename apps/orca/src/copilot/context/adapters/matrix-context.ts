import { getMatrix2Snapshot } from "@/lib/matrix2";
import { getCapabilitiesForSurfaceMode } from "@/src/copilot/capabilities/capability-registry";
import type { CopilotSurfaceAdapterResult } from "@/src/copilot/context/copilot-context";

const MATRIX_SPEAKER_ROLES = new Set(["speaker", "moderator", "vip"]);
const MATRIX_STAFF_ROLES = new Set(["staff", "vendor"]);

export async function buildMatrixSurfaceContext(eventId: string): Promise<CopilotSurfaceAdapterResult> {
  const snapshot = await getMatrix2Snapshot(eventId);
  const speakers = snapshot.people.filter((person) => MATRIX_SPEAKER_ROLES.has(person.role));
  const staff = snapshot.people.filter((person) => MATRIX_STAFF_ROLES.has(person.role));

  return {
    pageData: {
      rooms: snapshot.rooms,
      sessions: snapshot.sessions,
      people: snapshot.people,
      speakers,
      staff,
      dates: snapshot.dates,
    },
    availableCapabilities: getCapabilitiesForSurfaceMode("matrix", "do"),
  };
}
