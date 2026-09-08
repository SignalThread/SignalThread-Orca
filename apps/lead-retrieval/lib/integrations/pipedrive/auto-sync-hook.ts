import "server-only";

import { getPipedriveConnectionStatus } from "@/lib/integrations/pipedrive/connection-service";
import { enqueuePipedriveSync } from "@/lib/integrations/pipedrive/queue";

/**
 * Best-effort hook fired from the shared lead-capture chokepoint
 * (`attemptLeadCapturedWorkflowEmit`) so every real capture path (mobile/admin
 * create, CSV import) gets it for free. Queues newly captured leads for
 * background Pipedrive sync when the company has Pipedrive connected —
 * mirrors this file's own "never blocks lead capture" contract: it never
 * throws, and it never touches historical leads (only ever called once, at
 * the moment a lead is captured).
 */
export async function attemptPipedriveAutoSyncEnqueue(input: { leadId: string; companyId: string }): Promise<void> {
  const leadId = String(input.leadId ?? "").trim();
  const companyId = String(input.companyId ?? "").trim();
  if (!leadId || !companyId) return;

  try {
    const connection = await getPipedriveConnectionStatus(companyId);
    if (!connection.connected) return;
    await enqueuePipedriveSync({ companyId, leadId, source: "auto" });
  } catch (error) {
    console.warn("[integrations/pipedrive] auto-sync enqueue failed (non-fatal)", {
      leadId,
      companyId,
      message: error instanceof Error ? error.message : "unknown"
    });
  }
}
