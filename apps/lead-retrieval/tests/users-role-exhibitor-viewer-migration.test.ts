/**
 * PR 1 regression: DB + read-only RLS foundation for `exhibitor_viewer`.
 *
 * Pins:
 *   1. Migration 0064 exists and updates `users_role_check` to the canonical
 *      production set + `exhibitor_viewer`.
 *   2. Migration 0064 widens ONLY the two SELECT policies it is supposed to
 *      widen (`lead_briefings_select_scope`, `events_select_exhibitor_company`).
 *   3. No INSERT / UPDATE / DELETE policy outside `0069_consolidate_mobile_app_viewer_capture_rls.sql`
 *      grants `exhibitor_viewer` row writes (0069 adds mobile JWT lead RLS aligned with `event_app_permission_enabled`;
 *      later migrations may exist but must not widen exhibitor_viewer writes — guarded by scanning all migration files).
 *   4. No application code writes legacy `public.users.role` values (`exhibitor`,
 *      `organizer`, `viewer`, `app_user`); use `exhibitor_admin` / `exhibitor_viewer`
 *      (covered by `tests/invite-permissions-public-users-role.test.ts`).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATIONS_DIR = path.join(ROOT, "test-fixtures", "legacy-lr-migrations");
const TARGET_MIGRATION = "0064_users_role_exhibitor_viewer_and_read_rls.sql";
const MOBILE_VIEWER_LEAD_RLS_MIGRATION = "0069_consolidate_mobile_app_viewer_capture_rls.sql";
const MIGRATION_0065 = "0065_exhibitor_viewer_mobile_bootstrap_rls.sql";

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

function listSqlMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Split the migration into top-level `CREATE POLICY` blocks.
 * Each block ends at the next blank line that is followed by a non-policy
 * statement (or end-of-file). Good enough for our deliberately-formatted
 * migrations; not a general SQL parser.
 */
function extractCreatePolicyBlocks(sql: string): { name: string; verb: string; body: string }[] {
  const out: { name: string; verb: string; body: string }[] = [];
  const re =
    /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+[^\n]+\s+FOR\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\b([\s\S]*?)(?=(?:\n\s*(?:CREATE|DROP|ALTER|COMMIT|BEGIN|--\s*\d+\.)|$))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    out.push({ name: m[1]!, verb: m[2]!.toUpperCase(), body: m[3] ?? "" });
  }
  return out;
}

test("0064, 0065, 0066, and 0069 exist; pinned viewer RLS migrations sort in expected order before any newer files", () => {
  const all = listSqlMigrations();
  assert.ok(all.includes(TARGET_MIGRATION), `${TARGET_MIGRATION} must exist in test-fixtures/legacy-lr-migrations`);
  assert.ok(all.includes(MIGRATION_0065), `${MIGRATION_0065} must exist in test-fixtures/legacy-lr-migrations`);
  const mig0066 = "0066_fix_users_select_visibility_recursion.sql";
  assert.ok(all.includes(mig0066), `${mig0066} must exist`);
  assert.ok(
    all.includes(MOBILE_VIEWER_LEAD_RLS_MIGRATION),
    `${MOBILE_VIEWER_LEAD_RLS_MIGRATION} must exist (mobile exhibitor_viewer lead RLS)`
  );

  const ix = (name: string) => all.indexOf(name);

  assert.ok(ix(TARGET_MIGRATION) !== -1, "0064 indexed");
  assert.ok(ix(TARGET_MIGRATION) < ix(MIGRATION_0065), `${TARGET_MIGRATION} must lexically precede ${MIGRATION_0065} (applied first)`);
  assert.ok(ix(MIGRATION_0065) < ix(mig0066), `${MIGRATION_0065} must precede ${mig0066}`);
  assert.ok(ix(mig0066) < ix(MOBILE_VIEWER_LEAD_RLS_MIGRATION), `${mig0066} must precede ${MOBILE_VIEWER_LEAD_RLS_MIGRATION}`);

  // New migrations (0070+, workflows, …) append after these; must not redefine this invariant.
});

