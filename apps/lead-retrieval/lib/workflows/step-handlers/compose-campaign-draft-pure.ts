/**
 * Pure helpers for the `compose_campaign_draft` step.
 *
 * Split from {@link ./compose-campaign-draft.ts} so unit tests can import the logic
 * without pulling `@/lib/campaigns/llm-draft-generator` (which transitively imports
 * `openai`) or `@/lib/supabase/server` (which imports `next/headers`).
 *
 * Responsibilities of this module:
 *   - Validate `params_jsonb` (selectedSignalIds, subjectTemplate, templateName).
 *   - Order signal definitions by the template author's `selectedSignalIds` array.
 *     This is the SINGLE place where ordering happens; the rest of the pipeline must
 *     preserve order.
 *   - Resolve a `PromptRecipientContext` from a lead row + the prior `enrich_lead` step
 *     output (when present).
 *   - Classify provider/LLM errors into `transient | validation | config | unknown`.
 *   - Compute retry backoff (mirror of `enrich_lead` schedule).
 *
 * This module does NOT call the LLM, does NOT touch the DB, and has no `server-only`
 * imports.
 */

import type {
  PromptRecipientContext,
  SelectedSignalForGeneration
} from "@/lib/campaigns/signal-prompt-composer";
import type { WorkflowHandlerResult } from "../contracts/step-handler";

export const COMPOSE_CAMPAIGN_DRAFT_STEP_TYPE = "compose_campaign_draft";

export const COMPOSE_DRAFT_MAX_ATTEMPTS = 4;

/**
 * Backoff after attempt N. Slightly shorter than enrich_lead because LLM transient
 * failures (rate limits, model 5xx) tend to clear faster, and we don't want drafts
 * to languish in the queue for an hour.
 */
export const COMPOSE_DRAFT_BACKOFF_MS: readonly number[] = [
  30_000,
  2 * 60_000,
  10 * 60_000
];

export type ComposeDraftErrorClass = "transient" | "validation" | "config" | "unknown";

/**
 * Required and optional parameters on `workflow_steps.params_jsonb` for this step.
 *
 * - `selectedSignalIds` (required array of UUID strings; may be empty):
 *     Ordered set of signal ids the author wants the LLM to weave in. Empty means the
 *     draft is grounded on lead + enrichment facts only. Order is preserved end-to-end.
 * - `subjectTemplate` (required, non-empty string):
 *     The template the LLM uses for the subject line. Same semantics as the existing
 *     `/api/campaigns/[id]/generate-draft` route (supports `{{first_name}}` etc.).
 * - `templateName` (optional, defaults to "Lead Intel"):
 *     Passed into the signal prompt composer for template-scoped visibility checks.
 * - `requiredInputs` (optional):
 *     Context sources the workflow author explicitly requires. Selected Campaign
 *     Agents are contributors by default, not a declaration that their source is
 *     required. Today `conversation_summary` is supported.
 * - `outputActionKind` (optional authoring label, defaults implicitly when absent):
 *     Classifies the terminal action for operators — ignored by {@link parseComposeCampaignDraftParams}.
 */
export type ComposeCampaignDraftParams = {
  selectedSignalIds: string[];
  subjectTemplate: string;
  templateName: string;
  requiredInputs: ComposeDraftRequiredInput[];
};

export const COMPOSE_DRAFT_REQUIRED_INPUTS = ["conversation_summary"] as const;
export type ComposeDraftRequiredInput = (typeof COMPOSE_DRAFT_REQUIRED_INPUTS)[number];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ComposeCampaignDraftParamsError = {
  errorCode: "compose_draft_invalid_params";
  errorText: string;
};

/**
 * Validate and normalize `params_jsonb` into a strict shape. Strips whitespace,
 * deduplicates signal ids while preserving order, rejects non-UUID entries.
 */
