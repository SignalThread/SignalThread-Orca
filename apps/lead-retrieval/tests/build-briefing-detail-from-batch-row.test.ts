import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBriefingDetailFromBatchRow } from "../lib/import-wizard/build-briefing-detail-from-batch-row";

const baseSelections = {
  "0": "full_name",
  "1": "email",
  "2": "job_title",
  "3": "company_text",
} as const;

describe("buildBriefingDetailFromBatchRow", () => {
  it("uses batch row id as stable key and leaves leadId null", () => {
    const v = buildBriefingDetailFromBatchRow(
      "brief-1",
      "row-uuid",
      0,
      ["Pat", "pat@x.com", "Eng", "Acme"],
      ["Name", "Email", "Title", "Company"],
      { ...baseSelections },
      {},
      "pending"
    );
    assert.equal(v.batchRowId, "row-uuid");
    assert.equal(v.leadId, null);
    assert.equal(v.briefingRecordId, "brief-1");
    assert.match(v.headline, /Pat/);
  });

  it("hydrates enrichment and headline title when matched lead is provided", () => {
    const v = buildBriefingDetailFromBatchRow(
      "brief-1",
      "row-uuid",
      0,
      ["Pat", "pat@x.com", "Sales", "Acme"],
      ["Name", "Email", "Title", "Company"],
      { ...baseSelections },
      {},
      "pending",
      {
        leadId: "lead-1",
        enriched_job_title: "Chief Engineer",
        enriched_company_size: "201-500",
        enriched_industry: "Software",
        enriched_linkedin_url: "https://linkedin.com/in/pat",
        enriched_company_domain: "acme.com",
        enriched_seniority: "Manager",
      }
    );
    assert.equal(v.leadId, "lead-1");
    assert.ok(v.enrichment);
    assert.equal(v.enrichment?.jobTitleEnriched, "Chief Engineer");
    assert.equal(v.enrichment?.industry, "Software");
    assert.equal(v.enrichment?.domain, "acme.com");
    assert.match(v.headline, /Chief Engineer/);
    assert.ok(!v.headline.includes("Sales"), "CSV title should not headline when enriched title exists");
    assert.equal(v.companySnapshot.headcount, "201-500");
    assert.equal(v.companySnapshot.techSophistication, "Manager");
  });

  it("keeps CSV LinkedIn when present; otherwise uses enriched LinkedIn", () => {
    const withCsv = buildBriefingDetailFromBatchRow(
      "b1",
      "row-1",
      0,
      ["Pat", "pat@x.com", "Eng", "Acme", "https://linkedin.com/in/csv"],
      ["Name", "Email", "Title", "Company", "X"],
      { ...baseSelections, "4": "linkedin_url" },
      {},
      "pending",
      {
        leadId: "lead-1",
        enriched_job_title: null,
        enriched_company_size: null,
        enriched_industry: null,
        enriched_linkedin_url: "https://linkedin.com/in/enriched",
        enriched_company_domain: null,
        enriched_seniority: null,
      }
    );
    assert.equal(withCsv.identityExtras?.linkedinUrl, "https://linkedin.com/in/csv");

    const withoutCsv = buildBriefingDetailFromBatchRow(
      "b1",
      "row-1",
      0,
      ["Pat", "pat@x.com", "Eng", "Acme", ""],
      ["Name", "Email", "Title", "Company", "X"],
      { ...baseSelections, "4": "linkedin_url" },
      {},
      "pending",
      {
        leadId: "lead-1",
        enriched_job_title: null,
        enriched_company_size: null,
        enriched_industry: null,
        enriched_linkedin_url: "https://linkedin.com/in/enriched",
        enriched_company_domain: null,
        enriched_seniority: null,
      }
    );
    assert.equal(withoutCsv.identityExtras?.linkedinUrl, "https://linkedin.com/in/enriched");
  });
});
