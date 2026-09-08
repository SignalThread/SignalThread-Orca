import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PipedriveSyncSource } from "@/lib/integrations/pipedrive/sync-core";

export type PipedriveQueueEnqueueResult = "enqueued" | "already_synced" | "already_syncing";

/**
 * Queues a lead for background sync. No-op (does not reset progress) when the
 * lead is already `synced` or currently `syncing`, so a bulk re-select never
 * duplicates in-flight or completed work. A `failed` lead is requeued with
 * `attempts` reset so the tick gives it a fresh run of automatic retries.
 */
export async function enqueuePipedriveSync(input: {
  companyId: string;
  leadId: string;
  source: PipedriveSyncSource;
  requestedByUserId?: string | null;
}): Promise<PipedriveQueueEnqueueResult> {
  const supabase = createAdminClient() as any;
  const existing = await supabase
    .from("pipedrive_lead_syncs")
    .select("id, status")
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message ?? "Failed to check the Pipedrive sync state.");

  if (existing.data?.status === "synced") return "already_synced";
  if (existing.data?.status === "syncing" || existing.data?.status === "queued") return "already_syncing";

  const nowIso = new Date().toISOString();
  if (existing.data) {
    const updated = await supabase
      .from("pipedrive_lead_syncs")
      .update({
        status: "queued",
        attempts: 0,
        last_error: null,
        next_attempt_at: nowIso,
        source: input.source,
        requested_by_user_id: input.requestedByUserId ?? null
      })
      .eq("id", existing.data.id);
    if (updated.error) throw new Error(updated.error.message ?? "Failed to queue the Pipedrive sync.");
    return "enqueued";
  }

  const inserted = await supabase.from("pipedrive_lead_syncs").insert({
    company_id: input.companyId,
    lead_id: input.leadId,
    status: "queued",
    attempts: 0,
    next_attempt_at: nowIso,
    source: input.source,
    requested_by_user_id: input.requestedByUserId ?? null
  });
  if (inserted.error) throw new Error(inserted.error.message ?? "Failed to queue the Pipedrive sync.");
  return "enqueued";
}

export type ClaimedPipedriveSync = { id: string; companyId: string; leadId: string };

async function claimRowInStatus(
  supabase: any,
  fromStatus: "queued" | "failed",
  nowIso: string
): Promise<ClaimedPipedriveSync | null> {
  const { data: candidate, error: pickError } = await supabase
    .from("pipedrive_lead_syncs")
    .select("id, company_id, lead_id")
    .eq("status", fromStatus)
    .not("next_attempt_at", "is", null)
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (pickError) {
    console.warn("[pipedrive/queue] claim pick failed", { message: pickError.message });
    return null;
  }
  if (!candidate) return null;

  const { data: claimed, error: updateError } = await supabase
    .from("pipedrive_lead_syncs")
    .update({ status: "syncing" })
    .eq("id", candidate.id)
    .eq("status", fromStatus)
    .select("id, company_id, lead_id")
    .maybeSingle();

  if (updateError) {
    console.warn("[pipedrive/queue] claim update failed", { rowId: candidate.id, message: updateError.message });
    return null;
  }
  return claimed ? { id: claimed.id, companyId: claimed.company_id, leadId: claimed.lead_id } : null;
}

/**
 * Claim one due `pipedrive_lead_syncs` row for the tick to process. Same
 * select-then-conditional-update claim style as `claimNextDueStepRun` (no
 * `FOR UPDATE SKIP LOCKED` via PostgREST; acceptable for the single-worker-
 * per-tick volume this queue runs at).
 *
 * Prefers freshly `queued` rows (bulk/auto/manual sends waiting for their
 * first attempt); when none are due, also picks up `failed` rows whose
 * capped exponential backoff (`next_attempt_at`, up to `MAX_PIPEDRIVE_AUTO_ATTEMPTS`
 * attempts) has elapsed, so a transient provider error self-heals without a
 * human clicking Retry. A row past the attempt cap has `next_attempt_at =
 * null` and is never picked up here again — it stays `failed` until a human
 * acts (detail-page Retry, or a bulk re-select, both of which reset attempts).
 */
export async function claimNextQueuedPipedriveSync(input: {
  supabase: ReturnType<typeof createAdminClient>;
  nowIso?: string;
}): Promise<ClaimedPipedriveSync | null> {
  const supabase = input.supabase as any;
  const nowIso = input.nowIso ?? new Date().toISOString();

  return (await claimRowInStatus(supabase, "queued", nowIso)) ?? (await claimRowInStatus(supabase, "failed", nowIso));
}
