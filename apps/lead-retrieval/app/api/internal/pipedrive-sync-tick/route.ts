import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeInternalWorkerRequest } from "@/lib/workflows/runner/internal-auth";
import { claimNextQueuedPipedriveSync } from "@/lib/integrations/pipedrive/queue";
import { syncLeadToPipedrive } from "@/lib/integrations/pipedrive/sync-service";

export const dynamic = "force-dynamic";

/**
 * Internal worker endpoint for the Pipedrive sync queue.
 *
 * Auth (both methods): `Authorization: Bearer ${WORKFLOW_TICK_SECRET}` for
 * in-process kicks, or `Authorization: Bearer ${CRON_SECRET}` for Vercel
 * Cron's automatic bearer — the same two secrets `workflow-tick` accepts, so
 * no new secret is required to run this in production.
 *
 * Per-tick budget: claims and processes up to PIPEDRIVE_TICK_BATCH_SIZE queued
 * rows, each in its own try/catch, so one lead's failure never stops the rest.
 * `syncLeadToPipedrive` itself never throws (it returns a failure result and
 * persists it), but the extra try/catch here is a last-resort guard.
 */
const PIPEDRIVE_TICK_BATCH_SIZE = 5;

async function handleTick(request: Request) {
  const authResult = authorizeInternalWorkerRequest(request.headers.get("authorization"), [
    process.env.WORKFLOW_TICK_SECRET,
    process.env.CRON_SECRET
  ]);

  if (!authResult.ok) {
    if (authResult.reason === "missing_secret_env") {
      return NextResponse.json({ error: "Worker disabled: no tick secret is configured." }, { status: 503 });
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

  const processed: Array<{ leadId: string; companyId: string; success: boolean }> = [];

  for (let i = 0; i < PIPEDRIVE_TICK_BATCH_SIZE; i += 1) {
    const claimed = await claimNextQueuedPipedriveSync({ supabase });
    if (!claimed) break;

    try {
      const result = await syncLeadToPipedrive({
        companyId: claimed.companyId,
        leadId: claimed.leadId,
        source: "auto"
      });
      processed.push({ leadId: claimed.leadId, companyId: claimed.companyId, success: result.success });
    } catch (error) {
      console.warn("[pipedrive-sync-tick] unexpected error processing claimed row", {
        rowId: claimed.id,
        message: error instanceof Error ? error.message : String(error)
      });
      processed.push({ leadId: claimed.leadId, companyId: claimed.companyId, success: false });
    }
  }

  return NextResponse.json({
    status: processed.length === 0 ? "idle" : "tick_completed",
    processed: processed.length,
    results: processed
  });
}

export async function GET(request: Request) {
  return handleTick(request);
}

export async function POST(request: Request) {
  return handleTick(request);
}
