import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignFieldMappingSelection, deriveFieldMappingUi, type FieldMappingSourceRow } from "../lib/import-wizard/field-mapping-logic";
import {
  availableLeadImportOptionsForHeaders,
  suggestMappingsFromHeaders,
} from "../lib/import-wizard/field-mapping-suggest";
import { composeImportedLeadName, resolveImportedLeadName } from "../lib/import-wizard/lead-import-name";
import { rowHasUsableIdentityPath } from "../lib/import-wizard/import-batch-validation-derive";

function resolved(row: string[], selections: Record<string, string>) {
  return resolveImportedLeadName(row, selections);
}

describe("shared lead import name mapping", () => {
  it("preserves a full name from Google Sheets instead of dropping the first component", () => {
    const selections = suggestMappingsFromHeaders(["Full Name", "Email"]);
    assert.deepEqual(selections, { "0": "full_name", "1": "email" });
    assert.equal(resolved(["Sarah Meister", "sarah@example.com"], selections), "Sarah Meister");
  });

  it("composes independently mapped first and last names", () => {
    const selections = suggestMappingsFromHeaders(["First Name", "Last Name", "Company"]);
    assert.deepEqual(selections, { "0": "first_name", "1": "last_name", "2": "company_text" });
    assert.equal(resolved(["Sarah", "Meister", "SignalThread"], selections), "Sarah Meister");
    assert.equal(rowHasUsableIdentityPath(["Sarah", "Meister", "SignalThread"], selections), true);
  });

  it("preserves first-only and last-only imports without inventing another component", () => {
    assert.equal(resolved(["Sarah"], { "0": "first_name" }), "Sarah");
    assert.equal(resolved(["Meister"], { "0": "last_name" }), "Meister");
  });

  it("handles reordered columns and supported alternative header spellings", () => {
    const selections = suggestMappingsFromHeaders(["surname", "given name", "Email Address", "Company"]);
    assert.deepEqual(selections, { "0": "last_name", "1": "first_name", "2": "email", "3": "company_text" });
    assert.equal(resolved(["van der Meer", "Ana-María", "ana@example.com", "Acme"], selections), "Ana-María van der Meer");
  });

  it("does not auto-map ambiguous headers", () => {
    assert.equal(suggestMappingsFromHeaders(["Registrant", "Details"])["0"], "");
    assert.equal(suggestMappingsFromHeaders(["Registrant", "Details"])["1"], "");
  });

  it("uses schema-aware name options while retaining Full Name for manual contact-column mapping", () => {
    assert.deepEqual(
      availableLeadImportOptionsForHeaders(["First Name", "Last Name"]).slice(0, 3),
      ["full_name", "first_name", "last_name"]
    );
    assert.deepEqual(
      availableLeadImportOptionsForHeaders(["Contact Name"]).slice(0, 3),
      ["full_name", "email", "job_title"]
    );
  });

  it("allows a manual override and prevents accidental duplicate canonical targets", () => {
    const overridden = assignFieldMappingSelection({ "0": "", "1": "" }, "0", "last_name");
    assert.equal(overridden["0"], "last_name");
    const deduped = assignFieldMappingSelection({ "0": "email", "1": "" }, "1", "email");
    assert.deepEqual(deduped, { "0": "", "1": "email" });
  });

  it("trims whitespace and preserves Unicode, hyphenated, and multi-part names", () => {
    assert.equal(composeImportedLeadName("  Ana-María ", "  van   der   Meer  "), "Ana-María van der Meer");
    assert.equal(resolved(["  李 ", " 小龍  "], { "0": "first_name", "1": "last_name" }), "李 小龍");
    assert.equal(resolved(["", "  O’Connor  "], { "0": "first_name", "1": "last_name" }), "O’Connor");
  });

  it("keeps first and last targets distinct in mapping readiness", () => {
    const rows: FieldMappingSourceRow[] = [
      { id: "0", sourceColumn: "First Name" },
      { id: "1", sourceColumn: "Last Name" },
      { id: "2", sourceColumn: "Company" },
    ];
    const derived = deriveFieldMappingUi(
      { "0": "first_name", "1": "last_name", "2": "company_text" },
      rows
    );
    assert.equal(derived.continueAllowed, true);
    assert.equal(derived.duplicateCanonicalTargets.length, 0);
  });
});
