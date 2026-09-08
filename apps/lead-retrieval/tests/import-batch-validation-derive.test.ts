import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveImportBatchValidation,
  isLeadImportEmailFormatValid,
  normalizeEmailForDuplicateKey,
  rowHasUsableIdentityPath,
} from "../lib/import-wizard/import-batch-validation-derive";
import { isImportLinkedInUrlFormatValid } from "../lib/import-wizard/linkedin-import-url";

const headers4 = ["name", "email", "title", "co"];

function sel4(full_name: number, email: number, job_title: number, company_text: number): Record<string, string> {
  const out: Record<string, string> = {};
  out[String(full_name)] = "full_name";
  out[String(email)] = "email";
  out[String(job_title)] = "job_title";
  out[String(company_text)] = "company_text";
  return out;
}

describe("rowHasUsableIdentityPath", () => {
  it("accepts valid email only", () => {
    const row = ["", "a@b.co", "", ""];
    assert.equal(rowHasUsableIdentityPath(row, sel4(0, 1, 2, 3)), true);
  });

  it("accepts full_name + company_text without email", () => {
    const row = ["Pat Lee", "", "", "Acme"];
    assert.equal(rowHasUsableIdentityPath(row, sel4(0, 1, 2, 3)), true);
  });

  it("accepts First Name + Last Name + Company as the canonical name identity path", () => {
    const row = ["Pat", "Lee", "Acme"];
    assert.equal(
      rowHasUsableIdentityPath(row, { "0": "first_name", "1": "last_name", "2": "company_text" }),
      true
    );
  });

  it("accepts linkedin_url only when mapped", () => {
    const wide = [...headers4, "li"];
    const s = { ...sel4(0, 1, 2, 3), "4": "linkedin_url" };
    const row = ["", "", "", "", "https://www.linkedin.com/in/someone"];
    assert.equal(rowHasUsableIdentityPath(row, s), true);
  });

  it("rejects when no identity path", () => {
    const row = ["", "", "", ""];
    assert.equal(rowHasUsableIdentityPath(row, sel4(0, 1, 2, 3)), false);
  });

  it("rejects a Last Name-only row with company", () => {
    assert.equal(
      rowHasUsableIdentityPath(["Meister", "Acme"], { "0": "last_name", "1": "company_text" }),
      false
    );
  });

  it("rejects a First Name-only row with company", () => {
    assert.equal(
      rowHasUsableIdentityPath(["Sarah", "Acme"], { "0": "first_name", "1": "company_text" }),
      false
    );
  });
});

