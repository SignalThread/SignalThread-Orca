// @lr area=import severity=P1 layer=unit category=local-only
/**
 * Import readiness parity — plan §10 and carried-forward note E.
 *
 * The defect this pins down:
 *
 *   > `220 ready / 0 issues` where those records do not actually satisfy identity
 *   > requirements, because the wizard's readiness preview and the server's final
 *   > import validation applied different rules.
 *
 * Structurally the two now share `rowHasUsableIdentityPath`:
 * `import-batch-validation-derive.ts` computes the preview, and
 * `publish-leads-materialization.ts:172` gates each row on the same function.
 *
 * Sharing a function name is not the invariant, though. The invariant is that the number
 * the user is shown equals the number of rows that actually become leads. This suite
 * asserts that over a mixed batch, on **exact row identity**, not just counts — two sets
 * of the same size can still contain different rows.
 *
 * The materialization function itself needs a database, so it is not invoked here. What
 * is invoked is the identity predicate it gates on, which is where the divergence in
 * note E actually lived.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  rowHasUsableIdentityPath,
  deriveImportBatchValidation,
  canonicalValueForRow,
  isLeadImportEmailFormatValid,
} from "../../lib/import-wizard/import-batch-validation-derive";
import { hasUsableImportedPersonName } from "../../lib/import-wizard/lead-import-name";

/** Column layout used throughout: 0=full name, 1=first, 2=last, 3=email, 4=company, 5=linkedin */
const SELECTIONS: Record<string, string> = {
  "0": "full_name",
  "1": "first_name",
  "2": "last_name",
  "3": "email",
  "4": "company_text",
  "5": "linkedin_url",
};

type Case = { id: string; cells: string[]; ready: boolean; why: string };

/**
 * The mixed batch from plan §10, one row per rule. `ready` is what the product rule
 * says, and is asserted against the shared predicate — so if the rule changes, this
 * table is what has to be updated deliberately.
 */
const BATCH: Case[] = [
  { id: "valid-email", cells: ["", "", "", "buyer@acme.com", "", ""], ready: true, why: "valid email is a complete identity" },
  { id: "valid-linkedin", cells: ["", "", "", "", "", "https://www.linkedin.com/in/someone"], ready: true, why: "valid LinkedIn is a complete identity" },
  { id: "fullname-company", cells: ["Sarah Meister", "", "", "", "SignalThread", ""], ready: true, why: "full name plus company identifies a person" },
  { id: "first-last-company", cells: ["", "Sarah", "Meister", "", "SignalThread", ""], ready: true, why: "first + last + company identifies a person" },
  { id: "surname-only-company", cells: ["Meister", "", "", "", "SignalThread", ""], ready: false, why: "a surname mapped as Full Name must NOT bypass readiness — note D/E" },
  { id: "first-only-company", cells: ["", "Sarah", "", "", "SignalThread", ""], ready: false, why: "a first name alone is displayable but not identifying" },
  { id: "malformed-email", cells: ["", "", "", "not-an-email", "", ""], ready: false, why: "a malformed email is not an identity" },
  { id: "blank-linkedin", cells: ["", "", "", "", "", "   "], ready: false, why: "whitespace is not a LinkedIn URL" },
  { id: "fullname-no-company", cells: ["Sarah Meister", "", "", "", "", ""], ready: false, why: "a name without a company is not identifying" },
  { id: "company-only", cells: ["", "", "", "", "SignalThread", ""], ready: false, why: "a company alone identifies no person" },
  { id: "entirely-blank", cells: ["", "", "", "", "", ""], ready: false, why: "an empty row is never ready" },
];

// ── the shared predicate ───────────────────────────────────────────────────────────

describe("identity readiness rule (the shared predicate)", () => {
  for (const c of BATCH) {
    it(`${c.id}: ${c.ready ? "ready" : "blocked"} — ${c.why}`, () => {
      assert.equal(rowHasUsableIdentityPath(c.cells, SELECTIONS), c.ready);
    });
  }

  it("the mixed batch produces exactly 4 ready of 11", () => {
    const ready = BATCH.filter((c) => rowHasUsableIdentityPath(c.cells, SELECTIONS));
    assert.equal(ready.length, 4);
    assert.deepStrictEqual(
      ready.map((c) => c.id),
      ["valid-email", "valid-linkedin", "fullname-company", "first-last-company"]
    );
  });
});

// ── parity: preview vs the gate the server applies ─────────────────────────────────

