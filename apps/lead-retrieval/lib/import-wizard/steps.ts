/**
 * Canonical pre-event import workflow steps (order is fixed for product + analytics).
 * Index is 0-based for routing and shell state.
 *
 * Briefing (Brief Readiness / View Brief) lives outside the wizard at
 * `/exhibitor/briefings/[batchId]` — not as wizard steps.
 */

export const IMPORT_WIZARD_STEP_COUNT = 5 as const;

export type ImportWizardStepId =
  | "source_selection"
  | "field_mapping"
  | "enrichment"
  | "validation"
  | "import_complete";

export type ImportWizardStepDefinition = {
  id: ImportWizardStepId;
  /** Primary heading for the active step */
  title: string;
  /** Short label for the horizontal stepper */
  label: string;
};

export const IMPORT_WIZARD_STEPS: readonly ImportWizardStepDefinition[] = [
  { id: "source_selection", title: "Source Selection", label: "Source" },
  { id: "field_mapping", title: "Field Mapping", label: "Mapping" },
  { id: "enrichment", title: "Enrichment", label: "Enrichment" },
  { id: "validation", title: "Validation", label: "Validation" },
  { id: "import_complete", title: "Import leads", label: "Import" },
] as const;

export function getImportWizardStep(index: number): ImportWizardStepDefinition | undefined {
  return IMPORT_WIZARD_STEPS[index];
}

export function isImportWizardStepIndex(value: number): value is 0 | 1 | 2 | 3 | 4 {
  return Number.isInteger(value) && value >= 0 && value < IMPORT_WIZARD_STEPS.length;
}
