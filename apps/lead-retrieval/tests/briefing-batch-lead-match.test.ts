import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectLeadRowByNormalizedEmail,
  type BriefingLeadEnrichmentRow,
} from "../lib/import-wizard/briefing-batch-lead-match";

function row(
  id: string,
  email: string,
  overrides: Partial<BriefingLeadEnrichmentRow> = {}
): BriefingLeadEnrichmentRow {
  return {
    id,
    email,
    enriched_job_title: null,
    enriched_company_size: null,
    enriched_industry: null,
    enriched_linkedin_url: null,
    enriched_company_domain: null,
    enriched_seniority: null,
    ...overrides,
  };
}

describe("selectLeadRowByNormalizedEmail", () => {
  it("returns the only row when normalized email matches", () => {
    const a = row("a", "Pat@Example.COM", { enriched_job_title: "VP" });
    const got = selectLeadRowByNormalizedEmail([a], "pat@example.com");
    assert.ok(got);
    assert.equal(got!.id, "a");
    assert.equal(got!.enriched_job_title, "VP");
  });

  it("returns null when no rows match", () => {
    assert.equal(selectLeadRowByNormalizedEmail([row("a", "other@x.com")], "pat@example.com"), null);
  });

  it("returns null when two rows share the same normalized email (ambiguous)", () => {
    const rows = [row("a", "pat@example.com"), row("b", "Pat@example.com")];
    assert.equal(selectLeadRowByNormalizedEmail(rows, "pat@example.com"), null);
  });

  it("returns null for invalid import email", () => {
    assert.equal(selectLeadRowByNormalizedEmail([row("a", "pat@example.com")], "not-an-email"), null);
  });

  it("returns null for empty email", () => {
    assert.equal(selectLeadRowByNormalizedEmail([row("a", "pat@example.com")], ""), null);
  });
});
