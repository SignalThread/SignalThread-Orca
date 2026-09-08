import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveFieldMappingUi,
  isFieldMappingReady,
  fieldCoverageSummaryText,
  identityReadinessSummaryText,
  mappingSnapshotText,
  type FieldMappingSourceRow,
} from "../lib/import-wizard/field-mapping-logic";

const rows: FieldMappingSourceRow[] = [
  { id: "0", sourceColumn: "Name" },
  { id: "1", sourceColumn: "Email" },
  { id: "2", sourceColumn: "Title" },
  { id: "3", sourceColumn: "Company" },
];

describe("deriveFieldMappingUi — identity gating", () => {
  it("email mapped => Continue enabled even if Job Title missing", () => {
    const d = deriveFieldMappingUi({ "0": "", "1": "email", "2": "", "3": "" }, rows);
    assert.ok(d.continueAllowed);
    assert.ok(isFieldMappingReady(d));
    assert.ok(d.satisfiedIdentityPaths.includes("email"));
    assert.equal(d.rowStatusById["1"], "canonical");
    assert.equal(d.rowStatusById["0"], "unmapped");
  });

  it("linkedin_url mapped => Continue enabled even if Email missing", () => {
    const five = [...rows, { id: "4", sourceColumn: "LinkedIn" }];
    const d = deriveFieldMappingUi(
      { "0": "", "1": "", "2": "", "3": "", "4": "linkedin_url" },
      five
    );
    assert.ok(d.continueAllowed);
    assert.ok(isFieldMappingReady(d));
    assert.ok(d.satisfiedIdentityPaths.includes("linkedin_url"));
    assert.equal(d.rowStatusById["4"], "canonical");
  });

  it("full_name + company_text mapped => Continue enabled", () => {
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "", "2": "", "3": "company_text" },
      rows
    );
    assert.ok(d.continueAllowed);
    assert.ok(isFieldMappingReady(d));
    assert.ok(d.satisfiedIdentityPaths.includes("full_name_company"));
  });

  it("full_name alone => Continue disabled", () => {
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "", "2": "", "3": "" },
      rows
    );
    assert.ok(!d.continueAllowed);
    assert.ok(!isFieldMappingReady(d));
    assert.equal(d.satisfiedIdentityPaths.length, 0);
  });

  it("company_text alone => Continue disabled", () => {
    const d = deriveFieldMappingUi(
      { "0": "", "1": "", "2": "", "3": "company_text" },
      rows
    );
    assert.ok(!d.continueAllowed);
    assert.ok(!isFieldMappingReady(d));
  });

  it("no identity fields => Continue disabled", () => {
    const d = deriveFieldMappingUi(
      { "0": "", "1": "", "2": "", "3": "" },
      rows
    );
    assert.ok(!d.continueAllowed);
    assert.ok(!isFieldMappingReady(d));
    assert.equal(d.fieldCoveragePercent, 0);
  });

  it("email mapped, Job Title missing => Continue enabled with warning", () => {
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "", "3": "company_text" },
      rows
    );
    assert.ok(d.continueAllowed);
    assert.ok(d.warnings.some((w) => w.field === "job_title"));
  });

  it("all identity fields mapped => all paths satisfied", () => {
    const five = [...rows, { id: "4", sourceColumn: "LinkedIn" }];
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "job_title", "3": "company_text", "4": "linkedin_url" },
      five
    );
    assert.ok(d.continueAllowed);
    assert.ok(d.satisfiedIdentityPaths.includes("email"));
    assert.ok(d.satisfiedIdentityPaths.includes("linkedin_url"));
    assert.ok(d.satisfiedIdentityPaths.includes("full_name_company"));
    assert.equal(d.warnings.length, 0);
  });

  it("duplicate email mapping => conflict, identity not satisfied", () => {
    const d = deriveFieldMappingUi(
      { "0": "email", "1": "email", "2": "job_title", "3": "company_text" },
      rows
    );
    assert.equal(d.rowStatusById["0"], "conflict");
    assert.equal(d.rowStatusById["1"], "conflict");
    assert.ok(d.duplicateCanonicalTargets.includes("email"));
    assert.ok(!d.satisfiedIdentityPaths.includes("email"));
  });

  it("canonical mapped rows show canonical, unmapped show unmapped", () => {
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "", "3": "company_text" },
      rows
    );
    assert.equal(d.rowStatusById["0"], "canonical");
    assert.equal(d.rowStatusById["1"], "canonical");
    assert.equal(d.rowStatusById["2"], "unmapped");
    assert.equal(d.rowStatusById["3"], "canonical");
  });

  it("custom column mappings show custom status and do not affect identity gating", () => {
    const six = [
      ...rows,
      { id: "4", sourceColumn: "Extra A" },
      { id: "5", sourceColumn: "Extra B" },
    ];
    const d = deriveFieldMappingUi(
      {
        "0": "full_name",
        "1": "email",
        "2": "",
        "3": "company_text",
        "4": "custom:cf_notes_abc12345",
        "5": "custom:cf_region_xyz67890",
      },
      six
    );
    assert.ok(d.continueAllowed);
    assert.equal(d.rowStatusById["4"], "custom");
    assert.equal(d.rowStatusById["5"], "custom");
  });

  it("missing email is a warning when linkedin satisfies identity", () => {
    const five = [...rows, { id: "4", sourceColumn: "LinkedIn" }];
    const d = deriveFieldMappingUi(
      { "0": "", "1": "", "2": "", "3": "", "4": "linkedin_url" },
      five
    );
    assert.ok(d.continueAllowed);
    assert.ok(d.warnings.some((w) => w.field === "email"));
  });

  it("missing linkedin is a warning when email satisfies identity", () => {
    const d = deriveFieldMappingUi(
      { "0": "", "1": "email", "2": "", "3": "" },
      rows
    );
    assert.ok(d.warnings.some((w) => w.field === "linkedin_url"));
  });

  it("missing company is a warning when email satisfies identity", () => {
    const d = deriveFieldMappingUi(
      { "0": "", "1": "email", "2": "", "3": "" },
      rows
    );
    assert.ok(d.warnings.some((w) => w.field === "company_text"));
  });
});

