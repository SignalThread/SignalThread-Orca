import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("selectLatestCompanyScopedLicense uses order+limit before maybeSingle (PGRST116-safe)", () => {
  const src = read("lib/server/company-scoped-license-select.ts");
  assert.match(src, /\.order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)/);
  assert.match(src, /\.limit\(1\)/);
  assert.match(src, /\.maybeSingle\(\)/);
});

test("resolveAccessibleEventIds loadCompanyLicenseEligibility uses selectLatestCompanyScopedLicense", () => {
  const src = read("lib/server/company-event-access.ts");
  assert.match(src, /selectLatestCompanyScopedLicense/);
  assert.doesNotMatch(
    src,
    /\.eq\("scope",\s*"company"\)\s*\.maybeSingle\(\)/,
    "must not call maybeSingle on unbounded company license select"
  );
});

test("middleware admin route uses selectLatestCompanyScopedLicense for company license", () => {
  const src = read("lib/supabase/middleware.ts");
  assert.match(src, /selectLatestCompanyScopedLicense/);
  assert.doesNotMatch(
    src,
    /\.eq\("scope",\s*"company"\)\s*\.maybeSingle\(\)/,
    "middleware must not use maybeSingle on unbounded company license select"
  );
});

test("migration 0067 dedupes licenses + event_users and adds event_users unique", () => {
  const src = read("supabase/migrations/0067_dedupe_licenses_event_users_unique.sql");
  assert.match(src, /company-scoped license duplicates/);
  assert.match(src, /event_users_user_id_event_id_uidx/);
  assert.match(src, /licenses_scope_company_exhibitor_company_id_uidx/);
});

test("exhibitor lead list + assertEventIdAccessible use fixed resolver (indirect lead-detail context)", () => {
  const listSrc = read("app/api/exhibitor/leads/list/route.ts");
  assert.match(listSrc, /assertEventIdAccessibleForUser/);
  const accessSrc = read("lib/server/company-event-access.ts");
  assert.match(accessSrc, /assertEventIdAccessibleForUser/);
  assert.match(accessSrc, /selectLatestCompanyScopedLicense/);
});