test("0064 updates users_role_check to (platform_admin, event_organizer, exhibitor_admin, exhibitor_viewer)", () => {
  const sql = read(`test-fixtures/legacy-lr-migrations/${TARGET_MIGRATION}`);

  // Internal role was renamed before 0064 shipped; migration must not use the old literal.
  const supersededLimitedRole = "app" + "_" + "user";
  assert.doesNotMatch(sql, new RegExp(`'${supersededLimitedRole}'`), "0064 must use exhibitor_viewer only in users_role_check / RLS");

  assert.match(
    sql,
    /ALTER\s+TABLE\s+public\.users\s+DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+users_role_check\s*;/i,
    "must drop the existing users_role_check defensively"
  );

  const addRe =
    /ALTER\s+TABLE\s+public\.users\s+ADD\s+CONSTRAINT\s+users_role_check\s+CHECK\s*\(\s*role\s+IN\s*\(([^)]+)\)\s*\)\s*;/i;
  const addMatch = sql.match(addRe);
  assert.ok(addMatch, "must re-add users_role_check");

  const values = addMatch![1]!
    .split(",")
    .map((v) => v.trim().replace(/^'(.*)'$/, "$1"))
    .sort();
  assert.deepEqual(
    values,
    ["event_organizer", "exhibitor_admin", "exhibitor_viewer", "platform_admin"],
    "users_role_check must allow exactly the production-current set + exhibitor_viewer"
  );

  for (const repoLegacy of ["organizer", "exhibitor", "viewer"]) {
    assert.ok(
      !values.includes(repoLegacy),
      `users_role_check must NOT include legacy repo-only value ${JSON.stringify(repoLegacy)}`
    );
  }
});

test("0064 widens exactly two SELECT policies and no others; both include exhibitor_viewer", () => {
  const sql = read(`test-fixtures/legacy-lr-migrations/${TARGET_MIGRATION}`);
  const policies = extractCreatePolicyBlocks(sql);

  const names = policies.map((p) => `${p.verb}:${p.name}`).sort();
  assert.deepEqual(
    names,
    ["SELECT:events_select_exhibitor_company", "SELECT:lead_briefings_select_scope"].sort(),
    "0064 must redefine ONLY the two SELECT policies needed for dashboard/leads"
  );

  for (const p of policies) {
    assert.equal(p.verb, "SELECT", `policy ${p.name} must be SELECT only`);
    assert.match(
      p.body,
      /'exhibitor_viewer'/,
      `SELECT policy ${p.name} must include 'exhibitor_viewer' in its role list`
    );
    assert.match(
      p.body,
      /'exhibitor_admin'/,
      `SELECT policy ${p.name} must keep existing 'exhibitor_admin' grant`
    );
  }
});

test("0064 does NOT redefine any INSERT/UPDATE/DELETE policy", () => {
  const sql = read(`test-fixtures/legacy-lr-migrations/${TARGET_MIGRATION}`);
  const policies = extractCreatePolicyBlocks(sql);
  for (const p of policies) {
    assert.notEqual(
      p.verb,
      "INSERT",
      `0064 must not (re)create INSERT policy ${p.name}`
    );
    assert.notEqual(
      p.verb,
      "UPDATE",
      `0064 must not (re)create UPDATE policy ${p.name}`
    );
    assert.notEqual(
      p.verb,
      "DELETE",
      `0064 must not (re)create DELETE policy ${p.name}`
    );
    assert.notEqual(p.verb, "ALL", `0064 must not (re)create FOR ALL policy ${p.name}`);
  }
});

test("no INSERT/UPDATE/DELETE policy outside 0069 grants exhibitor_viewer row writes", () => {
  for (const file of listSqlMigrations()) {
    if (file === MOBILE_VIEWER_LEAD_RLS_MIGRATION) continue;
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const policies = extractCreatePolicyBlocks(sql);
    for (const p of policies) {
      if (p.verb === "SELECT") continue;
      assert.ok(
        !/'exhibitor_viewer'/.test(p.body),
        `${file}: ${p.verb} policy ${p.name} must NOT include 'exhibitor_viewer' (use 0069 for mobile lead writes)`
      );
    }
  }
});

test("app/lib must not assign legacy public.users.role string literals (exhibitor, viewer, organizer, app_user)", () => {
  const dirs = ["app", "lib"];
  const scanned: string[] = [];
  function walk(dir: string): void {
    const abs = path.join(ROOT, dir);
    let entries: string[];
    try {
      entries = readdirSync(abs, { withFileTypes: true }).map((e) =>
        e.isDirectory() ? `${e.name}/` : e.name
      );
    } catch {
      return;
    }
    for (const entry of entries) {
      const isDir = entry.endsWith("/");
      const rel = path.join(dir, isDir ? entry.slice(0, -1) : entry);
      if (isDir) {
        walk(rel);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        scanned.push(rel);
      }
    }
  }
  walk("app");
  walk("lib");

  const legacyRoleLiteral =
    /\brole\s*:\s*['"](exhibitor|viewer|organizer|app_user)['"]/;

  const allowlisted = new Set<string>([
    // Product team role in UI state (not a public.users row shape).
    "app/(app)/exhibitor/users/users-client.tsx",
    // Display-only when auth.users row is missing; not persisted to public.users.
    "lib/data/platform-admin.ts"
  ]);

  const offenders: string[] = [];
  for (const rel of scanned) {
    if (allowlisted.has(rel)) continue;
    const body = read(rel);
    if (legacyRoleLiteral.test(body)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `These files use legacy role: "exhibitor"|"viewer"|"organizer"|"app_user" object literals. Map to allowed users.role values (0064) or use variables:\n${offenders.join("\n")}`
  );
});
