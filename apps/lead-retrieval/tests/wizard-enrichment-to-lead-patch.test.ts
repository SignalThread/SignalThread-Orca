import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeWizardEnrichmentIntoLeadInsert,
  parseWizardEnrichmentNormalizedJson
} from "../lib/leads/wizard-enrichment-to-lead-patch";

test("parseWizardEnrichmentNormalizedJson maps provider shape to leads patch", () => {
  const patch = parseWizardEnrichmentNormalizedJson({
    enriched_job_title: "VP Sales",
    enriched_seniority: "Executive",
    enriched_company_size: "200-499",
    enriched_industry: "Software",
    enriched_linkedin_url: "https://linkedin.com/in/example",
    enriched_company_domain: "example.com",
    enriched_score: 85
  });
  assert.ok(patch);
  assert.equal(patch!.job_title, "VP Sales");
  assert.equal(patch!.match_score, 85);
  assert.equal(patch!.company_domain, "example.com");
});

test("parseWizardEnrichmentNormalizedJson omits empty domain", () => {
  const patch = parseWizardEnrichmentNormalizedJson({
    enriched_job_title: "Eng",
    enriched_company_domain: "   "
  });
  assert.ok(patch);
  assert.equal(patch!.job_title, "Eng");
  assert.equal(patch!.company_domain, undefined);
});

test("mergeWizardEnrichmentIntoLeadInsert overlays wizard fields onto CSV base", () => {
  const base = {
    company_id: "c1",
    full_name: "Pat",
    linkedin_url: "https://linkedin.com/in/fromcsv",
    job_title: "Engineer"
  };
  const merged = mergeWizardEnrichmentIntoLeadInsert(base, {
    enriched_job_title: "Staff Engineer",
    enriched_industry: "AI",
    enriched_linkedin_url: "https://linkedin.com/in/provider"
  });
  assert.equal(merged.job_title, "Staff Engineer");
  assert.equal(merged.industry, "AI");
  assert.equal(merged.linkedin_url, "https://linkedin.com/in/provider");
  assert.equal(merged.full_name, "Pat");
});

test("mergeWizardEnrichmentIntoLeadInsert does not put match_score on insert payload", () => {
  const merged = mergeWizardEnrichmentIntoLeadInsert(
    { company_id: "c1", full_name: "x" },
    { enriched_score: 91, enriched_industry: "X" }
  );
  assert.equal((merged as Record<string, unknown>).match_score, undefined);
  assert.equal(merged.industry, "X");
});

test("mergeWizardEnrichmentIntoLeadInsert leaves base when wizard json null", () => {
  const base = { full_name: "x", linkedin_url: null };
  const merged = mergeWizardEnrichmentIntoLeadInsert(base, null);
  assert.deepEqual(merged, base);
});
