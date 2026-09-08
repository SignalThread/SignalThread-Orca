/**
 * Migration 0066 repairs public.users RLS if 0065 left a recursive
 * users_select_visibility_v2. Pins file presence, relative ordering, and no license subquery.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS = path.join(ROOT, "test-fixtures", "legacy-lr-migrations");
const M0066 = "0066_fix_users_select_visibility_recursion.sql";

test("0066 exists after 0065 and later migrations do not recreate users_select_visibility_v2", () => {
  const all = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  assert.ok(all.includes(M0066), `${M0066} must exist in test-fixtures/legacy-lr-migrations`);
  const index0065 = all.indexOf("0065_exhibitor_viewer_mobile_bootstrap_rls.sql");
  const index0066 = all.indexOf(M0066);
  assert.ok(index0065 >= 0, "0065 migration must exist");
  assert.ok(index0066 > index0065, "0066 must run after 0065");

  const laterPolicyRecreations = all.slice(index0066 + 1).filter((migration) => {
    const sql = readFileSync(path.join(MIGRATIONS, migration), "utf8");
    return /CREATE\s+POLICY\s+"users_select_visibility_v2"/i.test(sql);
  });
  assert.deepEqual(laterPolicyRecreations, [], "later migrations must not recreate users_select_visibility_v2");
});

test("0066 redefines only users_select_visibility_v2 as SELECT, no recursive users subquery", () => {
  const sql = readFileSync(path.join(MIGRATIONS, M0066), "utf8");
  assert.match(
    sql,
    /CREATE\s+POLICY\s+"users_select_visibility_v2"/i,
    "0066 must create users_select_visibility_v2"
  );
  assert.doesNotMatch(
    sql,
    /\bFOR\s+(INSERT|UPDATE|DELETE|ALL)\b/i,
    "0066 must not define non-SELECT policies"
  );
  assert.ok(!sql.includes("current_license_id"), "0066 must not contain current_license_id");
  assert.ok(
    !sql.includes("SELECT u.license_id FROM public.users"),
    "0066 must not contain SELECT u.license_id FROM public.users"
  );
  assert.ok(!sql.includes("license_id = ("), "0066 must not contain license_id = (");
});
