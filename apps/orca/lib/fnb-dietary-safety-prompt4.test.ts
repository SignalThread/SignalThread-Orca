import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Prompt 4 item editor exposes every structured operational and evidence field", async () => {
  const editor = await readFile("app/(shell)/events/[eventId]/fnb-catalog/_components/fnb-item-safety-editor.tsx", "utf8");
  for (const field of [
    "itemName", "description", "category", "publishedPriceCents", "negotiatedPriceCents", "currency",
    "pricingUnit", "unit", "minimumQuantity", "isCustom", "crossContactNotes", "preparationNotes",
    "modificationStatus", "modificationEvidenceSource", "serviceNotes", "vendorNotes", "internalNotes",
    "verificationStatus", "verificationSource", "verificationNotes",
  ]) assert.match(editor, new RegExp(`name=\\"${field}\\"`), field);
  assert.match(editor, /not medical guarantees/i);
  assert.match(editor, /never clears or hides the base item conflict/i);
});

test("Prompt 4 workspace combines configured needs and explains every compatibility state", async () => {
  const workspace = await readFile("app/(shell)/events/[eventId]/fnb-catalog/_components/fnb-catalog-workspace.tsx", "utf8");
  assert.match(workspace, /DIETARY_CODES\.slice\(0, 4\)/);
  assert.match(workspace, /ALLERGEN_CODES\.map/);
  assert.match(workspace, /assessMenuCompatibility/);
  assert.match(workspace, /explainCompatibilityReason/);
  assert.match(workspace, /Why .* excluded/);
  assert.match(workspace, /Missing Contains data never implies Free Of/);
  for (const outcome of ["VERIFIED_MATCH", "POSSIBLE_MATCH", "STALE_VERIFICATION", "CONFLICT", "INSUFFICIENT_INFORMATION"]) assert.match(workspace, new RegExp(outcome));
});

test("Prompt 4 migration is additive and adds distinct stale and modification verification", async () => {
  const [schema, migration, evidenceConstraint] = await Promise.all([
    readFile("prisma/schema.prisma", "utf8"),
    readFile("test-fixtures/legacy-orca-migrations/20260811120000_add_fnb_safety_semantics/migration.sql", "utf8"),
    readFile("test-fixtures/legacy-orca-migrations/20260811123000_enforce_fnb_modification_evidence/migration.sql", "utf8"),
  ]);
  assert.match(schema, /STALE_VERIFICATION/);
  assert.match(schema, /modificationStatus\s+FnbVerificationStatus\?/);
  assert.match(schema, /modificationEvidenceSource\s+String\?/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM)\b/im);
  assert.match(evidenceConstraint, /verified_modification_evidence_check/);
  assert.doesNotMatch(evidenceConstraint, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM)\b/im);
});
