import assert from "node:assert/strict";
import test from "node:test";

/**
 * Claim-shape contract tests.
 *
 * These assert the wire format Orca parses, without reaching Platform Core: the
 * live derivation is exercised separately by `scripts/sync-claims.mjs --dry-run`.
 * The shape is what both sides agree on, so it is worth pinning independently.
 */

const CLAIM_VERSION = 1;

type OrgAccessClaim = { organization_id: string; organization_role: string; products: string[] };

/** Mirrors the derivation in lib/server/claims.ts against in-memory registry rows. */
function deriveAccess(
  memberships: { organization_id: string; role: string; status: string; orgStatus: string }[],
  entitlements: { organization_id: string; product_key: string; status: string }[],
): OrgAccessClaim[] {
  const active = memberships.filter((m) => m.status === "ACTIVE" && m.orgStatus === "ACTIVE");
  const byOrg = new Map<string, string[]>();
  for (const e of entitlements.filter((x) => x.status === "ACTIVE")) {
    const list = byOrg.get(e.organization_id) ?? [];
    list.push(e.product_key.toLowerCase());
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

const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";

test("a member of an entitled org and a non-entitled org gets both, distinguished by products", () => {
  const access = deriveAccess(
    [
      { organization_id: ORG_A, role: "ADMIN", status: "ACTIVE", orgStatus: "ACTIVE" },
      { organization_id: ORG_B, role: "MEMBER", status: "ACTIVE", orgStatus: "ACTIVE" },
    ],
    [{ organization_id: ORG_A, product_key: "orca", status: "ACTIVE" }],
  );
  assert.deepEqual(access, [
    { organization_id: ORG_A, organization_role: "ADMIN", products: ["orca"] },
    // Present with no products: member, but the org holds no entitlement. This is
    // what lets Orca tell "not a member" apart from "not entitled".
    { organization_id: ORG_B, organization_role: "MEMBER", products: [] },
  ]);
});

test("suspended memberships and suspended orgs contribute nothing", () => {
  assert.deepEqual(
    deriveAccess(
      [{ organization_id: ORG_A, role: "ADMIN", status: "SUSPENDED", orgStatus: "ACTIVE" }],
      [{ organization_id: ORG_A, product_key: "orca", status: "ACTIVE" }],
    ),
    [],
  );
  assert.deepEqual(
    deriveAccess(
      [{ organization_id: ORG_A, role: "ADMIN", status: "ACTIVE", orgStatus: "SUSPENDED" }],
      [{ organization_id: ORG_A, product_key: "orca", status: "ACTIVE" }],
    ),
    [],
  );
});

test("a suspended entitlement leaves the org present but unentitled", () => {
  assert.deepEqual(
    deriveAccess(
      [{ organization_id: ORG_A, role: "ADMIN", status: "ACTIVE", orgStatus: "ACTIVE" }],
      [{ organization_id: ORG_A, product_key: "orca", status: "SUSPENDED" }],
    ),
    [{ organization_id: ORG_A, organization_role: "ADMIN", products: [] }],
  );
});

test("derivation is deterministic regardless of row order", () => {
  const rowsA = [
    { organization_id: ORG_B, role: "MEMBER", status: "ACTIVE", orgStatus: "ACTIVE" },
    { organization_id: ORG_A, role: "ADMIN", status: "ACTIVE", orgStatus: "ACTIVE" },
  ];
  const ents = [
    { organization_id: ORG_A, product_key: "ORCA", status: "ACTIVE" },
    { organization_id: ORG_A, product_key: "orca", status: "ACTIVE" },
  ];
  const first = deriveAccess(rowsA, ents);
  const second = deriveAccess([...rowsA].reverse(), [...ents].reverse());
  assert.deepEqual(first, second, "same registry state must yield byte-identical claims");
  // Duplicate/differently-cased product keys collapse to one lowercase entry.
  assert.deepEqual(first[0].products, ["orca"]);
});

test("the claim envelope carries a version and no event ids", () => {
  const claim = {
    v: CLAIM_VERSION,
    access: deriveAccess(
      [{ organization_id: ORG_A, role: "ADMIN", status: "ACTIVE", orgStatus: "ACTIVE" }],
      [{ organization_id: ORG_A, product_key: "orca", status: "ACTIVE" }],
    ),
    platform_admin: false,
    synced_at: "2026-08-25T12:00:00.000Z",
  };
  assert.equal(claim.v, 1);
  const serialized = JSON.stringify(claim);
  assert.equal(serialized.includes("event"), false, "event ids must never enter the JWT");
  assert.ok(serialized.includes("synced_at"), "the derivation stamp drives staleness handling");
});
