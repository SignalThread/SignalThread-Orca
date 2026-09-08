import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENRICH_LEAD_BACKOFF_MS,
  ENRICH_LEAD_MAX_ATTEMPTS,
  classifyEnrichmentError,
  computeEnrichmentRetryBackoffMs,
  runEnrichLeadStep,
  type EnrichmentLeadFacts,
  type EnrichmentStepInputResult
} from "../lib/workflows/step-handlers/enrich-lead-pure";

const LEAD_ID = "00000000-0000-0000-0000-000000000001";

function fakeEnrichedLead(overrides: Partial<EnrichmentLeadFacts> = {}): EnrichmentLeadFacts {
  return {
    id: LEAD_ID,
    full_name: "Ada Lovelace",
    job_title: "Engineer",
    company_text: "Analytical Engines Inc.",
    email: "ada@example.com",
    linkedin_url: "https://linkedin.com/in/ada",
    company_domain: "example.com",
    industry: "Software",
    company_size: "11-50",
    seniority: "senior",
    updated_at: "2026-05-13T01:00:00.000Z",
    ...overrides
  };
}

type EnrichLeadResult = EnrichmentStepInputResult;

describe("classifyEnrichmentError", () => {
  it("classifies configuration errors as terminal", () => {
    assert.equal(
      classifyEnrichmentError(new Error("No default enrichment provider is available.")),
      "config"
    );
    assert.equal(classifyEnrichmentError(new Error("Unsupported enrichment provider.")), "config");
  });

  it("classifies validation errors as terminal", () => {
    assert.equal(
      classifyEnrichmentError(new Error("Lead not found for enrichment: not_found")),
      "validation"
    );
    assert.equal(
      classifyEnrichmentError(
        new Error("Lead is missing required identity fields for enrichment.")
      ),
      "validation"
    );
  });

  it("classifies DB persistence errors as transient", () => {
    assert.equal(
      classifyEnrichmentError(new Error("Failed to store enrichment payload: db timeout")),
      "transient"
    );
    assert.equal(
      classifyEnrichmentError(new Error("Failed to update lead after enrichment: ETIMEDOUT")),
      "transient"
    );
    assert.equal(
      classifyEnrichmentError(new Error("Failed to load lead after enrichment: pgrst")),
      "transient"
    );
    assert.equal(classifyEnrichmentError(new Error("Enrichment failed: 502")), "transient");
  });

  it("classifies unknown errors as unknown (treated transient by runtime)", () => {
    assert.equal(classifyEnrichmentError(new Error("ECONNREFUSED")), "unknown");
    assert.equal(classifyEnrichmentError("plain string failure"), "unknown");
    assert.equal(classifyEnrichmentError(null), "unknown");
    assert.equal(classifyEnrichmentError(undefined), "unknown");
  });
});

describe("computeEnrichmentRetryBackoffMs", () => {
  it("returns ascending backoff for each attempt below the cap", () => {
    assert.equal(computeEnrichmentRetryBackoffMs(1), ENRICH_LEAD_BACKOFF_MS[0]);
    assert.equal(computeEnrichmentRetryBackoffMs(2), ENRICH_LEAD_BACKOFF_MS[1]);
    assert.equal(computeEnrichmentRetryBackoffMs(3), ENRICH_LEAD_BACKOFF_MS[2]);
    assert.equal(computeEnrichmentRetryBackoffMs(4), ENRICH_LEAD_BACKOFF_MS[3]);
  });

  it("returns null at or above the attempt budget", () => {
    assert.equal(computeEnrichmentRetryBackoffMs(ENRICH_LEAD_MAX_ATTEMPTS), null);
    assert.equal(computeEnrichmentRetryBackoffMs(ENRICH_LEAD_MAX_ATTEMPTS + 1), null);
  });

  it("guards against zero/negative attempt counts", () => {
    assert.equal(computeEnrichmentRetryBackoffMs(0), ENRICH_LEAD_BACKOFF_MS[0]);
    assert.equal(computeEnrichmentRetryBackoffMs(-1), ENRICH_LEAD_BACKOFF_MS[0]);
  });
});

