import type { SignalRecord } from "@/components/signals/signal-types";
import type { WorkflowBuilderSignalOption } from "@/lib/exhibitor/workflows/workflow-builder-signal-types";

export function workflowBuilderSignalOptionsFromRecords(
  signals: readonly Pick<SignalRecord, "id" | "name" | "category" | "is_active">[]
): WorkflowBuilderSignalOption[] {
  return signals
    .filter((signal) => signal.is_active)
    .map((signal) => ({
      id: String(signal.id),
      name: String(signal.name ?? "Untitled Campaign Agent"),
      category: String(signal.category ?? "Custom")
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
