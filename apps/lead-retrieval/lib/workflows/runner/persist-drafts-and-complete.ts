import type { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowHandlerDraft } from "../contracts/step-handler";
import type { WorkflowRunRow, WorkflowStepRunRow } from "../contracts/workflow-types";
import { buildGeneratedDraftInsertRows } from "./build-draft-rows";

export async function persistPromotedDrafts(input: {
  supabase: ReturnType<typeof createAdminClient>;
  run: Pick<WorkflowRunRow, "id" | "company_id" | "lead_id" | "event_id">;
  stepRun: Pick<WorkflowStepRunRow, "id">;
  drafts: ReadonlyArray<WorkflowHandlerDraft>;
  nowIso?: string;
}): Promise<void> {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const { data: existingRows, error: existingError } = await (input.supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => Promise<{
          data: Array<{ id: string }> | null;
          error: { message: string } | null;
        }>;
      };
    };
  })
    .from("generated_drafts")
    .select("id")
    .eq("step_run_id", input.stepRun.id);

  if (existingError) {
    console.warn("[workflows/runner] promoted draft lookup failed", {
      stepRunId: input.stepRun.id,
      message: existingError.message
    });
    return;
  }

  if ((existingRows ?? []).length > 0) return;

  const rows = buildGeneratedDraftInsertRows({
    run: input.run,
    stepRun: input.stepRun,
    drafts: input.drafts
  }).map((row) => ({
    ...row,
    approval_status: "approved",
    promoted_to_id: promotedMessageIdFromContent(row.content_jsonb),
    reviewed_by: null,
    reviewed_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso
  }));

  if (rows.length === 0) return;

  const { error } = await (input.supabase as unknown as {
    from: (t: string) => {
      insert: (rows: unknown) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from("generated_drafts")
    .insert(rows);

  if (error) {
    console.warn("[workflows/runner] promoted draft insert failed", {
      stepRunId: input.stepRun.id,
      message: error.message
    });
  }
}

function promotedMessageIdFromContent(content: Record<string, unknown>) {
  const raw = content.campaign_message_id;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}