describe("runEnrichLeadStep — success paths", () => {
  it("returns ok with outcome=updated and a summarized lead snapshot", async () => {
    const result = await runEnrichLeadStep({
      leadId: LEAD_ID,
      attemptCount: 1,
      enrichLeadFn: async () =>
        ({
          outcome: "updated",
          lead: fakeEnrichedLead()
        }) satisfies EnrichLeadResult
    });

    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.output.outcome, "updated");
    assert.ok(Array.isArray(result.output.enriched_fields));
    const fields = result.output.enriched_fields as string[];
    assert.deepEqual(
      [...fields].sort(),
      [
        "company_domain",
        "company_size",
        "company_text",
        "email",
        "industry",
        "job_title",
        "linkedin_url",
        "seniority"
      ]
    );
    const summary = result.output.lead_summary as { id: string; full_name: string };
    assert.equal(summary.id, LEAD_ID);
    assert.equal(summary.full_name, "Ada Lovelace");
  });

  it("returns ok with outcome=no_match (no retry, no fail)", async () => {
    const result = await runEnrichLeadStep({
      leadId: LEAD_ID,
      attemptCount: 1,
      enrichLeadFn: async () =>
        ({
          outcome: "no_match",
          lead: fakeEnrichedLead({
            job_title: null,
            company_text: null,
            email: null,
            linkedin_url: null,
            company_domain: null,
            industry: null,
            company_size: null,
            seniority: null
          })
        }) satisfies EnrichLeadResult
    });

    assert.equal(result.kind, "ok");
    if (result.kind !== "ok") return;
    assert.equal(result.output.outcome, "no_match");
    assert.deepEqual(result.output.enriched_fields, []);
  });
});

describe("runEnrichLeadStep — error paths", () => {
  it("fails terminally on missing lead id (no DB call)", async () => {
    let called = false;
    const result = await runEnrichLeadStep({
      leadId: "",
      attemptCount: 1,
      enrichLeadFn: async () => {
        called = true;
        return { outcome: "no_match", lead: fakeEnrichedLead() };
      }
    });
    assert.equal(called, false);
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") {
      assert.equal(result.errorCode, "enrichment_missing_lead_id");
    }
  });

  it("fails terminally on config error (no retry)", async () => {
    const result = await runEnrichLeadStep({
      leadId: LEAD_ID,
      attemptCount: 1,
      enrichLeadFn: async () => {
        throw new Error(
          "No default enrichment provider is available. Connect an enrichment provider..."
        );
      }
    });
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") {
      assert.equal(result.errorCode, "enrichment_no_provider");
    }
  });

  it("fails terminally on validation error (no retry)", async () => {
    const result = await runEnrichLeadStep({
      leadId: LEAD_ID,
      attemptCount: 1,
      enrichLeadFn: async () => {
        throw new Error("Lead not found for enrichment: not_found");
      }
    });
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") {
      assert.equal(result.errorCode, "enrichment_invalid_lead");
    }
  });

  it("retries with first backoff on transient DB error at attempt 1", async () => {
    const result = await runEnrichLeadStep({
      leadId: LEAD_ID,
      attemptCount: 1,
      enrichLeadFn: async () => {
        throw new Error("Failed to store enrichment payload: db deadlock");
      }
    });
    assert.equal(result.kind, "retry");
    if (result.kind === "retry") {
      assert.equal(result.retryAfterMs, ENRICH_LEAD_BACKOFF_MS[0]);
      assert.equal(result.errorCode, "enrichment_transient");
    }
  });

  it("retries with later backoff on subsequent transient attempts", async () => {
    const r2 = await runEnrichLeadStep({
      leadId: LEAD_ID,
      attemptCount: 2,
      enrichLeadFn: async () => {
        throw new Error("Failed to update lead after enrichment: pg timeout");
      }
    });
    assert.equal(r2.kind, "retry");
    if (r2.kind === "retry") assert.equal(r2.retryAfterMs, ENRICH_LEAD_BACKOFF_MS[1]);

    const r3 = await runEnrichLeadStep({
      leadId: LEAD_ID,
      attemptCount: 3,
      enrichLeadFn: async () => {
        throw new Error("Failed to update lead after enrichment: pg timeout");
      }
    });
    assert.equal(r3.kind, "retry");
    if (r3.kind === "retry") assert.equal(r3.retryAfterMs, ENRICH_LEAD_BACKOFF_MS[2]);
  });

  it("fails terminally once the attempt budget is exhausted", async () => {
    const result = await runEnrichLeadStep({
      leadId: LEAD_ID,
      attemptCount: ENRICH_LEAD_MAX_ATTEMPTS,
      enrichLeadFn: async () => {
        throw new Error("Failed to store enrichment payload: still failing");
      }
    });
    assert.equal(result.kind, "fail");
    if (result.kind === "fail") {
      assert.equal(result.errorCode, "enrichment_max_attempts");
    }
  });

  it("treats unknown thrown errors as retry-eligible (safety bias)", async () => {
    const result = await runEnrichLeadStep({
      leadId: LEAD_ID,
      attemptCount: 1,
      enrichLeadFn: async () => {
        throw new Error("ECONNREFUSED 1.2.3.4:443");
      }
    });
    assert.equal(result.kind, "retry");
    if (result.kind === "retry") {
      assert.equal(result.errorCode, "enrichment_unknown");
      assert.equal(result.retryAfterMs, ENRICH_LEAD_BACKOFF_MS[0]);
    }
  });
});