describe("deriveImportBatchValidation", () => {
  it("email-only rows can proceed (no job title / company required for blocking)", () => {
    const staged = [["", "only@x.com", "", ""]];
    const r = deriveImportBatchValidation({
      csv_headers: headers4,
      selections: sel4(0, 1, 2, 3),
      staged_rows: staged,
    });
    assert.equal(r.continueAllowed, true);
    assert.equal(r.rowsWithMustFix, 0);
    const missJob = r.issues.find((i) => i.kind === "missing_job_title");
    assert.ok(missJob);
    assert.equal(missJob!.affectedRowCount, 1);
    assert.equal(missJob!.severity, "review_recommended");
  });

  it("linkedin_url-only rows can proceed", () => {
    const wide = [...headers4, "li"];
    const staged = [["", "", "", "", "https://www.linkedin.com/in/x"]];
    const r = deriveImportBatchValidation({
      csv_headers: wide,
      selections: { ...sel4(0, 1, 2, 3), "4": "linkedin_url" },
      staged_rows: staged,
    });
    assert.equal(r.continueAllowed, true);
    assert.equal(r.rowsWithMustFix, 0);
  });

  it("full_name + company_text can proceed without email or linkedin", () => {
    const staged = [["Pat Lee", "", "", "Acme"]];
    const r = deriveImportBatchValidation({
      csv_headers: headers4,
      selections: sel4(0, 1, 2, 3),
      staged_rows: staged,
    });
    assert.equal(r.continueAllowed, true);
  });

  it("blocks malformed email and surname-only rows, including blank LinkedIn", () => {
    const r = deriveImportBatchValidation({
      csv_headers: ["Last Name", "Email", "LinkedIn", "Company"],
      selections: { "0": "last_name", "1": "email", "2": "linkedin_url", "3": "company_text" },
      staged_rows: [["Meister", "not-an-email", " ", "Acme"]],
    });
    assert.equal(r.continueAllowed, false);
    assert.equal(r.rowsWithMustFix, 1);
  });

  it("calculates mixed ready and blocking rows from the same mapped semantics", () => {
    const r = deriveImportBatchValidation({
      csv_headers: ["First", "Last", "Company", "Email"],
      selections: { "0": "first_name", "1": "last_name", "2": "company_text", "3": "email" },
      staged_rows: [
        ["Sarah", "Meister", "Acme", ""],
        ["", "Adams", "Acme", ""],
        ["", "", "", "valid@example.com"],
      ],
    });
    assert.equal(r.totalRows, 3);
    assert.equal(r.rowsWithMustFix, 1);
    assert.equal(r.continueAllowed, false);
  });

  it("blocks when no usable identity path", () => {
    const staged = [["", "", "", ""]];
    const r = deriveImportBatchValidation({
      csv_headers: headers4,
      selections: sel4(0, 1, 2, 3),
      staged_rows: staged,
    });
    assert.equal(r.continueAllowed, false);
    assert.equal(r.rowsWithMustFix, 1);
    const id = r.issues.find((i) => i.kind === "no_usable_identity");
    assert.ok(id);
    assert.equal(id!.affectedRowCount, 1);
    assert.equal(id!.actions.length, 2);
  });

  it("issue categories with zero affected rows do not affect continueAllowed", () => {
    const staged = [["A", "a@x.com", "t", "c"]];
    const r = deriveImportBatchValidation({
      csv_headers: headers4,
      selections: sel4(0, 1, 2, 3),
      staged_rows: staged,
    });
    assert.equal(r.continueAllowed, true);
    for (const i of r.issues) {
      if (i.kind === "no_usable_identity") assert.equal(i.affectedRowCount, 0);
    }
  });

  it("invalid email blocks only when no other identity path", () => {
    const staged = [["A", "not-email", "", ""]];
    const r = deriveImportBatchValidation({
      csv_headers: headers4,
      selections: sel4(0, 1, 2, 3),
      staged_rows: staged,
    });
    assert.equal(r.continueAllowed, false);
  });

  it("invalid email is warning-only when linkedin provides identity", () => {
    const wide = [...headers4, "li"];
    const staged = [["A", "bad-email", "", "", "https://www.linkedin.com/in/x"]];
    const r = deriveImportBatchValidation({
      csv_headers: wide,
      selections: { ...sel4(0, 1, 2, 3), "4": "linkedin_url" },
      staged_rows: staged,
    });
    assert.equal(r.continueAllowed, true);
    const w = r.issues.find((i) => i.kind === "invalid_email_non_blocking");
    assert.ok(w);
    assert.equal(w!.affectedRowCount, 1);
  });

  it("duplicate email does not block continue", () => {
    const staged = [
      ["A", "Dup@X.COM", "t", "c"],
      ["B", "dup@x.com", "t2", "c2"],
      ["C", "c@y.com", "t3", "c3"],
    ];
    const r = deriveImportBatchValidation({
      csv_headers: headers4,
      selections: sel4(0, 1, 2, 3),
      staged_rows: staged,
    });
    assert.equal(normalizeEmailForDuplicateKey("Dup@X.COM"), "dup@x.com");
    assert.equal(r.duplicateEmailRowCount, 2);
    assert.equal(r.continueAllowed, true);
    const dup = r.issues.find((i) => i.kind === "duplicate_email");
    assert.ok(dup);
    assert.equal(dup!.actions.length, 1);
    assert.equal(dup!.actions[0]!.label, "Go to Source");
  });

  it("invalid non-empty linkedin with other identity is warning-only", () => {
    const wide = [...headers4, "li"];
    const r = deriveImportBatchValidation({
      csv_headers: wide,
      selections: { ...sel4(0, 1, 2, 3), "4": "linkedin_url" },
      staged_rows: [["A", "a@x.com", "t", "c", "not-a-url"]],
    });
    assert.equal(r.continueAllowed, true);
    const liIssue = r.issues.find((i) => i.kind === "invalid_linkedin_non_blocking");
    assert.ok(liIssue);
    assert.equal(liIssue!.affectedRowCount, 1);
  });

  it("blocking issue exposes mapping and source actions", () => {
    const empty = deriveImportBatchValidation({
      csv_headers: headers4,
      selections: sel4(0, 1, 2, 3),
      staged_rows: [["", "", "", ""]],
    });
    const block = empty.issues.find((i) => i.kind === "no_usable_identity");
    assert.ok(block);
    assert.ok(block!.actions.some((a) => a.label === "Go to Mapping"));
    assert.ok(block!.actions.some((a) => a.label === "Go to Source"));
  });

  it("valid linkedin_url format helper", () => {
    assert.ok(isImportLinkedInUrlFormatValid(""));
    assert.ok(isImportLinkedInUrlFormatValid("https://www.linkedin.com/in/someone"));
    assert.ok(!isImportLinkedInUrlFormatValid("https://linkedin.com/search/foo"));
  });

  it("counts change when staged rows change", () => {
    const base = {
      csv_headers: headers4,
      selections: sel4(0, 1, 2, 3),
    };
    const a = deriveImportBatchValidation({ ...base, staged_rows: [["A", "a@x.com", "t", "c"]] });
    const b = deriveImportBatchValidation({
      ...base,
      staged_rows: [
        ["A", "a@x.com", "t", "c"],
        ["B", "b@x.com", "t2", "c2"],
      ],
    });
    assert.notEqual(a.totalRows, b.totalRows);
    assert.equal(a.validationRatePercent, 100);
    assert.equal(b.validationRatePercent, 100);
  });

  it("isLeadImportEmailFormatValid sanity", () => {
    assert.ok(isLeadImportEmailFormatValid("a@b.co"));
    assert.ok(!isLeadImportEmailFormatValid("not-an-email"));
  });
});
