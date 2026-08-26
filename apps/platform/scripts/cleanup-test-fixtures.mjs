#!/usr/bin/env node
/**
 * Remove the Phase 1 test fixtures from Platform Core.
 *
 *   node scripts/cleanup-test-fixtures.mjs            # dry run (default)
 *   node scripts/cleanup-test-fixtures.mjs --apply    # actually delete
 *
 * Scope: identities whose email ends in `@signalthread.test`, and the registry
 * rows created for them. Nothing else is touched.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE RUNNING WITH --apply
 *
 * As of Phase 1 every identity in Platform Core is a fixture, and the only row
 * in `platform_admins` belongs to one of them. Deleting the fixtures therefore
 * leaves the project with NO Platform admin, and the admin console becomes
 * unreachable — `requirePlatformAdmin` reads the canonical table, so there is no
 * back door.
 *
 * Provision a real Platform admin FIRST. This script refuses to remove the last
 * remaining admin unless a non-fixture admin already exists.
 * ---------------------------------------------------------------------------
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.PLATFORM_CORE_SERVICE_ROLE_KEY?.trim();
const EXPECTED_REF = process.env.PLATFORM_CORE_PROJECT_REF?.trim() || "wtbnpeluwhjjqccdofxd";
const TEST_DOMAIN = "@signalthread.test";

if (!URL || !SERVICE_ROLE) {
  console.error("Set NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL and PLATFORM_CORE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
if (!URL.includes(EXPECTED_REF)) {
  console.error(`Refusing to run: ${URL} is not Platform Core (${EXPECTED_REF}).`);
  process.exit(2);
}

const apply = process.argv.includes("--apply");
const db = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } });

async function main() {
  const { data: { users }, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(error.message);

  const fixtures = users.filter((u) => u.email?.toLowerCase().endsWith(TEST_DOMAIN));
  const real = users.filter((u) => !u.email?.toLowerCase().endsWith(TEST_DOMAIN));
  const fixtureIds = new Set(fixtures.map((u) => u.id));

  const { data: admins } = await db.from("platform_admins").select("user_id");
  const realAdmins = (admins ?? []).filter((a) => !fixtureIds.has(a.user_id));

  console.log(`  fixture identities : ${fixtures.length}`);
  fixtures.forEach((u) => console.log(`      ${u.email}`));
  console.log(`  non-fixture identities: ${real.length}`);
  console.log(`  Platform admins that would survive: ${realAdmins.length}`);

  if (apply && realAdmins.length === 0) {
    console.error(
      "\n  REFUSING TO APPLY: no non-fixture Platform admin exists.\n" +
      "  Deleting these would leave Platform Core with no administrator.\n" +
      "  Provision a real admin first, then re-run.",
    );
    process.exit(1);
  }

  // Registry rows are removed by FK cascade when the auth user is deleted
  // (organization_memberships, event_memberships, platform_admins all reference
  // auth.users ON DELETE CASCADE). Organizations, events and entitlements are NOT
  // user-scoped, so they are listed separately and removed explicitly.
  const fixtureOrgSlugs = ["acme-events", "globex-summits"];
  const { data: orgs } = await db.from("organizations").select("id, slug").in("slug", fixtureOrgSlugs);

  console.log(`\n  fixture organizations (cascade removes their events/entitlements): ${orgs?.length ?? 0}`);
  (orgs ?? []).forEach((o) => console.log(`      ${o.slug}`));

  if (!apply) {
    console.log("\n  DRY RUN — nothing deleted. Re-run with --apply to remove.");
    return;
  }

  for (const user of fixtures) {
    const { error: delError } = await db.auth.admin.deleteUser(user.id);
    if (delError) throw new Error(`${user.email}: ${delError.message}`);
    console.log(`  deleted identity ${user.email}`);
  }
  for (const org of orgs ?? []) {
    const { error: orgError } = await db.from("organizations").delete().eq("id", org.id);
    if (orgError) throw new Error(`${org.slug}: ${orgError.message}`);
    console.log(`  deleted organization ${org.slug} (events + entitlements cascaded)`);
  }
  console.log("\n  Cleanup complete. Product catalog rows were left intact.");
}

main().catch((e) => { console.error(`  cleanup failed: ${e.message}`); process.exit(1); });
