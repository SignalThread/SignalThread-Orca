import assert from "node:assert/strict";
import test from "node:test";
import { buildCsv, neutralizeCsvInjection } from "@/src/server/services/budget";

// Regression for Budget CSV/formula injection: exported cells built from
// user-controlled text (line item names, vendors, categories) must not be
// interpreted as formulas by Excel/Sheets, while legitimate numeric amounts
// (including negatives) must be preserved unchanged.
test("neutralizeCsvInjection prefixes formula-leading text but preserves numbers", () => {
  // Dangerous formula leads get an apostrophe guard.
  assert.equal(neutralizeCsvInjection("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(neutralizeCsvInjection("+1+1"), "'+1+1");
  assert.equal(neutralizeCsvInjection("@import"), "'@import");
  assert.equal(neutralizeCsvInjection("=cmd|'/c calc'!A1"), "'=cmd|'/c calc'!A1");
  assert.equal(neutralizeCsvInjection("-2+3+cmd('/c')"), "'-2+3+cmd('/c')");
  assert.equal(neutralizeCsvInjection("\t=1"), "'\t=1");
  assert.equal(neutralizeCsvInjection("\r=1"), "'\r=1");

  // Legitimate values are untouched.
  assert.equal(neutralizeCsvInjection("-50.00"), "-50.00");
  assert.equal(neutralizeCsvInjection("1234.00"), "1234.00");
  assert.equal(neutralizeCsvInjection("0.00"), "0.00");
  assert.equal(neutralizeCsvInjection("Acme Catering"), "Acme Catering");
  assert.equal(neutralizeCsvInjection(""), "");
});

test("buildCsv neutralizes injection and still RFC-escapes quotes/commas", () => {
  const csv = buildCsv(
    ["Vendor", "Forecast (USD)"],
    [
      ["=HYPERLINK(\"http://evil\")", "-50.00"],
      ["Normal, Vendor", "1234.00"],
    ],
  );
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], "Vendor,Forecast (USD)");
  // Injection guard applied, then the embedded quote forces RFC quoting.
  assert.equal(lines[1], "\"'=HYPERLINK(\"\"http://evil\"\")\",-50.00");
  // Comma-bearing safe text is RFC-quoted; numeric preserved.
  assert.equal(lines[2], "\"Normal, Vendor\",1234.00");
});
