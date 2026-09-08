import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMPOSE_DRAFT_BACKOFF_MS,
  COMPOSE_DRAFT_MAX_ATTEMPTS,
  buildComposeDraftStepOutput,
  classifyComposeDraftError,
  computeComposeDraftRetryBackoffMs,
  composeDraftErrorToResult,
  orderSignalsByIds,
  parseComposeCampaignDraftParams,
  resolveRecipientContextForLead,
  type LeadFactsForDraft
} from "../lib/workflows/step-handlers/compose-campaign-draft-pure";
import type { SelectedSignalForGeneration } from "../lib/campaigns/signal-prompt-composer";

const UUID_A = "11111111-1111-4111-9111-111111111111";
const UUID_B = "22222222-2222-4222-9222-222222222222";
const UUID_C = "33333333-3333-4333-9333-333333333333";

function makeSignal(id: string, name: string): SelectedSignalForGeneration {
  return {
    id,
    name,
    category: "CONTEXTUAL",
    defaultPromptText: `prompt for ${name}`,
    tone: [],
    visibility: "global",
    roleScope: null,
    templateScope: null
  };
}

describe("parseComposeCampaignDraftParams", () => {
  it("requires subjectTemplate", () => {
    const r = parseComposeCampaignDraftParams({ selectedSignalIds: [UUID_A] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.errorCode, "compose_draft_invalid_params");
  });

  it("requires selectedSignalIds to be an array", () => {
    const r = parseComposeCampaignDraftParams({
      subjectTemplate: "Hi {{first_name}}",
      selectedSignalIds: UUID_A as unknown as string[]
    });
    assert.equal(r.ok, false);
  });

  it("allows empty selectedSignalIds for enrichment-only grounding", () => {
    const r = parseComposeCampaignDraftParams({
      subjectTemplate: "Hi",
      selectedSignalIds: []
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value.selectedSignalIds, []);
  });

  it("rejects non-UUID entries", () => {
    const r = parseComposeCampaignDraftParams({
      subjectTemplate: "Hi",
      selectedSignalIds: [UUID_A, "not-a-uuid"]
    });
    assert.equal(r.ok, false);
  });

  it("deduplicates while preserving order", () => {
    const r = parseComposeCampaignDraftParams({
      subjectTemplate: "Hi",
      selectedSignalIds: [UUID_B, UUID_A, UUID_B, UUID_C, UUID_A]
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value.selectedSignalIds, [UUID_B, UUID_A, UUID_C]);
  });

  it("defaults templateName when not provided", () => {
    const r = parseComposeCampaignDraftParams({
      subjectTemplate: "Hi",
      selectedSignalIds: [UUID_A]
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.templateName, "Lead Intel");
  });
});

describe("orderSignalsByIds", () => {
  it("returns signals in exactly the order of selectedSignalIds (not DB order)", () => {
    const available = [makeSignal(UUID_C, "C"), makeSignal(UUID_A, "A"), makeSignal(UUID_B, "B")];
    const { ordered, missingSignalIds } = orderSignalsByIds([UUID_A, UUID_B, UUID_C], available);
    assert.deepEqual(
      ordered.map((s) => s.id),
      [UUID_A, UUID_B, UUID_C]
    );
    assert.deepEqual(missingSignalIds, []);
  });

  it("reports missing signal ids without dropping the rest", () => {
    const available = [makeSignal(UUID_A, "A")];
    const { ordered, missingSignalIds } = orderSignalsByIds([UUID_A, UUID_B], available);
    assert.deepEqual(
      ordered.map((s) => s.id),
      [UUID_A]
    );
    assert.deepEqual(missingSignalIds, [UUID_B]);
  });

  it("returns empty when no requested signals are available", () => {
    const { ordered, missingSignalIds } = orderSignalsByIds([UUID_A, UUID_B], []);
    assert.deepEqual(ordered, []);
    assert.deepEqual(missingSignalIds, [UUID_A, UUID_B]);
  });
});

describe("resolveRecipientContextForLead", () => {
  const baseLead: LeadFactsForDraft = {
    id: "lead-1",
    full_name: "Ada Lovelace",
    email: "ada@example.com",
    job_title: "Engineer",
    enriched_job_title: null,
    enriched_company_size: null,
    enriched_industry: null,
    enriched_company_domain: null,
    company_text: null,
    event_name: "Demo Conf",
    company_name: null
  };

  it("falls back to defaults when no enrichment info is present", () => {
    const ctx = resolveRecipientContextForLead({ lead: baseLead });
    assert.equal(ctx.firstName, "Ada");
    assert.equal(ctx.eventName, "Demo Conf");
    assert.equal(ctx.title, "Engineer");
    assert.equal(ctx.companyText, "your company");
    assert.equal(ctx.companySize, "company");
    assert.equal(ctx.industry, "industry");
  });

  it("prefers prior enrich_lead lead_summary over the lead row's enriched_* columns", () => {
    const ctx = resolveRecipientContextForLead({
      lead: {
        ...baseLead,
        enriched_job_title: "Senior Dev",
        enriched_company_size: "1-10",
        enriched_industry: "Aerospace",
        enriched_company_domain: "old.example.com"
      },
      priorEnrich: {
        lead_summary: {
          job_title: "Principal Engineer",
          company_text: "Babbage Engines",
          company_domain: "new.example.com",
          industry: "Computing",
          company_size: "11-50"
        }
      }
    });
    assert.equal(ctx.title, "Principal Engineer");
    assert.equal(ctx.companyText, "Babbage Engines");
    assert.equal(ctx.companyDomain, "new.example.com");
    assert.equal(ctx.industry, "Computing");
    assert.equal(ctx.companySize, "11-50");
  });

  it("ignores blank prior enrichment values and falls back to lead row", () => {
    const ctx = resolveRecipientContextForLead({
      lead: { ...baseLead, enriched_job_title: "VP Eng" },
      priorEnrich: { lead_summary: { job_title: "" } }
    });
    assert.equal(ctx.title, "VP Eng");
  });
});

describe("classifyComposeDraftError + retry policy", () => {
  it("classifies missing OPENAI_API_KEY as config (terminal)", () => {
    assert.equal(classifyComposeDraftError(new Error("OPENAI_API_KEY is missing")), "config");
  });

  it("classifies validation errors as terminal", () => {
    assert.equal(classifyComposeDraftError(new Error("compose_draft_invalid_params")), "validation");
    assert.equal(classifyComposeDraftError(new Error("Lead not found: abc")), "validation");
    assert.equal(classifyComposeDraftError(new Error("No usable signals")), "validation");
    assert.equal(
      classifyComposeDraftError(new Error("No conversation summary available for Conversation Brief Agent.")),
      "validation"
    );
  });

  it("classifies rate-limit and empty-completion as transient", () => {
    assert.equal(classifyComposeDraftError(new Error("Rate limit exceeded")), "transient");
    assert.equal(classifyComposeDraftError(new Error("OpenAI returned empty completion content")), "transient");
    assert.equal(classifyComposeDraftError(new Error("Model returned non-object JSON")), "transient");
    assert.equal(classifyComposeDraftError(new Error("Prompt leakage detected: foo")), "transient");
  });

  it("falls back to unknown for unrecognized errors (retry-eligible by runtime)", () => {
    assert.equal(classifyComposeDraftError(new Error("ECONNRESET")), "unknown");
  });

  it("schedules ascending backoff under the budget and null at/above the cap", () => {
    assert.equal(computeComposeDraftRetryBackoffMs(1), COMPOSE_DRAFT_BACKOFF_MS[0]);
    assert.equal(computeComposeDraftRetryBackoffMs(2), COMPOSE_DRAFT_BACKOFF_MS[1]);
    assert.equal(computeComposeDraftRetryBackoffMs(3), COMPOSE_DRAFT_BACKOFF_MS[2]);
    assert.equal(computeComposeDraftRetryBackoffMs(COMPOSE_DRAFT_MAX_ATTEMPTS), null);
  });

  it("composeDraftErrorToResult routes by classification", () => {
    const v = composeDraftErrorToResult(new Error("Lead not found"), 1);
    assert.equal(v.kind, "fail");
    if (v.kind === "fail") assert.equal(v.errorCode, "compose_draft_validation");

    const c = composeDraftErrorToResult(new Error("OPENAI_API_KEY is missing"), 1);
    assert.equal(c.kind, "fail");
    if (c.kind === "fail") assert.equal(c.errorCode, "compose_draft_no_provider");

    const t = composeDraftErrorToResult(new Error("Rate limit"), 1);
    assert.equal(t.kind, "retry");
    if (t.kind === "retry") {
      assert.equal(t.errorCode, "compose_draft_transient");
      assert.equal(t.retryAfterMs, COMPOSE_DRAFT_BACKOFF_MS[0]);
    }

    const max = composeDraftErrorToResult(new Error("Rate limit"), COMPOSE_DRAFT_MAX_ATTEMPTS);
    assert.equal(max.kind, "fail");
    if (max.kind === "fail") assert.equal(max.errorCode, "compose_draft_max_attempts");
  });
});

describe("buildComposeDraftStepOutput", () => {
  it("bounds subject/body preview length and shape", () => {
    const longSubject = "S".repeat(500);
    const longBody = "B".repeat(2000);
    const out = buildComposeDraftStepOutput({
      draftId: "draft-1",
      subjectPreview: longSubject,
      bodyPreview: longBody,
      model: "gpt-test",
      signalIdsUsed: [UUID_A],
      signalIdsMissing: [UUID_B]
    });

    assert.equal(out.outcome, "draft_pending_review");
    assert.equal(out.draft_id, "draft-1");
    assert.equal(out.model, "gpt-test");
    assert.deepEqual(out.signal_ids_used, [UUID_A]);
    assert.deepEqual(out.signal_ids_missing, [UUID_B]);
    assert.equal(String(out.subject_preview).length, 160);
    assert.equal(String(out.body_preview).length, 280);
  });

  it("never includes raw provider blobs", () => {
    const out = buildComposeDraftStepOutput({
      draftId: "draft-1",
      subjectPreview: "Hi",
      bodyPreview: "Body",
      model: "gpt-test",
      signalIdsUsed: [],
      signalIdsMissing: []
    });
    const keys = Object.keys(out);
    for (const banned of ["raw_provider_payload", "provider_payload", "openai_response"]) {
      assert.equal(keys.includes(banned), false);
    }
  });
});
