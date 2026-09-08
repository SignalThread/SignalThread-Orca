import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeInternalWorkerRequest } from "@/lib/workflows/runner/internal-auth";
import { claimNextDueStepRun } from "@/lib/workflows/runner/claim-next-step";
import { executeClaimedStepRun } from "@/lib/workflows/runner/run-step";
import { WORKFLOW_HANDLER_REGISTRY } from "@/lib/workflows/step-handlers";
import { runLeadWorkflowReconcilerForCron } from "@/lib/workflows/reconcile/lead-workflow-cron-reconciler";
import { reconcileStaleConversationProcessing } from "@/lib/conversations/reconcile-stale-processing";

export const dynamic = "force-dynamic";

/**
 * Internal worker endpoint.
 *
 * Auth (both methods):
 *   - `Authorization: Bearer ${WORKFLOW_TICK_SECRET}` for in-process kicks.
 *   - `Authorization: Bearer ${CRON_SECRET}` for Vercel Cron's automatic bearer.
 *
 * Methods:
 *   - GET  — used by Vercel Cron (vercel.json) every minute.
 *   - POST — used by the in-process kick fired from `emitLeadCaptured`.
 *
 * Per-tick budget:
 *   - Claims at most ONE queued step. Cron + in-process kick converge the queue without
 *     parallel ticks. (Will swap to a SQL `FOR UPDATE SKIP LOCKED` function in Phase 7 if
 *     volume warrants parallel ticks.)
 *
 * Phase 3 handlers registered: enrich_lead only. Any other step_type fails the step with
 * `error_code='unknown_step_type'` until later phases add more.
 */
async function handleTick(request: Request) {
  const authResult = authorizeInternalWorkerRequest(
    request.headers.get("authorization"),
    [process.env.WORKFLOW_TICK_SECRET, process.env.CRON_SECRET]
  );

  if (!authResult.ok) {
    if (authResult.reason === "missing_secret_env") {
      return NextResponse.json(
        { error: "Worker disabled: WORKFLOW_TICK_SECRET is not set." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : "createAdminClient failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const leadWorkflowReconciler = await runLeadWorkflowReconcilerForCron({
    requestUrl: request.url,
    supabase
  });
  const conversationProcessingReconciler = await reconcileStaleConversationProcessing({
    supabase
  });

  const claimed = await claimNextDueStepRun({ supabase });
  if (!claimed) {
    return NextResponse.json({
      status: "idle",
      leadWorkflowReconciler,
      conversationProcessingReconciler
    });
  }

  const result = await executeClaimedStepRun({
    supabase,
    registry: WORKFLOW_HANDLER_REGISTRY,
    claimed,
    handlerTimeoutMs: 20_000
  });

  return NextResponse.json({
    status: "tick_completed",
    stepRunId: claimed.id,
    stepIndex: claimed.step_index,
    stepKey: claimed.step_key,
    outcome: result.outcome,
    leadWorkflowReconciler,
    conversationProcessingReconciler
  });
}

export async function GET(request: Request) {
  return handleTick(request);
}

export async function POST(request: Request) {
  return handleTick(request);
}
