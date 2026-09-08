/**
 * `enrich_lead` workflow step — production handler.
 *
 * Thin wrapper around the existing `lib/enrichment/index.ts::enrichLead(leadId)` that
 * routes its result/throws into a {@link WorkflowHandlerResult}. The actual logic lives
 * in {@link ./enrich-lead-pure.ts} (dependency-injected, importable in node tests).
 *
 * - Reads `lead_id` from the run row.
 * - Wraps `enrichLead` exactly as-is. No changes to enrichment architecture.
 * - Persists handler output (outcome + enriched fields + lead summary) into
 *   `workflow_step_runs.output_jsonb` (the runner does the actual DB write).
 * - Retries provider/network failures with backoff; fails validation/config errors
 *   terminally.
 * - Does not auto-send anything. Does not modify campaign/signals/webhook behavior.
 */

import type {
  WorkflowHandler,
  WorkflowHandlerContext,
  WorkflowHandlerResult
} from "../contracts/step-handler";
import { enrichLead } from "@/lib/enrichment";
import {
  runEnrichLeadStep,
  ENRICH_LEAD_STEP_TYPE,
  type EnrichmentStepInputResult
} from "./enrich-lead-pure";

export {
  ENRICH_LEAD_STEP_TYPE,
  ENRICH_LEAD_MAX_ATTEMPTS,
  ENRICH_LEAD_BACKOFF_MS,
  classifyEnrichmentError,
  computeEnrichmentRetryBackoffMs,
  runEnrichLeadStep,
  type EnrichmentErrorClass,
  type EnrichmentLeadFacts,
  type EnrichmentStepInputResult
} from "./enrich-lead-pure";

export const enrichLeadStepHandler: WorkflowHandler = {
  stepType: ENRICH_LEAD_STEP_TYPE,
  displayName: "Enrich lead",
  defaultTimeoutMs: 20_000,
  async run(ctx: WorkflowHandlerContext): Promise<WorkflowHandlerResult> {
    return runEnrichLeadStep({
      leadId: ctx.run.lead_id,
      attemptCount: ctx.stepRun.attempt_count,
      enrichLeadFn: async (leadId): Promise<EnrichmentStepInputResult> => {
        const result = await enrichLead(leadId);
        // `EnrichedLeadRow` is a superset of `EnrichmentLeadFacts`; structural cast is safe.
        return { outcome: result.outcome, lead: result.lead as unknown as EnrichmentStepInputResult["lead"] };
      }
    });
  }
};
