/**
 * Regression: migration 0065 widens SELECT RLS for `exhibitor_viewer` (mobile JWT
 * bootstrap) for companies, users, leads, lead_enrichments, licenses, event_users.
 * Read-only: no write policies for exhibitor_viewer in this file.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/0065_exhibitor_viewer_mobile_bootstrap_rls.sql";

function readMigration(): string {
  return readFileSync(path.join(ROOT, MIGRATION), "utf8");
}

function extractCreatePolicyBlocks(sql: string): { name: string; verb: string; body: string }[] {
  const out: { name: string; verb: string; body: string }[] = [];
  const re =
    /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+[^\n]+\s+FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b([\s\S]*?)(?=(?:\n\s*(?:CREATE|DROP|ALTER|COMMIT|BEGIN)|$))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    out.push({ name: m[1]!, verb: m[2]!.toUpperCase(), body: m[3] ?? "" });
  }
  return out;
}

const EXPECTED_SELECT_POLICIES = [
  "companies_select_scope",
  "users_select_visibility_v2",
  "leads_select_scope",
  "lead_enrichments_select_scope",
  "licenses_select_scope",
  "event_users_select_exhibitor_scope",
] as const;

test("0065 enables event_users RLS and only SELECT policies for mobile bootstrap tables", () => {
  const sql = readMigration();
  assert.match(sql, /ALTER\s+TABLE\s+public\.event_users\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);

  const policies = extractCreatePolicyBlocks(sql);
  const names = policies.map((p) => p.name).sort();
  assert.deepEqual(names, [...EXPECTED_SELECT_POLICIES].sort(), "0065 must define exactly the six expected SELECT policies");

  for (const p of policies) {
    assert.equal(p.verb, "SELECT", `0065 must not create non-SELECT policy: ${p.name}`);
    assert.match(
      p.body,
      /'exhibitor_viewer'/,
      `SELECT policy ${p.name} must include 'exhibitor_viewer' for read-only mobile bootstrap`
    );
  }
});

test("0065 does not add INSERT/UPDATE/DELETE/ALL policies", () => {
  const sql = readMigration();
  const policies = extractCreatePolicyBlocks(sql);
  for (const p of policies) {
    assert.equal(p.verb, "SELECT", `0065 must be read-only: unexpected ${p.verb} on ${p.name}`);
  }
  assert.doesNotMatch(
    sql,
    /\bFOR\s+(INSERT|UPDATE|DELETE|ALL)\b/i,
    "0065 must not contain FOR INSERT/UPDATE/DELETE/ALL"
  );
});

test("0065 does not use license cohort or users self-subquery in users RLS (recursion / missing fn)", () => {
  const sql = readMigration();
  assert.ok(!sql.includes("current_license_id"), "0065 must not contain current_license_id");
  assert.ok(
    !sql.includes("SELECT u.license_id FROM public.users"),
    "0065 must not contain SELECT u.license_id FROM public.users"
  );
  assert.ok(!sql.includes("license_id = ("), "0065 must not contain license_id = (");
});

