/**
 * Enrichment mock — derives counts from `batch-contract.ts`.
 */
import { WIZARD_BATCH } from "@/lib/import-wizard/batch-contract";

export const MOCK_ENRICHMENT_LEAD_COUNT = WIZARD_BATCH.totalImportedLeads;

export type EnrichmentRowStatus = "success" | "partial" | "failed" | "no_match";

export type MockEnrichmentResultRow = {
  id: string;
  name: string;
  email: string;
  company: string;
  enrichedFields: string;
  status: EnrichmentRowStatus;
};

export const MOCK_ENRICHMENT_STATS = {
  fullSuccess: WIZARD_BATCH.enrichment.fullSuccess,
  partialMatch: WIZARD_BATCH.enrichment.partialMatch,
  failed: WIZARD_BATCH.enrichment.failed,
  noMatch: WIZARD_BATCH.enrichment.noMatch,
} as const;

export const MOCK_ENRICHMENT_COVERAGE_PERCENT = WIZARD_BATCH.enrichment.coveragePercent;

/** Sample table only — not the full batch. */
export const MOCK_ENRICHMENT_SAMPLE_ROW_COUNT = 4;

export const MOCK_ENRICHMENT_RESULT_ROWS: readonly MockEnrichmentResultRow[] = [
  {
    id: "r1",
    name: "Alexander Pierce",
    email: "a.pierce@techcorp.io",
    company: "TechCorp",
    enrichedFields: "Profile signals, company size, industry, job level",
    status: "success",
  },
  {
    id: "r2",
    name: "Sarah Jenkins",
    email: "s.jenkins@vortex.com",
    company: "Vortex Labs",
    enrichedFields: "Profile signals, company size",
    status: "partial",
  },
  {
    id: "r3",
    name: "Michael Chen",
    email: "m.chen@global.net",
    company: "Global Dynamics",
    enrichedFields: "—",
    status: "failed",
  },
  {
    id: "r4",
    name: "Jessica Taylor",
    email: "j.taylor@unknown.io",
    company: "—",
    enrichedFields: "—",
    status: "no_match",
  },
];
