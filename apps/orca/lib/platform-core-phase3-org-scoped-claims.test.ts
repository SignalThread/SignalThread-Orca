import assert from "node:assert/strict";
import test from "node:test";
import {
  assessClaimFreshness,
  createDevelopmentEntitlementClaims,
  readEntitlementClaims,
  resolveOrcaEntitlement,
  restrictOrganizationsToPlatformClaims,
  type PlatformEntitlementClaims,
} from "./platform/entitlements";

/**
 * LOOP 3 security gate: entitlement is decided per organization.
 *
 * The flat contract (`products[]` + `organizations[]`) could not express "entitled in
 * org A but not in org B" for one user. Reading it, Orca granted the product whenever
 * `products` contained it and then used *every* named organization as the ceiling --
 * so an entitlement held by one organization produced a ceiling covering all of them.
 * These tests pin the org-scoped replacement and the rules that keep the legacy shape
 * from widening anything.
 */

const ORG_A = "11111111-1111-4111-8111-111111111111"; // entitled to Orca
const ORG_B = "22222222-2222-4222-8222-222222222222"; // member, not entitled
const ORG_FOREIGN = "33333333-3333-4333-8333-333333333333"; // not a member at all

const MANAGED = [
  "NODE_ENV",
  "PLATFORM_ENTITLEMENT_MODE",
  "PLATFORM_PRODUCT_KEY",
  "PLATFORM_CLAIM_MAX_AGE_SECONDS",
] as const;

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of MANAGED) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key as string] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key as string] = value;
    }
  }
}

/** The canonical claim Platform Core issues for a user in both organizations. */
const STRUCTURED = {
  signalthread: {
    v: 1,
    access: [
      { organization_id: ORG_A, organization_role: "ADMIN", products: ["orca"] },
      { organization_id: ORG_B, organization_role: "MEMBER", products: [] },
    ],
    platform_admin: false,
    synced_at: "2026-08-25T12:00:00.000Z",
  },
};

const SUBJECT = { platformUserId: "user-1", hasProvisionedOrcaAccess: true };

function claims(): PlatformEntitlementClaims {
  return readEntitlementClaims(STRUCTURED);
}

// 1. user in org A with Orca -> allowed in A
test("a user entitled in organization A is granted there", () => {
  withEnv({ PLATFORM_ENTITLEMENT_MODE: "claims" }, () => {
    const decision = resolveOrcaEntitlement({ claims: claims(), subject: SUBJECT, organizationId: ORG_A });
    assert.equal(decision.status, "GRANTED");
    if (decision.status !== "GRANTED") return;
    assert.deepEqual(decision.organizationIds, [ORG_A]);
    assert.equal(decision.source, "platform-claims");
  });
});

// 2. same user in org B without Orca -> denied in B
test("the same user is denied in organization B, which holds no entitlement", () => {
  withEnv({ PLATFORM_ENTITLEMENT_MODE: "claims" }, () => {
    const decision = resolveOrcaEntitlement({ claims: claims(), subject: SUBJECT, organizationId: ORG_B });
    assert.equal(decision.status, "DENIED");
    if (decision.status !== "DENIED") return;
    // Distinct from "not a member": the remedy is an entitlement, not a membership.
    assert.equal(decision.reason, "PLATFORM_PRODUCT_NOT_ENTITLED");
  });
});

// 4. wrong / foreign org denied
test("an organization the claim never names is denied as non-membership", () => {
  withEnv({ PLATFORM_ENTITLEMENT_MODE: "claims" }, () => {
    const decision = resolveOrcaEntitlement({ claims: claims(), subject: SUBJECT, organizationId: ORG_FOREIGN });
    assert.equal(decision.status, "DENIED");
    if (decision.status !== "DENIED") return;
    assert.equal(decision.reason, "PLATFORM_ORG_NOT_MEMBER");
  });
});