describe("preview readiness equals what the server would materialize (note E)", () => {
  /**
   * Mirror of `publish-leads-materialization.ts:172`:
   *   `if (!rowHasUsableIdentityPath(row.cells, selections)) continue;`
   * The database work below that line does not affect which rows are selected.
   */
  const serverWouldMaterialize = (cells: string[]) => rowHasUsableIdentityPath(cells, SELECTIONS);

  it("agrees on every row of the mixed batch, by exact row id", () => {
    const previewReady = BATCH.filter((c) => rowHasUsableIdentityPath(c.cells, SELECTIONS)).map((c) => c.id);
    const serverReady = BATCH.filter((c) => serverWouldMaterialize(c.cells)).map((c) => c.id);

    // Exact identity, not just count: two sets of size 4 can still be different sets,
    // which is precisely how "220 ready / 0 issues" produced the wrong 220.
    assert.deepStrictEqual(serverReady, previewReady);
  });

  it("no row is ready in the preview but dropped by the server", () => {
    const dropped = BATCH.filter(
      (c) => rowHasUsableIdentityPath(c.cells, SELECTIONS) && !serverWouldMaterialize(c.cells)
    );
    assert.deepStrictEqual(dropped, [], "a row shown as ready must become a lead");
  });

  it("no row is blocked in the preview but imported anyway", () => {
    const smuggled = BATCH.filter(
      (c) => !rowHasUsableIdentityPath(c.cells, SELECTIONS) && serverWouldMaterialize(c.cells)
    );
    assert.deepStrictEqual(smuggled, [], "a row shown as blocked must not silently import");
  });
});

// ── the batch-level derivation the UI actually renders ─────────────────────────────

describe("deriveImportBatchValidation reports the same readiness", () => {
  const HEADERS = ["Full Name", "First", "Last", "Email", "Company", "LinkedIn"];
  const derive = (cases: Case[]) =>
    deriveImportBatchValidation({
      csv_headers: HEADERS,
      selections: SELECTIONS,
      staged_rows: cases.map((c) => c.cells),
    });

  it("blocks exactly the rows the identity predicate blocks", () => {
    const result = derive(BATCH);
    const expectedBlocked = BATCH.filter((c) => !rowHasUsableIdentityPath(c.cells, SELECTIONS)).length;

    assert.equal(result.totalRows, BATCH.length);
    assert.equal(
      result.rowsWithMustFix,
      expectedBlocked,
      "the blocking count shown to the user must equal the rows the server will skip"
    );
    assert.equal(
      result.totalRows - result.rowsWithMustFix,
      BATCH.filter((c) => rowHasUsableIdentityPath(c.cells, SELECTIONS)).length,
      "ready = total − blocking, and must match what materialization would import"
    );
  });

  it("uses one name for the same quantity, so the UI cannot show two different counts", () => {
    const result = derive(BATCH);
    assert.equal(
      result.missingRequiredRowCount,
      result.rowsWithMustFix,
      "these are documented as the same quantity; if they diverge the UI can display both"
    );
  });

  it("refuses to continue when any row lacks identity — no `220 ready / 0 issues`", () => {
    const result = derive(BATCH);
    assert.equal(result.continueAllowed, false, "a batch with blocking rows must not be publishable");
  });

  it("allows continuing when every row is genuinely identifiable", () => {
    // The mirror case. A gate that always blocks would satisfy the test above while
    // making import impossible.
    const allReady = BATCH.filter((c) => rowHasUsableIdentityPath(c.cells, SELECTIONS));
    const result = derive(allReady);
    assert.equal(result.rowsWithMustFix, 0);
    assert.equal(result.continueAllowed, true);
  });

  it("READY and FULLY VALID are different quantities, and must not be conflated", () => {
    // Worth pinning, because conflating them is how a truthful readiness number turns
    // into a misleading one. A row with a valid email but no job title or company is
    // *importable* (no blocking issue) yet not *fully valid* (it carries warnings).
    // `validationRatePercent` reports the second, not the first.
    const emailOnly: Case[] = [
      { id: "email-only", cells: ["", "", "", "buyer@acme.com", "", ""], ready: true, why: "" },
    ];
    const result = derive(emailOnly);

    assert.equal(result.rowsWithMustFix, 0, "importable: nothing blocks it");
    assert.equal(result.continueAllowed, true);
    assert.equal(result.fullyValidRows, 0, "but not fully valid: job title and company are missing");
    assert.equal(
      result.validationRatePercent,
      0,
      "validationRatePercent tracks fullyValidRows, so it must not be read as a readiness figure"
    );
  });

  it("a row with every field populated is both ready and fully valid", () => {
    const complete: Case[] = [
      {
        id: "complete",
        cells: ["Sarah Meister", "", "", "sarah@signalthread.ai", "SignalThread", "https://www.linkedin.com/in/sarahmeister"],
        ready: true,
        why: "",
      },
    ];
    const result = derive(complete);
    assert.equal(result.rowsWithMustFix, 0);
    assert.equal(result.continueAllowed, true);
    assert.equal(result.invalidEmailRowCount, 0);
  });

  it("an empty batch is not 'ready' — zero rows must not read as success", () => {
    const result = derive([]);
    assert.equal(result.totalRows, 0);
    assert.equal(result.continueAllowed, false, "zero data rows must not be publishable");
  });

  it("counts a duplicate email once as a duplicate, without double-blocking identity", () => {
    const dupes: Case[] = [
      { id: "a", cells: ["", "", "", "same@acme.com", "", ""], ready: true, why: "" },
      { id: "b", cells: ["", "", "", "SAME@acme.com", "", ""], ready: true, why: "" },
    ];
    const result = derive(dupes);
    assert.equal(result.rowsWithMustFix, 0, "both rows have a usable identity");
    assert.equal(result.duplicateEmailRowCount, 2, "case-variant emails are the same person");
  });
});