export function parseComposeCampaignDraftParams(
  raw: Record<string, unknown> | null | undefined
): { ok: true; value: ComposeCampaignDraftParams } | { ok: false; error: ComposeCampaignDraftParamsError } {
  const params = raw ?? {};

  const subjectRaw = params["subjectTemplate"];
  const subjectTemplate = typeof subjectRaw === "string" ? subjectRaw.trim() : "";
  if (!subjectTemplate) {
    return {
      ok: false,
      error: {
        errorCode: "compose_draft_invalid_params",
        errorText: "params_jsonb.subjectTemplate is required and must be a non-empty string."
      }
    };
  }

  const templateNameRaw = params["templateName"];
  const templateName =
    typeof templateNameRaw === "string" && templateNameRaw.trim().length > 0
      ? templateNameRaw.trim()
      : "Lead Intel";

  const idsRaw = params["selectedSignalIds"];
  if (!Array.isArray(idsRaw)) {
    return {
      ok: false,
      error: {
        errorCode: "compose_draft_invalid_params",
        errorText: "params_jsonb.selectedSignalIds must be an array of UUID strings."
      }
    };
  }

  const seen = new Set<string>();
  const orderedIds: string[] = [];
  for (const entry of idsRaw) {
    const trimmed = typeof entry === "string" ? entry.trim() : "";
    if (!trimmed) continue;
    if (!UUID_REGEX.test(trimmed)) {
      return {
        ok: false,
        error: {
          errorCode: "compose_draft_invalid_params",
          errorText: `params_jsonb.selectedSignalIds contains a non-UUID entry: ${entry}`
        }
      };
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    orderedIds.push(trimmed);
  }

  const requiredRaw = params["requiredInputs"];
  if (requiredRaw != null && !Array.isArray(requiredRaw)) {
    return {
      ok: false,
      error: {
        errorCode: "compose_draft_invalid_params",
        errorText: "params_jsonb.requiredInputs must be an array when provided."
      }
    };
  }
  const requiredInputs: ComposeDraftRequiredInput[] = [];
  for (const entry of requiredRaw ?? []) {
    const value = typeof entry === "string" ? entry.trim().toLowerCase() : "";
    if (!COMPOSE_DRAFT_REQUIRED_INPUTS.includes(value as ComposeDraftRequiredInput)) {
      return {
        ok: false,
        error: {
          errorCode: "compose_draft_invalid_params",
          errorText: `params_jsonb.requiredInputs contains an unsupported input: ${String(entry)}`
        }
      };
    }
    if (!requiredInputs.includes(value as ComposeDraftRequiredInput)) {
      requiredInputs.push(value as ComposeDraftRequiredInput);
    }
  }

  return { ok: true, value: { selectedSignalIds: orderedIds, subjectTemplate, templateName, requiredInputs } };
}

/**
 * Reorder `availableSignals` to match the order of `selectedSignalIds`. Drops any
 * signal id not present in `availableSignals` (caller decides whether that's a
 * validation error vs. a silent prune — we return both lists).
 */
export function orderSignalsByIds(
  selectedSignalIds: ReadonlyArray<string>,
  availableSignals: ReadonlyArray<SelectedSignalForGeneration>
): {
  ordered: SelectedSignalForGeneration[];
  missingSignalIds: string[];
} {
  const byId = new Map<string, SelectedSignalForGeneration>();
  for (const signal of availableSignals) {
    if (signal.id) byId.set(signal.id, signal);
  }

  const ordered: SelectedSignalForGeneration[] = [];
  const missing: string[] = [];
  for (const id of selectedSignalIds) {
    const match = byId.get(id);
    if (match) ordered.push(match);
    else missing.push(id);
  }

  return { ordered, missingSignalIds: missing };
}

/**
 * Subset of `leads` row + (optional) prior `enrich_lead` output the prompt composer
 * needs to ground the email. Mirrors the fields used by the existing
 * `/api/campaigns/[id]/generate-draft` route, but split out so it can be unit-tested.
 */
export type LeadFactsForDraft = {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  enriched_job_title: string | null;
  enriched_company_size: string | null;
  enriched_industry: string | null;
  enriched_company_domain: string | null;
  company_text: string | null;
  event_name: string | null;
  company_name: string | null;
};

/**
 * Output snapshot from a prior `enrich_lead` step's `output_jsonb`. We only read
 * `lead_summary` (the safe subset). Raw provider payloads MUST NOT be read or
 * forwarded here.
 */
export type PriorEnrichOutput = {
  lead_summary?: {
    job_title?: string | null;
    company_text?: string | null;
    company_domain?: string | null;
    industry?: string | null;
    company_size?: string | null;
  };
};

function firstNameFromFullName(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] || "there";
}

/**
 * Resolve a per-lead prompt context. When a prior `enrich_lead` step exists and produced
 * a `lead_summary`, those fields take precedence over the lead row's enriched_* columns
 * (they reflect the latest enrichment; the lead row may not yet have been refreshed
 * within the same run).
 */
export function resolveRecipientContextForLead(input: {
  lead: LeadFactsForDraft;
  priorEnrich?: PriorEnrichOutput | null;
}): PromptRecipientContext {
  const lead = input.lead;
  const enrichSummary = input.priorEnrich?.lead_summary ?? {};

  const firstName = firstNameFromFullName(lead.full_name);
  const leadName = lead.full_name.trim() || firstName;
  const companyText =
    (typeof enrichSummary.company_text === "string" && enrichSummary.company_text.trim()) ||
    lead.company_text?.trim() ||
    lead.enriched_company_domain?.trim() ||
    lead.company_name?.trim() ||
    "your company";
  const title =
    (typeof enrichSummary.job_title === "string" && enrichSummary.job_title.trim()) ||
    lead.enriched_job_title?.trim() ||
    lead.job_title?.trim() ||
    "your role";
  const companySize =
    (typeof enrichSummary.company_size === "string" && enrichSummary.company_size.trim()) ||
    lead.enriched_company_size?.trim() ||
    "company";
  const industry =
    (typeof enrichSummary.industry === "string" && enrichSummary.industry.trim()) ||
    lead.enriched_industry?.trim() ||
    "industry";
  const companyDomain =
    (typeof enrichSummary.company_domain === "string" && enrichSummary.company_domain.trim()) ||
    lead.enriched_company_domain?.trim() ||
    "";
  const eventName = lead.event_name?.trim() || "our event";

  return {
    firstName,
    fullName: lead.full_name.trim() || firstName,
    leadName,
    eventName,
    companyText,
    title,
    companySize,
    industry,
    companyDomain,
    leadCount: 1,
    isMultiLeadDraft: false
  };
}

