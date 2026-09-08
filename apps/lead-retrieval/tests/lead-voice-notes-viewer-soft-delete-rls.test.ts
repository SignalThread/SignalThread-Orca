import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATION = "test-fixtures/legacy-lr-migrations/0072_lead_voice_notes.sql";

function readMigration(): string {
  return readFileSync(path.join(ROOT, MIGRATION), "utf8");
}

test("lead_voice_notes event app members policy permits scoped soft-delete updates", () => {
  const sql = readMigration();
  const policyMatch = sql.match(
    /create policy lead_voice_notes_event_app_members_all[\s\S]*?using \(([\s\S]*?)\)\s*with check \(([\s\S]*?)\)\s*;/i
  );

  assert.ok(policyMatch, "lead_voice_notes_event_app_members_all policy must exist");

  const usingBody = policyMatch?.[1] ?? "";
  const withCheckBody = policyMatch?.[2] ?? "";

  assert.match(usingBody, /deleted_at is null/i);
  assert.match(usingBody, /event_users eu/i);
  assert.match(usingBody, /public\.event_app_permission_enabled\s*\(eu\.permissions\)/i);

  assert.match(withCheckBody, /event_users eu/i);
  assert.match(withCheckBody, /public\.event_app_permission_enabled\s*\(eu\.permissions\)/i);
  assert.doesNotMatch(
    withCheckBody,
    /deleted_at is null/i,
    "WITH CHECK must allow flipping deleted_at for soft delete"
  );
});
