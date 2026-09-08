/**
 * UI phases for Import Wizard → Enrichment (step 3). Real execution uses POST
 * `/api/exhibitor/import-wizard/enrichment/run` — no client-side stub polling.
 */
export type EnrichmentWizardPhase = "ready" | "starting" | "running" | "succeeded" | "failed";

export type EnrichmentPhase = EnrichmentWizardPhase;

/** Per-row enrichment outcome rendered in the results table. */
export type EnrichmentRowStatus = "success" | "partial" | "failed" | "no_match";
