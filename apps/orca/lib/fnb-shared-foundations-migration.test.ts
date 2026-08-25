import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "test-fixtures/legacy-orca-migrations/20260806170000_add_fnb_shared_foundations/migration.sql";

test("shared foundation migration is additive, constrained, and event scoped", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.doesNotMatch(sql, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM)\b/im);
  assert.match(sql, /EventFnbCatalogItem_price_provenance_check/);
  assert.match(sql, /SessionFnbRequirement_not_needed_reason_check/);
  assert.match(sql, /FOREIGN KEY \("eventId"\) REFERENCES "Event"/);
  assert.match(sql, /FOREIGN KEY \("sessionId"\) REFERENCES "MatrixRow"/);
  assert.match(sql, /UNIQUE INDEX "SessionFnbRequirement_sessionId_kind_code_key"/);
});

test("schema preserves explicit claims and separate price provenance", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf8");
  assert.match(schema, /enum FnbClaimKind \{[\s\S]*CONTAINS[\s\S]*FREE_OF/);
  assert.match(schema, /publishedPriceCents\s+Int\?/);
  assert.match(schema, /negotiatedPriceCents\s+Int\?/);
  assert.match(schema, /discountCents\s+Int\?/);
  assert.match(schema, /dispositionReason\s+String\?/);
  // MatrixRowSpeaker / MatrixRowStaffAssignment are legacy bridges that still exist and
  // still hold rows in the live database. The clean-database baseline preserves schema
  // parity, so they are modelled again; canonical reads/writes must still prefer
  // SessionSpeakerAssignment / SessionStaffAssignment. Retiring the bridges is a separate
  // decision that requires its own data-retirement evidence.
  assert.match(schema, /model SessionSpeakerAssignment/);
  assert.match(schema, /model SessionStaffAssignment/);
});