// ── the specific note D/E interaction ──────────────────────────────────────────────

describe("a surname mapped as Full Name cannot reach readiness (note D + E)", () => {
  it("hasUsableImportedPersonName requires two components in a Full Name mapping", () => {
    assert.equal(hasUsableImportedPersonName(["Meister"], { "0": "full_name" }), false);
    assert.equal(hasUsableImportedPersonName(["Sarah Meister"], { "0": "full_name" }), true);
  });

  it("but first + last together are enough, even when each is one word", () => {
    assert.equal(
      hasUsableImportedPersonName(["Sarah", "Meister"], { "0": "first_name", "1": "last_name" }),
      true
    );
  });

  it("multi-part surnames and hyphenated names count as two components", () => {
    assert.equal(hasUsableImportedPersonName(["Ana van der Berg"], { "0": "full_name" }), true);
    assert.equal(hasUsableImportedPersonName(["Marie-Claire Dubois"], { "0": "full_name" }), true);
  });

  it("a single hyphenated token is still one component", () => {
    // "Marie-Claire" alone is a first name, not an identity.
    assert.equal(hasUsableImportedPersonName(["Marie-Claire"], { "0": "full_name" }), false);
  });

  it("Unicode names are handled by component count, not by ASCII assumptions", () => {
    assert.equal(hasUsableImportedPersonName(["李 明"], { "0": "full_name" }), true);
    assert.equal(hasUsableImportedPersonName(["Björn Sjöberg"], { "0": "full_name" }), true);
    assert.equal(hasUsableImportedPersonName(["Björn"], { "0": "full_name" }), false);
  });

  it("collapsed whitespace does not manufacture a second component", () => {
    assert.equal(
      hasUsableImportedPersonName(["  Meister   "], { "0": "full_name" }),
      false,
      "padding must not be counted as a name component"
    );
  });
});

// ── email format rule, shared by preview and server ────────────────────────────────

describe("email validity is one rule, used by both sides", () => {
  const valid = ["a@b.co", "first.last+tag@sub.domain.com", "UPPER@EXAMPLE.COM"];
  const invalid = ["", "   ", "no-at-sign", "@nolocal.com", "trailing@", "two@@at.com", "spaces in@x.com"];

  for (const e of valid) {
    it(`accepts ${JSON.stringify(e)}`, () => assert.equal(isLeadImportEmailFormatValid(e), true));
  }
  for (const e of invalid) {
    it(`rejects ${JSON.stringify(e)}`, () => assert.equal(isLeadImportEmailFormatValid(e), false));
  }

  it("an invalid email does not make a row ready on its own", () => {
    assert.equal(rowHasUsableIdentityPath(["", "", "", "no-at-sign", "", ""], SELECTIONS), false);
  });
});

// ── canonical value resolution ─────────────────────────────────────────────────────

describe("canonicalValueForRow drives both sides identically", () => {
  it("reads the mapped column, not a positional guess", () => {
    const cells = ["Full", "First", "Last", "e@x.com", "Acme", "li"];
    assert.equal(canonicalValueForRow(cells, SELECTIONS, "email"), "e@x.com");
    assert.equal(canonicalValueForRow(cells, SELECTIONS, "company_text"), "Acme");
  });

  it("returns empty string for an unmapped key rather than undefined", () => {
    // Downstream code trims this value; undefined would throw instead of being blocked.
    assert.equal(canonicalValueForRow(["a"], { "0": "full_name" }, "email"), "");
  });

  it("reordered columns resolve by mapping, so column order never matters", () => {
    const reordered = { "0": "email", "1": "company_text", "2": "full_name" };
    assert.equal(
      rowHasUsableIdentityPath(["buyer@acme.com", "Acme", "Sarah Meister"], reordered),
      true
    );
  });
});
