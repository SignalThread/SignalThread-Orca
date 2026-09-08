import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import { approveDraftAndResumeRun } from "@/lib/workflows/approval/draft-approval-core";
import { WORKFLOW_HANDLER_REGISTRY } from "@/lib/workflows/step-handlers";

/**
 * Approve a workflow-generated draft.
 *
 * Server-side enforcement (NOT UI-only):
 *   - Caller must have an exhibitor session (`exhibitor` or `exhibitor_admin`).
 *   - `generated_drafts.company_id` must match the caller's company id.
 *   - Draft must still be `pending` (409 otherwise).
 *
 * On success, the workflow run resumes:
 *   - The paused step run is marked `completed` (its `output_jsonb` is preserved).
 *   - If a next step exists, its `scheduled_at` is set to now; the run returns to
 *     `queued`. The cron worker picks it up on the next tick.
 *   - If no next step exists, the run is marked `completed`.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!isCompanyAccountAdminSession(sessionUser) && sessionUser.role !== "exhibitor_viewer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!sessionUser.company_id) {
      return NextResponse.json({ error: "No company assigned" }, { status: 400 });
    }

    const { draftId: rawDraftId } = await params;
    const draftId = rawDraftId.trim();
    if (!draftId) {
      return NextResponse.json({ error: "Missing draft id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const result = await approveDraftAndResumeRun({
      supabase,
      draftId,
      registry: WORKFLOW_HANDLER_REGISTRY,
      context: {
        reviewerUserId: sessionUser.id,
        reviewerCompanyId: sessionUser.company_id
      }
    });

    if (!result.ok) {
      // Map `forbidden` to 404 externally to avoid leaking existence to other companies.
      const externalStatus = result.error.code === "forbidden" ? 404 : result.error.status;
      const externalMessage =
        result.error.code === "forbidden" ? "Draft not found." : result.error.message;
      return NextResponse.json({ error: externalMessage, code: result.error.code }, { status: externalStatus });
    }

    return NextResponse.json({
      draft: {
        id: result.draft.id,
        approval_status: result.draft.approval_status,
        reviewed_by: result.draft.reviewed_by,
        reviewed_at: result.draft.reviewed_at
      },
      run: {
        id: result.draft.run_id,
        resumed: result.nextStepScheduled
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
