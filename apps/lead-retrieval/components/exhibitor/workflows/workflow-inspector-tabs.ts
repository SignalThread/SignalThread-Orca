import type { WorkflowCanvasStep } from "./workflow-builder-graph";

export type WorkflowInspectorTabSpec = {
  id: string;
  label: string;
};

export function inspectorTabSpecsForStep(step: WorkflowCanvasStep): WorkflowInspectorTabSpec[] {
  switch (step) {
    case "trigger":
      return [
        { id: "workflow", label: "Workflow" },
        { id: "trigger_detail", label: "Trigger" },
        { id: "history", label: "History" }
      ];
    case "enrich":
      return [
        { id: "providers", label: "Providers" },
        { id: "fields", label: "Fields" }
      ];
    case "signals":
      return [
        { id: "signals", label: "Campaign Agents" },
        { id: "priority", label: "Priority" },
        { id: "output", label: "Output" },
        { id: "history", label: "History" }
      ];
    case "compose":
      return [
        { id: "draft", label: "Draft" },
        { id: "inputs", label: "Inputs" },
        { id: "variables", label: "Variables" },
        { id: "history", label: "History" }
      ];
    case "crmFuture":
      return [{ id: "destination", label: "Destination" }];
  }
}

export function defaultInspectorTabForStep(step: WorkflowCanvasStep): string {
  return inspectorTabSpecsForStep(step)[0]!.id;
}
