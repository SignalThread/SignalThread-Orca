import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBatchByIdForCompany } from "@/lib/server/import-wizard/import-batch-service";
import type { BatchBriefingContextV1 } from "@/lib/import-wizard/batch-briefing-context";
import { parseBatchBriefingContext } from "@/lib/import-wizard/batch-briefing-context";
import {
  loadEventBriefingStrategy,
  loadEventBriefingStrategyForCompany
} from "@/lib/server/import-wizard/event-briefing-strategy-service";

/**
 * Raw batch JSON from `import_batches.briefing_context` (may include legacy strategy fields).
 */
async function loadBatchBriefingContextColumn(batchId: string, companyId: string): Promise<BatchBriefingContextV1> {
  const batch = await getBatchByIdForCompany(batchId, companyId);
  if (!batch) throw new Error("batch_not_found");

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("import_batches")
    .select("briefing_context")
    .eq("id", batchId)
    .eq("company_id", companyId)
    .maybeSingle();

  return parseBatchBriefingContext((data as Record<string, unknown> | null)?.briefing_context);
}

function trimOrEmpty(s: string | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

function pickStrategyField(
  eventVal: string | undefined,
  batchLegacy: string | undefined
): string {
  const a = trimOrEmpty(eventVal);
  if (a) return a;
  return trimOrEmpty(batchLegacy);
}

/**
 * Merged briefing context for a batch: event-level foundations + batch notes.
 * Legacy strategy still in `import_batches.briefing_context` is used when event strategy is empty.
 *
 * Pass `eventId` when available from a user-authenticated flow (already validated via
 * `company-event-access.ts`). When omitted, falls back to the company's primary event
 * lookup for internal/background callers that only have `companyId`.
 */
export async function loadBatchBriefingContext(
  batchId: string,
  companyId: string,
  eventId?: string | null
): Promise<BatchBriefingContextV1> {
  const batchRaw = await loadBatchBriefingContextColumn(batchId, companyId);
  const eventStrategy =
    eventId !== undefined
      ? await loadEventBriefingStrategy(eventId)
      : await loadEventBriefingStrategyForCompany(companyId);

  return {
    productFocus: pickStrategyField(eventStrategy.productFocus, batchRaw.productFocus),
    targetBuyerPersona: pickStrategyField(eventStrategy.targetBuyerPersona, batchRaw.targetBuyerPersona),
    eventGoal: pickStrategyField(eventStrategy.eventGoal, batchRaw.eventGoal),
    toneOfVoice: pickStrategyField(eventStrategy.toneOfVoice, batchRaw.toneOfVoice),
    guardrails: eventStrategy.guardrails,
    batchNotes: trimOrEmpty(batchRaw.batchNotes),
  };
}

/**
 * Persist batch notes on `import_batches.briefing_context` without clobbering other keys
 * (legacy strategy fields or future extensions).
 */
export async function saveBatchBriefingBatchNotes(batchId: string, companyId: string, batchNotes: string): Promise<void> {
  const batch = await getBatchByIdForCompany(batchId, companyId);
  if (!batch) throw new Error("batch_not_found");

  const supabase = await createSupabaseServerClient();
  const { data: row, error: fetchErr } = await supabase
    .from("import_batches")
    .select("briefing_context")
    .eq("id", batchId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);

  const raw = (row as { briefing_context?: unknown } | null)?.briefing_context;
  const prev =
    raw != null && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as Record<string, unknown>) } : {};
  prev.batchNotes = batchNotes;

  const { error } = await supabase
    .from("import_batches")
    .update({ briefing_context: prev } as never)
    .eq("id", batchId)
    .eq("company_id", companyId);

  if (error) {
    throw new Error(`batch_context_save_failed: ${error.message}`);
  }
}
