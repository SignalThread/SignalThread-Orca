#!/usr/bin/env node
/**
 * Canonical claim synchronisation.
 *
 * Derives `app_metadata.signalthread` from the Platform Core registry for every
 * user, or for the users named on the command line. Deterministic and idempotent:
 * an unchanged registry reports "unchanged" and performs no write, so a sync loop
 * cannot churn tokens.
 *
 *   node scripts/sync-claims.mjs                 # every user
 *   node scripts/sync-claims.mjs a@b.test        # named users only
 *   node scripts/sync-claims.mjs --dry-run       # derive and diff, write nothing
 *
 * Server-only: requires PLATFORM_CORE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL?.trim();
const SERVICE_ROLE = process.env.PLATFORM_CORE_SERVICE_ROLE_KEY?.trim();
const EXPECTED_REF = process.env.PLATFORM_CORE_PROJECT_REF?.trim() || "wtbnpeluwhjjqccdofxd";

if (!URL || !SERVICE_ROLE) {
  console.error("Set NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL and PLATFORM_CORE_SERVICE_ROLE_KEY.");
  process.exit(2);
}

// Positive target identification before any mutation: the Orca project must never
// be reachable from this script, whatever the environment happens to hold.
if (!URL.includes(EXPECTED_REF)) {
  console.error(`Refusing to run: ${URL} is not the expected Platform Core project ${EXPECTED_REF}.`);
  process.exit(2);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const emailFilter = args.filter((a) => !a.startsWith("--"));

const supabase = createClient(URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CLAIMS_NAMESPACE = "signalthread";
const CLAIM_VERSION = 1;

async function buildAccess(userId) {
  const { data: memberships, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, status, organizations!inner(id, slug, status)")
    .eq("user_id", userId)
    .eq("status", "ACTIVE");
  if (error) throw new Error(error.message);

  const active = (memberships ?? []).filter((m) => m.organizations?.status === "ACTIVE");
  if (active.length === 0) return [];

  const orgIds = active.map((m) => m.organization_id);
  const { data: ents, error: entError } = await supabase
    .from("organization_product_entitlements")
    .select("organization_id, product_key, status")
    .in("organization_id", orgIds)
    .eq("status", "ACTIVE");
  if (entError) throw new Error(entError.message);

  const byOrg = new Map();
  for (const e of ents ?? []) {
    const list = byOrg.get(e.organization_id) ?? [];
    list.push(String(e.product_key).toLowerCase());
    byOrg.set(e.organization_id, list);
  }

  return active
    .map((m) => ({
      organization_id: m.organization_id,
      organization_role: m.role,
      products: [...new Set(byOrg.get(m.organization_id) ?? [])].sort(),
    }))
    .sort((a, b) => a.organization_id.localeCompare(b.organization_id));
}

async function isPlatformAdmin(userId) {
  const { data, error } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

function sameClaims(a, b) {
  if (!a || typeof a !== "object") return false;
  const norm = (c) => JSON.stringify({
    v: c.v,
    platform_admin: c.platform_admin,
    access: (c.access ?? []).map((e) => ({ ...e, products: [...(e.products ?? [])].sort() }))
      .sort((x, y) => x.organization_id.localeCompare(y.organization_id)),
  });
  return norm(a) === norm(b);
}

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(error.message);

  const users = data.users.filter((u) => emailFilter.length === 0 || emailFilter.includes(u.email));
  const syncedAt = new Date().toISOString();
  let changed = 0;

  for (const user of users) {
    const claims = {
      v: CLAIM_VERSION,
      access: await buildAccess(user.id),
      platform_admin: await isPlatformAdmin(user.id),
      synced_at: syncedAt,
    };

    const current = user.app_metadata?.[CLAIMS_NAMESPACE];
    if (sameClaims(current, claims)) {
      console.log(`  unchanged  ${user.email}`);
      continue;
    }

    const summary = claims.access
      .map((e) => `${e.organization_id.slice(0, 8)}:${e.products.join("+") || "(none)"}`)
      .join(" ") || "(no organizations)";
    console.log(`  ${dryRun ? "would sync" : "synced   "}  ${user.email}  admin=${claims.platform_admin}  ${summary}`);

    if (!dryRun) {
      // Replace the whole namespace rather than merging: a stale legacy key left
      // behind is exactly what would silently widen access later.
      const next = { ...(user.app_metadata ?? {}) };
      next[CLAIMS_NAMESPACE] = claims;
      const { error: upErr } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: next });
      if (upErr) throw new Error(`${user.email}: ${upErr.message}`);
    }
    changed += 1;
  }

  console.log(`\n  ${users.length} user(s) examined, ${changed} ${dryRun ? "would change" : "changed"}.`);
  if (changed > 0 && !dryRun) {
    console.log("  Existing sessions keep their old claim until the access token is refreshed.");
  }
}

main().catch((e) => { console.error(`  sync failed: ${e.message}`); process.exit(1); });
