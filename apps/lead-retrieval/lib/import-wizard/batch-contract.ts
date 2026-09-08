/**
 * Single mock batch contract for the import wizard. All step mocks should derive from here
 * so counts stay coherent until real APIs replace this module.
 *
 * Numbers are illustrative but internally consistent across steps.
 */

const TOTAL = 1240;

/** Outcome buckets after enrichment — sum equals total imported rows. */
const ENRICH = {
  fullSuccess: 1100,
  partialMatch: 85,
  failed: 30,
  noMatch: 25,
} as const;

/** Rows that passed automated validation checks vs rows with open issues — sum equals total. */
const VALID = {
  passedAutomatedChecks: 1175,
  withOpenIssues: 65,
} as const;

/** Approximate validation pass rate for display (rounded). */
const VALIDATION_RATE_PERCENT = Math.round((VALID.passedAutomatedChecks / TOTAL) * 100);

/** Rows with at least partial enrichment signal (success + partial). */
const ENRICHED_AT_LEAST_PARTIAL = ENRICH.fullSuccess + ENRICH.partialMatch;
const ENRICHMENT_COVERAGE_PERCENT = Math.round((ENRICHED_AT_LEAST_PARTIAL / TOTAL) * 100);

export const WIZARD_BATCH = {
  idNumeric: "204",
  /** Display in UI, e.g. eyebrow */
  displayLabel: "#204",
  totalImportedLeads: TOTAL,
  enrichment: {
    processedTotal: TOTAL,
    ...ENRICH,
    /** Share of rows with at least partial enrichment signal */
    coveragePercent: ENRICHMENT_COVERAGE_PERCENT,
  },
  validation: {
    passedAutomatedChecks: VALID.passedAutomatedChecks,
    withOpenIssues: VALID.withOpenIssues,
    validationRatePercent: VALIDATION_RATE_PERCENT,
    totalLeads: TOTAL,
  },
  /** Subset of the batch surfaced for human briefing review in the wizard (not all rows). */
  briefing: {
    humanReviewQueueSize: 4,
  },
  /** Pre-publish snapshot — aligned with batch; “needing review” is a publish-readiness subset, not the full validation issue count. */
  publish: {
    leadsReadyForEvent: TOTAL,
    briefingsReadyForMobile: TOTAL,
    assignedToReps: 1176,
    /** Rows still flagged for follow-up before the event (subset). */
    stillNeedingReview: 48,
  },
  postPublish: {
    leadsLive: TOTAL,
    briefingsSynced: TOTAL,
    assignedToReps: 1176,
  },
} as const;
