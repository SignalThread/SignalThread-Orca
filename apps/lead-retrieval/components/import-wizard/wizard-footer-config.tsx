import { ImportWizardFooter } from "@/components/import-wizard/import-wizard-footer";
import { EXHIBITOR_HOME_PATH, importWizardPath } from "@/lib/import-wizard/paths";
import { IMPORT_WIZARD_STEPS } from "@/lib/import-wizard/steps";
import type { EnrichmentPhase } from "@/components/import-wizard/steps/enrichment-step";
import type { PublishPhase } from "@/components/import-wizard/steps/publish-step";

export type WizardFooterContext = {
  displayStep: number;
  /** Step 0: spreadsheet upload selected and a supported file is chosen for mapping. */
  csvImportReady: boolean;
  /** Step 1: all required canonical targets mapped once (derived from mapping state). */
  fieldMappingReady: boolean;
  /** Step 3 (Validation): must-fix rows cleared (server-derived; duplicates do not block). */
  validationContinueAllowed: boolean;
  /** Step 3: total importable rows when validation allows continue — for count-aware primary CTA. */
  validationImportableRowCount: number | null;
  enrichmentPhase: EnrichmentPhase;
  /** Step 2: enrichment succeeded for the current batch `data_revision` (not a prior run). */
  enrichmentCanContinue: boolean;
  /** Step 4: import blocked (e.g. no rows or validation must-fix) from publish-readiness. */
  importBlocked: boolean;
  publishPhase: PublishPhase;
  onImport: () => void;
};

/**
 * Centralizes footer branching for the import wizard so ImportWizardFlow stays readable
 * and backend wiring can swap this for data-driven rules later.
 */
export function renderWizardFooter(ctx: WizardFooterContext) {
  const {
    displayStep,
    csvImportReady,
    fieldMappingReady,
    validationContinueAllowed,
    validationImportableRowCount,
    enrichmentPhase,
    enrichmentCanContinue,
    importBlocked,
    publishPhase,
    onImport,
  } = ctx;

  if (displayStep === 0) {
    const canContinueFromSource = csvImportReady;
    if (!canContinueFromSource) {
      return (
        <ImportWizardFooter
          backHref={EXHIBITOR_HOME_PATH}
          continueDisabled
          continueLabel={`Continue to ${IMPORT_WIZARD_STEPS[1]!.title}`}
        />
      );
    }
    return (
      <ImportWizardFooter
        backHref={EXHIBITOR_HOME_PATH}
        continueHref={importWizardPath(1)}
        continueLabel={`Continue to ${IMPORT_WIZARD_STEPS[1]!.title}`}
      />
    );
  }

  if (displayStep === 1) {
    if (!fieldMappingReady) {
      return (
        <ImportWizardFooter
          backHref={importWizardPath(0)}
          continueDisabled
          continueLabel={`Continue to ${IMPORT_WIZARD_STEPS[2]!.title}`}
        />
      );
    }
    return (
      <ImportWizardFooter
        backHref={importWizardPath(0)}
        continueHref={importWizardPath(2)}
        continueLabel={`Continue to ${IMPORT_WIZARD_STEPS[2]!.title}`}
      />
    );
  }

  if (displayStep === 2) {
    if (enrichmentPhase === "succeeded" && enrichmentCanContinue) {
      return (
        <ImportWizardFooter
          backHref={importWizardPath(1)}
          continueHref={importWizardPath(3)}
          continueLabel={`Continue to ${IMPORT_WIZARD_STEPS[3]!.title}`}
        />
      );
    }
    return (
      <ImportWizardFooter
        backHref={importWizardPath(1)}
        continueDisabled
        continueLabel={`Continue to ${IMPORT_WIZARD_STEPS[3]!.title}`}
      />
    );
  }

  if (displayStep === 3) {
    const blockedLabel = `Continue to ${IMPORT_WIZARD_STEPS[4]!.title}`;
    const readyLabel =
      validationContinueAllowed &&
      validationImportableRowCount != null &&
      validationImportableRowCount > 0
        ? `Import ${validationImportableRowCount} ${validationImportableRowCount === 1 ? "lead" : "leads"}`
        : blockedLabel;
    if (!validationContinueAllowed) {
      return (
        <ImportWizardFooter
          backHref={importWizardPath(2)}
          continueDisabled
          continueLabel={blockedLabel}
        />
      );
    }
    return (
      <ImportWizardFooter
        backHref={importWizardPath(2)}
        continueHref={importWizardPath(4)}
        continueLabel={readyLabel}
      />
    );
  }

  if (displayStep === 4) {
    if (publishPhase === "published") {
      return (
        <ImportWizardFooter
          backHref={importWizardPath(0)}
          backLabel="Import another batch"
          continueHref={EXHIBITOR_HOME_PATH}
          continueLabel="Back to home"
          continueTone="quiet"
          presentation="minimal"
        />
      );
    }
    if (publishPhase === "publishing") {
      return (
        <ImportWizardFooter backHref={importWizardPath(3)} continueDisabled continueLabel="Importing…" />
      );
    }
    if (importBlocked) {
      return (
        <ImportWizardFooter backHref={importWizardPath(3)} continueDisabled continueLabel="Import leads" />
      );
    }
    return (
      <ImportWizardFooter backHref={importWizardPath(3)} onContinue={onImport} continueLabel="Import leads" />
    );
  }

  return (
    <ImportWizardFooter
      backHref={EXHIBITOR_HOME_PATH}
      continueDisabled
      continueLabel="Continue"
    />
  );
}
