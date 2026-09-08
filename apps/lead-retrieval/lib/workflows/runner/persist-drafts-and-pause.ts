// NOTE: type-only `createAdminClient`. Safe to import from node test runners.

import type { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowHandlerDraft } from "../contracts/step-handler";
import type {
  GeneratedDraftRow,
  WorkflowRunRow,
  WorkflowStepRunRow
} from "../contracts/workflow-types";
import { buildGeneratedDraftInsertRows } from "./build-draft-rows";

/**
 * On a `kind: 'draft'` handler result:
 *   1. Insert one row per draft into `generated_drafts` with `approval_status='pending'`.
 *   2. Persist the handler's `output_jsonb` on the step run (small summary only — full
 *      content lives on `generated_drafts.content_jsonb`).
 *   3. Mark the step run as `awaiting_approval` (NOT `completed`).
 *   4. Transition the parent run to `awaiting_approval` and freeze `current_step_index`.
 *
 * Hard rules:
 *   - Next step is NOT scheduled. The approval API resumes scheduling.
 *   - Idempotent on `(run_id, step_run_id)`: if drafts already exist for this step run,
 *     we do not duplicate them. The DB has no unique constraint, so we guard at the
 *     application layer (re-claim of an already-paused step run is the trigger).
 *
 * Returns inserted draft ids for observability.
 */
export async function persistDraftsAndPauseRun(input: {
  supabase: ReturnType<typeof createAdminClient>;
  run: Pick<WorkflowRunRow, "id" | "company_id" | "lead_id" | "event_id">;
  stepRun: Pick<WorkflowStepRunRow, "id" | "step_index">;
  drafts: ReadonlyArray<WorkflowHandlerDraft>;
  /** Handler-supplied summary; `content` lives on generated_drafts.content_jsonb. */
  stepOutput: Record<string, unknown>;
  nowIso?: string;
}): Promise<{ insertedDraftIds: string[] }> {
  const supabase = input.supabase;
  const nowIso = input.nowIso ?? new Date().toISOString();

  // 1. Idempotency guard: skip insert if drafts already exist for this step run.
  const { data: existingDrafts, error: existingErr } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => Promise<{
          data: Array<Pick<GeneratedDraftRow, "id">> | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
  })
    .from("generated_drafts")
    .select("id")
    .eq("step_run_id", input.stepRun.id);

  if (existingErr) {
    console.warn("[workflows/runner] persistDraftsAndPauseRun existing lookup failed", {
      stepRunId: input.stepRun.id,
      message: existingErr.message
    });
  }

  let insertedDraftIds: string[] = [];
  if (!existingDrafts || existingDrafts.length === 0) {
    const rows = buildGeneratedDraftInsertRows({
      run: input.run,
      stepRun: input.stepRun,
      drafts: input.drafts
    });

    if (rows.length > 0) {
      const { data: inserted, error: insertErr } = await (supabase as unknown as {
        from: (t: string) => {
          insert: (rows: unknown) => {
            select: (cols: string) => Promise<{
              data: Array<Pick<GeneratedDraftRow, "id">> | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      })
        .from("generated_drafts")
        .insert(rows)
        .select("id");

      if (insertErr) {
        console.warn("[workflows/runner] persistDraftsAndPauseRun insert failed", {
          stepRunId: input.stepRun.id,
          message: insertErr.message
        });
        // Best-effort: still mark the step awaiting_approval so the run doesn't silently
        // advance. The draft row absence will surface in the approval UI / API.
      } else {
        insertedDraftIds = (inserted ?? []).map((d) => d.id);
      }
    }
  } else {
    insertedDraftIds = existingDrafts.map((d) => d.id);
  }

  // 2. Mark step run awaiting_approval + persist small step output.
  const { error: stepErr } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_step_runs")
    .update({
      status: "awaiting_approval",
      output_jsonb: input.stepOutput,
      error_text: null,
      error_code: null,
      updated_at: nowIso
    })
    .eq("id", input.stepRun.id);

  if (stepErr) {
    console.warn("[workflows/runner] persistDraftsAndPauseRun step update failed", {
      stepRunId: input.stepRun.id,
      message: stepErr.message
    });
  }

  // 3. Transition parent run to awaiting_approval (freeze current_step_index).
  const { error: runErr } = await (supabase as unknown as {
    from: (t: string) => {
      update: (patch: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
      };
    };
  })
    .from("workflow_runs")
    .update({
      status: "awaiting_approval",
      current_step_index: input.stepRun.step_index,
      updated_at: nowIso
    })
    .eq("id", input.run.id);

  if (runErr) {
    console.warn("[workflows/runner] persistDraftsAndPauseRun run update failed", {
      runId: input.run.id,
      message: runErr.message
    });
  }

  return { insertedDraftIds };
}
