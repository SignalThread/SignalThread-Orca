import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("mapping screen removes preview, tips, and duplicate snapshot cards", () => {
  const source = read("components/import-wizard/steps/field-mapping-step.tsx");

  assert.doesNotMatch(source, /Source data preview/);
  assert.doesNotMatch(source, /Mapping tips/);
  assert.doesNotMatch(source, /Mapping snapshot/);
  assert.doesNotMatch(source, /Field relationships/);
  assert.doesNotMatch(source, /Field coverage/);
});

test("mapping screen has a branded readiness band as its only summary surface", () => {
  const source = read("components/import-wizard/steps/field-mapping-step.tsx");

  assert.match(source, /data-testid="import-wizard-mapping-summary-band"/);
  assert.match(source, /bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700/);
  assert.match(source, /Import readiness/);
  assert.doesNotMatch(source, /data-testid="import-wizard-mapping-readiness"/);
  assert.doesNotMatch(source, /Mapping details/);
  assert.doesNotMatch(source, /Required identity coverage/);
  assert.doesNotMatch(source, /Needs attention/);
  assert.match(source, /data-testid="import-wizard-source-summary"/);
  assert.match(source, /Map your columns/);
  assert.match(source, /Match each source column to a Lead Retrieval field\./);
  assert.match(source, /Change source/);
});

test("mapping screen is single column after removing the details rail", () => {
  const source = read("components/import-wizard/steps/field-mapping-step.tsx");

  assert.doesNotMatch(source, /lg:grid-cols-\[minmax\(0,1fr\)_minmax/);
  assert.doesNotMatch(source, /<aside/);
});

test("mapping action is in the main content and still gates navigation to enrichment", () => {
  const step = read("components/import-wizard/steps/field-mapping-step.tsx");
  const flow = read("components/import-wizard/import-wizard-flow.tsx");

  assert.match(step, /Continue to Enrichment/);
  assert.match(step, /disabled=\{!canContinue\}/);
  assert.match(flow, /const goToEnrichmentStep = useCallback/);
  assert.match(flow, /if \(!fieldMappingReady\) return;/);
  assert.match(flow, /router\.push\(importWizardPath\(2\)\)/);
  assert.match(flow, /canContinue=\{fieldMappingReady\}/);
  assert.match(flow, /onContinue=\{goToEnrichmentStep\}/);
});

test("source step exposes continue near selected source instead of using the wizard footer", () => {
  const source = read("components/import-wizard/steps/source-selection-step.tsx");
  const flow = read("components/import-wizard/import-wizard-flow.tsx");

  assert.match(source, /Continue to Field Mapping/);
  assert.match(source, /disabled=\{!canContinue\}/);
  assert.match(flow, /displayStep === 0 \|\| displayStep === 1 \|\| displayStep === 2 \|\| displayStep === 3\s*\?\s*null/);
  assert.match(flow, /router\.push\(importWizardPath\(1\)\)/);
  assert.match(flow, /canContinue=\{csvImportReady\}/);
  assert.match(flow, /onContinue=\{goToFieldMappingStep\}/);
});

test("enrichment step exposes continue near results instead of using the wizard footer", () => {
  const step = read("components/import-wizard/steps/enrichment-step.tsx");
  const flow = read("components/import-wizard/import-wizard-flow.tsx");

  assert.match(step, /data-testid="import-wizard-enrichment-continue"/);
  assert.match(step, /Continue to Validation/);
  assert.match(step, /onClick=\{onContinue\}/);
  assert.match(step, /disabled=\{!canContinue\}/);
  assert.match(flow, /const goToValidationStep = useCallback/);
  assert.match(flow, /if \(!enrichmentCanContinue\) return;/);
  assert.match(flow, /router\.push\(importWizardPath\(3\)\)/);
  assert.match(flow, /displayStep === 0 \|\| displayStep === 1 \|\| displayStep === 2 \|\| displayStep === 3\s*\?\s*null/);
  assert.match(flow, /onBack=\{returnToFieldMappingStep\}/);
  assert.match(flow, /onContinue=\{goToValidationStep\}/);
});

test("mapping dropdown behavior remains wired to row selections", () => {
  const source = read("components/import-wizard/steps/field-mapping-step.tsx");

  assert.match(source, /<select/);
  assert.match(source, /onChange=\{\(e\) =>/);
  assert.match(source, /setRowValue\(row\.id, next\)/);
  assert.match(source, /onAddCustom=\{\(\) => handleAddCustom\(row\.id\)\}/);
});

test("validation step puts the final import action in the readiness section", () => {
  const source = read("components/import-wizard/steps/validation-step.tsx");

  assert.match(source, /data-testid="import-wizard-validation-readiness-section"/);
  assert.match(source, /data-testid="import-wizard-validation-import"/);
  assert.match(source, /onClick=\{onImport\}/);
  assert.match(source, /Import \$\{importCount\.toLocaleString\(\)\}/);
  assert.equal((source.match(/These leads are still ready to import/g) ?? []).length, 1);
  assert.doesNotMatch(source, /data-testid="import-wizard-validation-ready-banner"/);
  assert.doesNotMatch(source, /Continue to confirm and import/);
});

test("validation import publishes immediately and removes the bottom validation footer", () => {
  const flow = read("components/import-wizard/import-wizard-flow.tsx");

  assert.match(flow, /const handleValidationImport = useCallback/);
  assert.match(flow, /await handleImportLeads\(\)/);
  assert.match(flow, /router\.push\(importWizardPath\(4\)\)/);
  assert.match(flow, /displayStep === 0 \|\| displayStep === 1 \|\| displayStep === 2 \|\| displayStep === 3\s*\?\s*null/);
  assert.match(flow, /onImport=\{handleValidationImport\}/);
});