describe("deriveFieldMappingUi — field coverage", () => {
  it("field coverage % = canonicalMappedCount / totalSourceColumns * 100", () => {
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "", "3": "company_text" },
      rows
    );
    assert.equal(d.canonicalMappedCount, 3);
    assert.equal(d.totalSourceColumns, 4);
    assert.equal(d.fieldCoveragePercent, 75);
  });

  it("custom-mapped columns do not count toward field coverage", () => {
    const five = [...rows, { id: "4", sourceColumn: "Notes" }];
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "", "3": "company_text", "4": "custom:cf_notes_abc" },
      five
    );
    assert.equal(d.canonicalMappedCount, 3);
    assert.equal(d.customMappedCount, 1);
    assert.equal(d.totalSourceColumns, 5);
    assert.equal(d.fieldCoveragePercent, 60);
  });

  it("conflict columns do not count toward field coverage", () => {
    const d = deriveFieldMappingUi(
      { "0": "email", "1": "email", "2": "", "3": "company_text" },
      rows
    );
    assert.equal(d.canonicalMappedCount, 1);
    assert.equal(d.fieldCoveragePercent, 25);
  });

  it("all unmapped => 0% field coverage", () => {
    const d = deriveFieldMappingUi({ "0": "", "1": "", "2": "", "3": "" }, rows);
    assert.equal(d.canonicalMappedCount, 0);
    assert.equal(d.fieldCoveragePercent, 0);
  });

  it("all canonical mapped => 100% field coverage", () => {
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "job_title", "3": "company_text" },
      rows
    );
    assert.equal(d.canonicalMappedCount, 4);
    assert.equal(d.fieldCoveragePercent, 100);
  });
});

describe("summary text functions", () => {
  it("fieldCoverageSummaryText reflects coverage and unmapped", () => {
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "", "3": "company_text" },
      rows
    );
    const text = fieldCoverageSummaryText(d);
    assert.ok(text.includes("3 of 4"));
    assert.ok(text.includes("1 unmapped"));
  });

  it("fieldCoverageSummaryText mentions custom fields when present", () => {
    const five = [...rows, { id: "4", sourceColumn: "Notes" }];
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "", "3": "company_text", "4": "custom:cf_notes_abc" },
      five
    );
    const text = fieldCoverageSummaryText(d);
    assert.ok(text.includes("custom"));
  });

  it("identityReadinessSummaryText shows blocking message when no identity mapped", () => {
    const d = deriveFieldMappingUi({ "0": "", "1": "", "2": "", "3": "" }, rows);
    const text = identityReadinessSummaryText(d);
    assert.ok(text.includes("No usable identity path"));
  });

  it("identityReadinessSummaryText reflects identity path and warnings", () => {
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "", "3": "company_text" },
      rows
    );
    const text = identityReadinessSummaryText(d);
    assert.ok(text.includes("Email"));
    assert.ok(text.includes("Full Name + Company"));
    assert.ok(text.includes("Job Title"));
  });

  it("mappingSnapshotText shows blocking message when no identity mapped", () => {
    const d = deriveFieldMappingUi({ "0": "", "1": "", "2": "", "3": "" }, rows);
    const text = mappingSnapshotText(d);
    assert.ok(text.includes("No identity path"));
  });

  it("mappingSnapshotText shows identity and canonical count", () => {
    const d = deriveFieldMappingUi(
      { "0": "full_name", "1": "email", "2": "", "3": "company_text" },
      rows
    );
    const text = mappingSnapshotText(d);
    assert.ok(text.includes("Email"));
    assert.ok(text.includes("3 canonical field(s)"));
  });
});
