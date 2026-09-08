import type { SessionUser } from "@/lib/auth/session";
import { getWorkflowSelectableSignalsForEvent } from "@/lib/data/signals";
import type { WorkflowBuilderSignalOption } from "@/lib/exhibitor/workflows/workflow-builder-signal-types";
import { workflowBuilderSignalOptionsFromRecords } from "@/lib/exhibitor/workflows/workflow-builder-signal-options";

export async function loadWorkflowBuilderSignalsForUser(
  sessionUser: SessionUser,
  options: { eventId?: string | null } = {}
): Promise<WorkflowBuilderSignalOption[]> {
  const eventId = String(options.eventId ?? "").trim() || null;
  if (!eventId) return [];

  const signals = await getWorkflowSelectableSignalsForEvent(sessionUser, { eventId });

  return workflowBuilderSignalOptionsFromRecords(signals);
}