test("the entry gate grants only the entitled organizations as the ceiling", () => {
  withEnv({ PLATFORM_ENTITLEMENT_MODE: "claims" }, () => {
    const decision = resolveOrcaEntitlement({ claims: claims(), subject: SUBJECT });
    assert.equal(decision.status, "GRANTED");
    if (decision.status !== "GRANTED") return;
    // The regression this pins: org B must not appear merely because the user belongs to it.
    assert.deepEqual(decision.organizationIds, [ORG_A]);
  });
});

test("the organization ceiling excludes an organization without the entitlement", () => {
  withEnv({ PLATFORM_ENTITLEMENT_MODE: "claims" }, () => {
    const restriction = restrictOrganizationsToPlatformClaims({
      accessibleOrgIds: [ORG_A, ORG_B],
      claims: claims(),
    });
    assert.equal(restriction.status, "RESTRICTED");
    if (restriction.status !== "RESTRICTED") return;
    assert.deepEqual(restriction.orgIds, [ORG_A]);
  });
});

// 3. flat legacy product claim cannot widen B
test("a legacy flat claim cannot widen an organization that the structured claim excludes", () => {
  withEnv({ PLATFORM_ENTITLEMENT_MODE: "claims" }, () => {
    // Both shapes present, and the legacy arrays are deliberately more generous.
    const mixed = readEntitlementClaims({
      signalthread: {
        ...STRUCTURED.signalthread,
        products: ["orca"],
        organizations: [ORG_A, ORG_B, ORG_FOREIGN],
      },
    });
    assert.equal(mixed?.legacy, false, "structured contract must win when present");

    const inB = resolveOrcaEntitlement({ claims: mixed, subject: SUBJECT, organizationId: ORG_B });
    assert.equal(inB.status, "DENIED");

    const inForeign = resolveOrcaEntitlement({ claims: mixed, subject: SUBJECT, organizationId: ORG_FOREIGN });
    assert.equal(inForeign.status, "DENIED");

    const ceiling = restrictOrganizationsToPlatformClaims({
      accessibleOrgIds: [ORG_A, ORG_B, ORG_FOREIGN],
      claims: mixed,
    });
    assert.equal(ceiling.status, "RESTRICTED");
    if (ceiling.status !== "RESTRICTED") return;
    assert.deepEqual(ceiling.orgIds, [ORG_A], "legacy arrays must not add organizations");
  });
});

test("a legacy-only claim stays scoped to the organizations it names", () => {
  withEnv({ PLATFORM_ENTITLEMENT_MODE: "claims" }, () => {
    const legacy = readEntitlementClaims({
      signalthread: { products: ["orca"], organizations: [ORG_A] },
    });
    assert.equal(legacy?.legacy, true);
    assert.equal(
      resolveOrcaEntitlement({ claims: legacy, subject: SUBJECT, organizationId: ORG_A }).status,
      "GRANTED",
    );
    assert.equal(
      resolveOrcaEntitlement({ claims: legacy, subject: SUBJECT, organizationId: ORG_B }).status,
      "DENIED",
    );
  });
});

// 5. removed entitlement denied after refresh
test("revoking the entitlement denies the organization once the claim is refreshed", () => {
  withEnv({ PLATFORM_ENTITLEMENT_MODE: "claims" }, () => {
    const before = claims();
    assert.equal(
      resolveOrcaEntitlement({ claims: before, subject: SUBJECT, organizationId: ORG_A }).status,
      "GRANTED",
    );

    // Platform Core re-derives after the entitlement is revoked: org A remains in the
    // claim because membership is unchanged, but with no products.
    const after = readEntitlementClaims({
      signalthread: {
        v: 1,
        access: [
          { organization_id: ORG_A, organization_role: "ADMIN", products: [] },
          { organization_id: ORG_B, organization_role: "MEMBER", products: [] },
        ],
        platform_admin: false,
        synced_at: "2026-08-25T13:00:00.000Z",
      },
    });
    const decision = resolveOrcaEntitlement({ claims: after, subject: SUBJECT, organizationId: ORG_A });
    assert.equal(decision.status, "DENIED");
    if (decision.status !== "DENIED") return;
    assert.equal(decision.reason, "PLATFORM_PRODUCT_NOT_ENTITLED");
  });
});