/** Mirror of `enrich_lead` classifier; tuned for LLM/draft errors. */
export function classifyComposeDraftError(error: unknown): ComposeDraftErrorClass {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (!message) return "unknown";

  // Validation errors:
  if (message.includes("compose_draft_invalid_params")) return "validation";
  if (message.includes("lead not found")) return "validation";
  if (message.includes("no usable signals")) return "validation";
  if (message.includes("no conversation summary available")) return "validation";
  if (message.includes("missing signals")) return "validation";

  // Config errors (terminal — retrying won't help):
  if (message.includes("openai_api_key is missing")) return "config";
  if (message.includes("openai_api_key")) return "config";

  // Transient (LLM rate limit / 5xx / parse errors that may resolve):
  if (message.includes("rate limit")) return "transient";
  if (message.includes("rate_limit")) return "transient";
  if (message.includes("openai returned empty completion content")) return "transient";
  if (message.includes("model returned empty")) return "transient";
  if (message.includes("model returned non-object json")) return "transient";

  // Prompt-leakage is a content-quality failure; safer to retry once than to fail the
  // run on a transient LLM hiccup. The attempt budget caps total retries.
  if (message.includes("prompt leakage detected")) return "transient";
  if (message.includes("unresolved placeholders")) return "transient";

  return "unknown";
}

export function computeComposeDraftRetryBackoffMs(attemptCount: number): number | null {
  if (attemptCount < 1) return COMPOSE_DRAFT_BACKOFF_MS[0];
  if (attemptCount >= COMPOSE_DRAFT_MAX_ATTEMPTS) return null;
  const idx = Math.min(attemptCount - 1, COMPOSE_DRAFT_BACKOFF_MS.length - 1);
  return COMPOSE_DRAFT_BACKOFF_MS[idx];
}

/**
 * Routes a thrown error into the canonical `WorkflowHandlerResult` shapes. Mirrors the
 * shape used by `enrich_lead`.
 */
export function composeDraftErrorToResult(
  error: unknown,
  attemptCount: number
): WorkflowHandlerResult {
  const message = error instanceof Error ? error.message : "Unknown draft generation error";
  const classification = classifyComposeDraftError(error);

  if (classification === "validation") {
    return {
      kind: "fail",
      errorText: message,
      errorCode: "compose_draft_validation"
    };
  }
  if (classification === "config") {
    return {
      kind: "fail",
      errorText: message,
      errorCode: "compose_draft_no_provider"
    };
  }

  const backoff = computeComposeDraftRetryBackoffMs(attemptCount);
  if (backoff === null) {
    return {
      kind: "fail",
      errorText: `Draft generation failed after ${attemptCount} attempts: ${message}`,
      errorCode: "compose_draft_max_attempts"
    };
  }

  return {
    kind: "retry",
    retryAfterMs: backoff,
    errorText: message,
    errorCode: classification === "transient" ? "compose_draft_transient" : "compose_draft_unknown"
  };
}

/**
 * The bounded `output_jsonb` summary the runner writes onto the step run. Intentionally
 * small — full subject/body lives on `generated_drafts.content_jsonb`.
 */
export function buildComposeDraftStepOutput(input: {
  draftId: string | null;
  subjectPreview: string;
  bodyPreview: string;
  model: string;
  signalIdsUsed: ReadonlyArray<string>;
  signalIdsMissing: ReadonlyArray<string>;
  campaignId?: string | null;
  campaignRecipientId?: string | null;
  campaignMessageId?: string | null;
}): Record<string, unknown> {
  const safeSubject = input.subjectPreview.length > 160 ? input.subjectPreview.slice(0, 160) : input.subjectPreview;
  const safeBody = input.bodyPreview.length > 280 ? input.bodyPreview.slice(0, 280) : input.bodyPreview;
  return {
    outcome: input.campaignMessageId ? "campaign_draft_created" : "draft_pending_review",
    draft_id: input.draftId,
    campaign_id: input.campaignId ?? null,
    campaign_recipient_id: input.campaignRecipientId ?? null,
    campaign_message_id: input.campaignMessageId ?? null,
    subject_preview: safeSubject,
    body_preview: safeBody,
    model: input.model,
    signal_ids_used: [...input.signalIdsUsed],
    signal_ids_missing: [...input.signalIdsMissing]
  };
}
