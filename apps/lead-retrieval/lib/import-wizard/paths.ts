/**
 * Canonical URL for the pre-event import wizard (exhibitor surface).
 * Single place to update when routing changes.
 */
export const IMPORT_WIZARD_BASE_PATH = "/exhibitor/import/wizard";

/** Exhibitor home after exiting the wizard. */
export const EXHIBITOR_HOME_PATH = "/exhibitor/dashboard";

/** Leads Intelligence list — default destination after import. */
export const EXHIBITOR_LEADS_PATH = "/exhibitor/leads";

/** AI Briefings — unified hub: strategy + workspaces on {@link EXHIBITOR_BRIEFINGS_PATH}. */
export const EXHIBITOR_BRIEFINGS_PATH = "/exhibitor/briefings";

/** Same as {@link EXHIBITOR_BRIEFINGS_PATH} — strategy lives at the top of the hub. */
export const EXHIBITOR_BRIEFINGS_SETUP_PATH = EXHIBITOR_BRIEFINGS_PATH;

/** @deprecated Redirects to {@link EXHIBITOR_BRIEFINGS_PATH} — workspaces render below strategy on the hub. */
export const EXHIBITOR_BRIEFINGS_BATCHES_PATH = `${EXHIBITOR_BRIEFINGS_PATH}/batches`;

/**
 * Opens Leads Intelligence with a success banner and context for the import just completed.
 */
export function exhibitorLeadsAfterImportHref(opts: {
  batchId: string;
  importedCount: number;
  eventId: string;
}): string {
  const p = new URLSearchParams();
  p.set("importSuccess", "1");
  p.set("importBatchId", opts.batchId);
  p.set("imported", String(opts.importedCount));
  p.set("eventId", opts.eventId);
  return `${EXHIBITOR_LEADS_PATH}?${p.toString()}`;
}

export function importWizardPath(step?: number): string {
  if (step === undefined) return IMPORT_WIZARD_BASE_PATH;
  return `${IMPORT_WIZARD_BASE_PATH}?step=${step}`;
}

/** Batch flow: Prepare leads (command center). */
export function batchBriefingsPath(batchId: string): string {
  return `${EXHIBITOR_BRIEFINGS_PATH}/${encodeURIComponent(batchId)}`;
}

/**
 * @deprecated Legacy route — redirects to {@link EXHIBITOR_BRIEFINGS_SETUP_PATH}.
 */
export function batchBriefingsContextPath(batchId: string): string {
  return `/exhibitor/import/${encodeURIComponent(batchId)}/briefings/context`;
}

/** Batch flow: Review & approve generated briefs. */
export function batchBriefingsReviewPath(batchId: string): string {
  return `${EXHIBITOR_BRIEFINGS_PATH}/${encodeURIComponent(batchId)}/review`;
}

/**
 * When set to `"1"` on the batch review URL, the page keeps the row browser open after every brief
 * in the run is approved (the “all approved” completion card is suppressed).
 */
export const BRIEFING_REVIEW_BROWSE_APPROVED_PARAM = "browseApproved";

/** Same run as {@link batchBriefingsReviewPath}, with browse mode so approved briefs stay accessible. */
export function batchBriefingsReviewBrowseApprovedPath(batchId: string): string {
  return `${batchBriefingsReviewPath(batchId)}?${BRIEFING_REVIEW_BROWSE_APPROVED_PARAM}=1`;
}

/**
 * Briefing Setup (AI context + sources). Event-scoped; batch id ignored — kept for backward-compatible call sites.
 */
export function batchBriefingsKnowledgePath(_batchId: string): string {
  return EXHIBITOR_BRIEFINGS_SETUP_PATH;
}