// 7. Platform admin derived only from canonical authority
test("Platform admin authority comes only from the canonical structured claim", () => {
  assert.equal(readEntitlementClaims(STRUCTURED)?.platformAdmin, false);

  const admin = readEntitlementClaims({
    signalthread: { ...STRUCTURED.signalthread, platform_admin: true },
  });
  assert.equal(admin?.platformAdmin, true);

  // A legacy claim can never confer it, however it is dressed up.
  const forged = readEntitlementClaims({
    signalthread: { products: ["orca"], organizations: [ORG_A], platform_admin: true },
  });
  assert.equal(forged?.legacy, true);
  assert.equal(forged?.platformAdmin, false, "legacy claims must never confer admin authority");
});

test("no event ids appear anywhere in the claim contract", () => {
  const parsed = readEntitlementClaims({
    signalthread: { ...STRUCTURED.signalthread, events: ["evt-1", "evt-2"] },
  });
  assert.ok(parsed);
  assert.equal("events" in (parsed as object), false, "the parsed claim must carry no event ids");
  const serialized = JSON.stringify(parsed);
  assert.equal(serialized.includes("evt-1"), false);
});

test("the development bypass cannot grant entry in production", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    assert.equal(createDevelopmentEntitlementClaims(), null, "no bypass claim exists in production");
  });
  // Even a forged marker is refused in a production build.
  withEnv({ NODE_ENV: "production", PLATFORM_ENTITLEMENT_MODE: "claims" }, () => {
    const forged: PlatformEntitlementClaims = {
      version: 1, access: [], legacy: false, platformAdmin: false, developmentBypass: true,
    };
    assert.equal(resolveOrcaEntitlement({ claims: forged, subject: SUBJECT }).status, "DENIED");
  });
});

// 6. Claim refresh / staleness after app_metadata changes.
test("claim freshness is bounded only when a deployment asks for it", () => {
  const fresh = readEntitlementClaims({
    signalthread: { ...STRUCTURED.signalthread, synced_at: "2026-08-25T12:00:00.000Z" },
  });
  const now = new Date("2026-08-25T12:30:00.000Z"); // 30 minutes later

  // No bound configured: the token lifetime governs, and nothing is called stale.
  withEnv({ PLATFORM_CLAIM_MAX_AGE_SECONDS: undefined }, () => {
    assert.equal(assessClaimFreshness(fresh, now).status, "UNKNOWN");
  });

  // A 60-minute bound: a 30-minute-old claim is still fresh.
  withEnv({ PLATFORM_CLAIM_MAX_AGE_SECONDS: "3600" }, () => {
    assert.equal(assessClaimFreshness(fresh, now).status, "FRESH");
  });

  // A 10-minute bound: the same claim is now stale and the user must refresh.
  withEnv({ PLATFORM_CLAIM_MAX_AGE_SECONDS: "600" }, () => {
    const verdict = assessClaimFreshness(fresh, now);
    assert.equal(verdict.status, "STALE");
    if (verdict.status !== "STALE") return;
    assert.equal(verdict.maxAgeSeconds, 600);
    assert.ok(verdict.ageSeconds >= 1800);
  });
});

test("a claim carrying no derivation stamp is never assumed fresh or expired", () => {
  withEnv({ PLATFORM_CLAIM_MAX_AGE_SECONDS: "600" }, () => {
    // Legacy claims have no synced_at at all.
    const legacy = readEntitlementClaims({
      signalthread: { products: ["orca"], organizations: [ORG_A] },
    });
    assert.equal(legacy?.syncedAt, null);
    assert.equal(assessClaimFreshness(legacy, new Date()).status, "UNKNOWN");

    const garbage = readEntitlementClaims({
      signalthread: { ...STRUCTURED.signalthread, synced_at: "not-a-date" },
    });
    assert.equal(assessClaimFreshness(garbage, new Date()).status, "UNKNOWN");
  });
});

test("the structured claim carries the derivation timestamp Platform Core wrote", () => {
  const parsed = readEntitlementClaims(STRUCTURED);
  assert.equal(parsed?.syncedAt, "2026-08-25T12:00:00.000Z");
});
