#!/usr/bin/env node
/**
 * Prove Platform Core RLS against the live project, as a real signed-in user.
 *
 * RLS is enforced by PostgREST for `authenticated` requests, so signing in and
 * issuing ordinary queries exercises the same path production uses. Running the
 * equivalent SQL as a superuser would prove nothing: service_role has BYPASSRLS.
 *
 * Requires (never committed):
 *   NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL
 *   NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY
 *   RLS_USER_A_EMAIL / RLS_USER_A_PASSWORD   plain member of org A (NOT a Platform admin)
 *   RLS_USER_B_EMAIL / RLS_USER_B_PASSWORD   plain member of org B (NOT a Platform admin)
 *   RLS_ADMIN_EMAIL  / RLS_ADMIN_PASSWORD    a Platform admin (optional)
 *
 * The member users must not hold Platform admin authority: the policies grant admins
 * global read on purpose, so using an admin as the "member" would mask exactly the
 * cross-organization isolation these tests exist to prove.
 *
 * Exits non-zero if any proof fails.
 */

const BASE = process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL?.replace(/\/$/, "");
const ANON = process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY;

if (!BASE || !ANON) {
  console.error("Set NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL and _ANON_KEY.");
  process.exit(2);
}

async function call(path, { method = "GET", body, token, prefer } = {}) {
  const headers = {
    apikey: ANON,
    Authorization: `Bearer ${token ?? ANON}`,
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text.trim() ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed };
}

async function signIn(email, password) {
  const { status, body } = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password },
  });
  if (status !== 200) throw new Error(`sign-in failed for ${email}: HTTP ${status}`);
  return body.access_token;
}

/** A write is correctly refused when the verb is denied outright, or filters to nothing. */
function isRefused({ status, body }) {
  if (status === 401 || status === 403 || status === 404) return true;
  if (body && typeof body === "object" && !Array.isArray(body) && body.code === "42501") return true;
  return Array.isArray(body) && body.length === 0;
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (detail) console.log(`        ${detail}`);
}

async function main() {
  const tokenA = await signIn(process.env.RLS_USER_A_EMAIL, process.env.RLS_USER_A_PASSWORD);
  const tokenB = await signIn(process.env.RLS_USER_B_EMAIL, process.env.RLS_USER_B_PASSWORD);

  const orgsA = await call("/rest/v1/organizations?select=id,slug", { token: tokenA });
  const orgsB = await call("/rest/v1/organizations?select=id,slug", { token: tokenB });
  const visibleA = (orgsA.body ?? []).map((o) => o.slug).sort();
  const visibleB = (orgsB.body ?? []).map((o) => o.slug).sort();

  record("member reads exactly one own org", visibleA.length === 1, `A sees ${JSON.stringify(visibleA)}`);
  record(
    "member cannot read foreign org",
    visibleA.length > 0 && visibleB.length > 0 && visibleA[0] !== visibleB[0] &&
      !visibleA.some((s) => visibleB.includes(s)),
    `A=${JSON.stringify(visibleA)} B=${JSON.stringify(visibleB)} disjoint`,
  );

  const eventsA = await call("/rest/v1/events?select=slug", { token: tokenA });
  const eventsB = await call("/rest/v1/events?select=slug", { token: tokenB });
  const evA = (eventsA.body ?? []).map((e) => e.slug).sort();
  const evB = (eventsB.body ?? []).map((e) => e.slug).sort();
  record("member reads permitted events", evA.length > 0, `A sees ${JSON.stringify(evA)}`);
  record("cross-org event access fails", !evA.some((s) => evB.includes(s)), `A=${JSON.stringify(evA)} B=${JSON.stringify(evB)}`);

  const orgA = orgsA.body?.[0]?.id;
  const foreignOrg = orgsB.body?.[0]?.id;

  record(
    "member cannot mutate membership",
    isRefused(await call("/rest/v1/organization_memberships", {
      method: "POST", token: tokenA, prefer: "return=representation",
      body: [{ organization_id: foreignOrg, role: "ADMIN" }],
    })),
    "insert into organization_memberships refused",
  );

  record(
    "member cannot grant entitlement",
    isRefused(await call("/rest/v1/organization_product_entitlements", {
      method: "POST", token: tokenA, prefer: "return=representation",
      body: [{ organization_id: orgA, product_key: "housing" }],
    })),
    "insert into organization_product_entitlements refused",
  );

  record(
    "member cannot self-promote to Platform admin",
    isRefused(await call("/rest/v1/platform_admins", {
      method: "POST", token: tokenA, prefer: "return=representation", body: [{}],
    })),
    "insert into platform_admins refused",
  );

  record(
    "anon cannot read Platform Core data",
    isRefused(await call("/rest/v1/organizations?select=slug")),
    "unauthenticated select refused or empty",
  );

  // Platform admin visibility is deliberate, not a leak: the policies read
  // `is_org_member(id) OR is_platform_admin()`. Assert it explicitly so the grant is
  // proven intentional rather than discovered later as a surprise.
  if (process.env.RLS_ADMIN_EMAIL && process.env.RLS_ADMIN_PASSWORD) {
    const tokenAdmin = await signIn(process.env.RLS_ADMIN_EMAIL, process.env.RLS_ADMIN_PASSWORD);
    const adminOrgs = await call("/rest/v1/organizations?select=slug", { token: tokenAdmin });
    const seen = (adminOrgs.body ?? []).map((o) => o.slug).sort();
    record(
      "Platform admin reads every organization by design",
      seen.length >= Math.max(visibleA.length, visibleB.length) &&
        visibleA.every((s) => seen.includes(s)) && visibleB.every((s) => seen.includes(s)),
      `admin sees ${JSON.stringify(seen)}`,
    );

    // Admin authority must still not confer write access through the data API.
    record(
      "Platform admin still cannot write the registry through PostgREST",
      isRefused(await call("/rest/v1/platform_admins", {
        method: "POST", token: tokenAdmin, prefer: "return=representation", body: [{}],
      })),
      "writes remain service-role only, even for admins",
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n  RLS PROOFS: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`  verification error: ${error.message}`);
  process.exit(2);
});
