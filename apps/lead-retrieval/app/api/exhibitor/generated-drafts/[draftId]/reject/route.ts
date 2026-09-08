import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import { rejectDraftAndCancelRun } from "@/lib/workflows/approval/draft-approval-core";

/**
 * Reject a workflow-generated draft.
 *
 * Server-side enforcement:
 *   - Caller must have an exhibitor session.
 *   - `generated_drafts.company_id` must match the caller's company id.
 *   - Draft must still be `pending` (409 otherwise).
 *
 * On success:
 *   - Draft is marked `rejected`.
 *   - The paused step run is marked `failed` with `error_code='draft_rejected'`.
 *   - The parent workflow run is CANCELLED (not just paused). This is the hard stop:
 *     no further steps in this run will ever execute. Any downstream send / sync /
 *     CRM step is therefore impossible by server-side state, not just by UI.
 *
 * Optional body: `{ reason?: string }` — recorded on `workflow_step_runs.error_text`.
 */
export async function POST(
  req: Request,
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

    let reason: string | undefined;
    try {
      const payload = (await req.json()) as { reason?: string } | null;
      if (payload && typeof payload.reason === "string") {
        reason = payload.reason;
      }
    } catch {
      // No body / not JSON — that's fine; reason defaults.
    }

    const supabase = createAdminClient();
    const result = await rejectDraftAndCancelRun({
      supabase,
      draftId,
      context: {
        reviewerUserId: sessionUser.id,
        reviewerCompanyId: sessionUser.company_id
      },
      reason
    });

    if (!result.ok) {
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
        cancelled: true
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
