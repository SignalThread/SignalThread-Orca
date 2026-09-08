/**
 * Types shared between the Workflows list server loader and the client view.
 *
 * Kept dependency-free (no `server-only`, no supabase types) so the client view can
 * import it without dragging the server data layer into the browser bundle.
 */

import type {
  WorkflowScope,
  WorkflowTriggerEvent
} from "@/lib/workflows/contracts/workflow-types";

/** Compact summary of one step inside a template, used in the list row "steps" cell. */
export type WorkflowTemplateStepSummary = {
  step_index: number;
  step_type: string;
  step_key: string;
  requires_approval: boolean;
};

/** One row in the Workflows list. */
export type WorkflowTemplateListRow = {
  id: string;
  name: string;
  description: string | null;
  trigger_event: WorkflowTriggerEvent;
  scope: WorkflowScope;
  event_id: string | null;
  is_enabled: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** Ordered by `step_index` ascending. */
  steps: WorkflowTemplateStepSummary[];
  /** Most recent `workflow_runs.created_at` for this template (any status). Null if never run. */
  last_run_at: string | null;
};
