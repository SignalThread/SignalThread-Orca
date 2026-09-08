/**
 * Pure helpers for the `enrich_lead` step handler.
 *
 * Split from {@link ./enrich-lead.ts} so unit tests can import the logic without pulling
 * `@/lib/enrichment` (which transitively imports `next/headers` and is unusable from node
 * test runners).
 *
 * The production wrapper in `./enrich-lead.ts` re-exports these names so callers in app
 * code can keep importing from the single entry point.
 */

import type { WorkflowHandlerResult } from "../contracts/step-handler";

export const ENRICH_LEAD_STEP_TYPE = "enrich_lead";

/** Total attempts including the initial try; after this many failures the handler returns `fail`. */
export const ENRICH_LEAD_MAX_ATTEMPTS = 5;

/**
 * Backoff schedule applied AFTER attempt N has failed transiently. Indexed by
 * attempt_count - 1.
 *
 *   attempt 1 fails → next try in BACKOFF_MS[0] = 60s
 *   attempt 2 fails → next try in BACKOFF_MS[1] = 5m
 *   attempt 3 fails → next try in BACKOFF_MS[2] = 15m
 *   attempt 4 fails → next try in BACKOFF_MS[3] = 60m
 *   attempt 5 fails → fail
 */
export const ENRICH_LEAD_BACKOFF_MS: readonly number[] = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000
];

export type EnrichmentErrorClass = "transient" | "config" | "validation" | "unknown";

/**
 * Minimal shape from `EnrichedLeadRow` that the handler reads. Subset, declared here to
 * keep this module free of the `@/lib/enrichment` import chain.
 */
export type EnrichmentLeadFacts = {
  id: string;
  full_name: string;
  job_title: string | null;
  company_text: string | null;
  email: string | null;
  linkedin_url: string | null;
  company_domain: string | null;
  industry: string | null;
  company_size: string | null;
  seniority: string | null;
  updated_at: string;
};

export type EnrichmentStepInputResult = {
  outcome: "updated" | "no_match";
  lead: EnrichmentLeadFacts;
};

/**
 * Pure classifier over the error messages thrown by `lib/enrichment/index.ts::enrichLead`.
 * Unrecognized errors return `unknown`, which the runtime treats as retry-eligible.
 */
export function classifyEnrichmentError(error: unknown): EnrichmentErrorClass {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (!message) return "unknown";

  if (message.includes("no default enrichment provider")) return "config";
  if (message.includes("unsupported enrichment provider")) return "config";

  if (message.includes("lead not found for enrichment")) return "validation";
  if (message.includes("missing required identity fields")) return "validation";

  if (message.includes("failed to store enrichment payload")) return "transient";
  if (message.includes("failed to update lead after enrichment")) return "transient";
  if (message.includes("failed to load lead after enrichment")) return "transient";
  if (message.includes("enrichment failed")) return "transient";

  return "unknown";
}

/** Returns `null` when the attempt budget is exhausted. */
export function computeEnrichmentRetryBackoffMs(attemptCount: number): number | null {
  if (attemptCount < 1) return ENRICH_LEAD_BACKOFF_MS[0];
  if (attemptCount >= ENRICH_LEAD_MAX_ATTEMPTS) return null;
  const idx = Math.min(attemptCount - 1, ENRICH_LEAD_BACKOFF_MS.length - 1);
  return ENRICH_LEAD_BACKOFF_MS[idx];
}

/**
 * Dependency-injected core. Production passes the real `enrichLead`; tests pass a stub.
 * Returns a {@link WorkflowHandlerResult} for the runner to persist.
 */
export async function runEnrichLeadStep(args: {
  leadId: string;
  attemptCount: number;
  enrichLeadFn: (leadId: string) => Promise<EnrichmentStepInputResult>;
}): Promise<WorkflowHandlerResult> {
  const leadId = String(args.leadId ?? "").trim();
  if (!leadId) {
    return {
      kind: "fail",
      errorText: "Workflow run has no lead_id; cannot enrich.",
      errorCode: "enrichment_missing_lead_id"
    };
  }

  try {
    const result = await args.enrichLeadFn(leadId);
    return {
      kind: "ok",
      output: {
        outcome: result.outcome,
        enriched_fields: collectEnrichedFieldNames(result.lead),
        lead_summary: summarizeLeadForWorkflow(result.lead)
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown enrichment error";
    const classification = classifyEnrichmentError(error);

    if (classification === "validation") {
      return { kind: "fail", errorText: message, errorCode: "enrichment_invalid_lead" };
    }

    if (classification === "config") {
      return { kind: "fail", errorText: message, errorCode: "enrichment_no_provider" };
    }

    const backoff = computeEnrichmentRetryBackoffMs(args.attemptCount);
    if (backoff === null) {
      return {
        kind: "fail",
        errorText: `Enrichment failed after ${args.attemptCount} attempts: ${message}`,
        errorCode: "enrichment_max_attempts"
      };
    }

    return {
      kind: "retry",
      retryAfterMs: backoff,
      errorText: message,
      errorCode: classification === "transient" ? "enrichment_transient" : "enrichment_unknown"
    };
  }
}

function collectEnrichedFieldNames(lead: EnrichmentLeadFacts): string[] {
  const fields: Array<keyof EnrichmentLeadFacts> = [
    "job_title",
    "company_text",
    "email",
    "linkedin_url",
    "company_domain",
    "industry",
    "company_size",
    "seniority"
  ];
  return fields.filter((field) => {
    const value = lead[field];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function summarizeLeadForWorkflow(lead: EnrichmentLeadFacts) {
  return {
    id: lead.id,
    full_name: lead.full_name,
    job_title: lead.job_title,
    company_text: lead.company_text,
    company_domain: lead.company_domain,
    industry: lead.industry,
    company_size: lead.company_size,
    seniority: lead.seniority,
    email: lead.email,
    linkedin_url: lead.linkedin_url,
    updated_at: lead.updated_at
  };
}
