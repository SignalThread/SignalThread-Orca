/**
 * Platform Core migration, Phase 2 — access behaviour against a real database.
 *
 * The cutover suite pins configuration and wiring. This one exercises the resolver itself:
 * who gets in, who is refused, and what the request path is allowed to write (nothing).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { EventMemberRole, UserRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { EventAccessError, assertEventAccessForUser, resolveEventAccessForUser } from "@/lib/event-access";
import { resolveAppUserByPlatformIdentity } from "@/lib/platform/identity";
import { resolveOrcaEntitlement } from "@/lib/platform/entitlements";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed Phase 2 access tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

const MANAGED_ENV = ["NODE_ENV", "PLATFORM_ENTITLEMENT_MODE", "PLATFORM_IDENTITY_EMAIL_BRIDGE"] as const;

function applyEnv(overrides: Record<string, string | undefined>): Map<string, string | undefined> {
  const previous = new Map<string, string | undefined>();
  for (const key of MANAGED_ENV) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key as string] = value;
  }
  return previous;
}

function restoreEnv(previous: Map<string, string | undefined>): void {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key as string] = value;
  }
}

/** Async variant: a sync helper would restore NODE_ENV before an awaited call resolved. */
async function withNodeEnvAsync<T>(value: string, run: () => Promise<T>): Promise<T> {
  const previous = applyEnv({ NODE_ENV: value });
  try {
    return await run();
  } finally {
    restoreEnv(previous);
  }
}

/**
 * Pin the entitlement mode for one assertion.
 *
 * `resolveEntitlementMode()` reads `PLATFORM_ENTITLEMENT_MODE` at call time and falls back to
 * `migration` outside production. The repository `.env.local` sets `claims`, which is the
 * intended production posture, so a test that left the mode ambient would assert a different
 * branch depending on whether that file happened to be loaded. Tests that pass `claims: null`
 * are mode-sensitive and must say which branch they exercise.
 */
function withEntitlementMode<T>(mode: string, run: () => T): T {
  const previous = applyEnv({ PLATFORM_ENTITLEMENT_MODE: mode });
  try {
    return run();
  } finally {
    restoreEnv(previous);
  }
}

function withNodeEnv<T>(value: string, run: () => T): T {
  const previous = applyEnv({ NODE_ENV: value });
  try {
    return run();
  } finally {
    restoreEnv(previous);
  }
}

async function countMemberships(userId: string): Promise<number> {
  return getPrisma().membership.count({ where: { userId } });
}

// --- Linked Platform user resolves and is entitled ------------------------------

test("a linked Platform user with provisioned access resolves and is entitled", async (t) => {
  const harness = createHarnessOrSkip(t, "phase2-linked-entitled");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const owner = roles.owner;
    const platformUserId = randomUUID();
    await getPrisma().user.update({ where: { id: owner.user.id }, data: { platformUserId } });

    const resolution = await resolveAppUserByPlatformIdentity({ platformUserId, email: null });
    assert.equal(resolution.status, "RESOLVED");
    if (resolution.status !== "RESOLVED") return;
    assert.equal(resolution.appUser.id, owner.user.id);
    assert.equal(resolution.linkMode, "CANONICAL");

    const entitlement = resolveOrcaEntitlement({
      claims: { version: 1, access: [], legacy: false, platformAdmin: false, developmentBypass: true },
      subject: {
        platformUserId: resolution.appUser.platformUserId,
        hasProvisionedOrcaAccess: (await countMemberships(owner.user.id)) > 0,
      },
    });
    assert.equal(entitlement.status, "GRANTED");
    if (entitlement.status !== "GRANTED") return;
    assert.equal(entitlement.source, "platform-claims");
  } finally {
    await harness.cleanup();
  }
});

// --- Authenticated but not entitled ---------------------------------------------

test("an authenticated Platform user without Orca entitlement is rejected", async (t) => {
  const harness = createHarnessOrSkip(t, "phase2-no-entitlement");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const owner = roles.owner;
    const platformUserId = randomUUID();
    await getPrisma().user.update({ where: { id: owner.user.id }, data: { platformUserId } });

    // The identity resolves perfectly well — entitlement is a separate decision.
    const resolution = await resolveAppUserByPlatformIdentity({ platformUserId, email: null });
    assert.equal(resolution.status, "RESOLVED");

    const membershipCount = await countMemberships(owner.user.id);
    assert.equal(membershipCount > 0, true, "this user really does have Orca membership");

    const entitlement = resolveOrcaEntitlement({
      claims: { version: 1, access: [], legacy: false, platformAdmin: false },
      subject: { platformUserId, hasProvisionedOrcaAccess: membershipCount > 0 },
    });
    assert.equal(entitlement.status, "DENIED");
    if (entitlement.status !== "DENIED") return;
    assert.equal(entitlement.reason, "PLATFORM_ENTITLEMENT_MISSING_PRODUCT");
  } finally {
    await harness.cleanup();
  }
});

test("in production, a linked and provisioned user without claims is still refused", async (t) => {
  const harness = createHarnessOrSkip(t, "phase2-prod-fail-closed");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const owner = roles.owner;
    const platformUserId = randomUUID();
    await getPrisma().user.update({ where: { id: owner.user.id }, data: { platformUserId } });
    const membershipCount = await countMemberships(owner.user.id);

    const decision = withNodeEnv("production", () =>
      resolveOrcaEntitlement({
        claims: null,
        subject: { platformUserId, hasProvisionedOrcaAccess: membershipCount > 0 },
      }),
    );

    assert.equal(decision.status, "DENIED");
    if (decision.status !== "DENIED") return;
    assert.equal(decision.reason, "PLATFORM_ENTITLEMENT_UNAVAILABLE");
  } finally {
    await harness.cleanup();
  }
});

// --- Unknown Platform users are not provisioned ---------------------------------

test("an unknown Platform identity is not auto-provisioned into Orca", async (t) => {
  const harness = createHarnessOrSkip(t, "phase2-no-autoprovision");
  if (!harness) return;

  try {
    // Scope the assertion to this identity: a global user count races with the other
    // suites creating and cleaning up fixtures in the same database.
    const platformUserId = randomUUID();
    const email = `phase2-stranger-${randomUUID().slice(0, 8)}@planner.test`;

    const resolution = await resolveAppUserByPlatformIdentity({ platformUserId, email });

    assert.equal(resolution.status, "NOT_FOUND");
    assert.equal(
      await getPrisma().user.count({ where: { OR: [{ email }, { platformUserId }] } }),
      0,
      "no user row may be created for an unknown Platform identity",
    );
  } finally {
    await harness.cleanup();
  }
});

test("a user with no membership is denied and gains none as a side effect", async (t) => {
  const harness = createHarnessOrSkip(t, "phase2-no-implicit-tenancy");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    // A user row whose orgId points at a real org but with no Membership: exactly the
    // shape the old ensureMembershipForUser would have silently promoted.
    const orphan = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });
    const platformUserId = randomUUID();
    await getPrisma().user.update({ where: { id: orphan.id }, data: { platformUserId } });

    assert.equal(await countMemberships(orphan.id), 0);

    // Migration mode is the branch under test: entry requires Orca access a human already
    // provisioned, so an orphan row is denied without being silently promoted.
    const decision = withEntitlementMode("migration", () =>
      resolveOrcaEntitlement({
        claims: null,
        subject: { platformUserId, hasProvisionedOrcaAccess: false },
      }),
    );
    assert.equal(decision.status, "DENIED");
    if (decision.status !== "DENIED") return;
    assert.equal(decision.reason, "ORCA_ACCESS_NOT_PROVISIONED");

    assert.equal(await countMemberships(orphan.id), 0, "denial must not create membership");
    const reread = await getPrisma().user.findUnique({
      where: { id: orphan.id },
      select: { orgId: true },
    });
    assert.equal(reread?.orgId, organization.id, "User.orgId must not be rewritten");
  } finally {
    await harness.cleanup();
  }
});

// --- Email is no longer an identity in production --------------------------------

test("email alone cannot resolve an identity once the bridge is retired", async (t) => {
  const harness = createHarnessOrSkip(t, "phase2-bridge-retired");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const user = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });

    // Production default: no email bridge.
    const resolution = await withNodeEnvAsync("production", () =>
      resolveAppUserByPlatformIdentity({ platformUserId: randomUUID(), email: user.email }),
    );
    assert.equal(resolution.status, "NOT_FOUND");

    const reread = await getPrisma().user.findUnique({
      where: { id: user.id },
      select: { platformUserId: true },
    });
    assert.equal(reread?.platformUserId, null, "nothing may be linked while the bridge is off");
  } finally {
    await harness.cleanup();
  }
});

test("a different Platform user sharing an email never inherits the Orca identity", async (t) => {
  const harness = createHarnessOrSkip(t, "phase2-email-collision");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const user = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });
    const ownerPlatformUserId = randomUUID();
    await getPrisma().user.update({
      where: { id: user.id },
      data: { platformUserId: ownerPlatformUserId },
    });

    // Even with the bridge explicitly enabled, a second Platform identity with the same
    // address is refused rather than taking over the row.
    const previous = process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE;
    process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE = "true";
    try {
      const resolution = await resolveAppUserByPlatformIdentity({
        platformUserId: randomUUID(),
        email: user.email,
      });
      assert.equal(resolution.status, "CONFLICT");
      if (resolution.status !== "CONFLICT") return;
      assert.equal(resolution.reason, "PLATFORM_IDENTITY_CONFLICT");
    } finally {
      if (previous === undefined) delete process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE;
      else process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE = previous;
    }

    const reread = await getPrisma().user.findUnique({
      where: { id: user.id },
      select: { platformUserId: true },
    });
    assert.equal(reread?.platformUserId, ownerPlatformUserId, "the original link is untouched");
  } finally {
    await harness.cleanup();
  }
});

// --- Orca RBAC is unchanged by the cutover ----------------------------------------

test("Orca event and role denials survive the auth cutover", async (t) => {
  const harness = createHarnessOrSkip(t, "phase2-rbac-preserved");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();

    // Entitled at the Platform level, and linked — Orca still decides the rest.
    for (const roleUser of [roles.eventViewer, roles.unrelatedSameOrgMember, roles.unrelatedOtherOrgMember]) {
      await getPrisma().user.update({
        where: { id: roleUser.user.id },
        data: { platformUserId: randomUUID() },
      });
    }

    // Cross-organization access is still refused.
    const outsider = await resolveEventAccessForUser(roles.event.id, roles.unrelatedOtherOrgMember.accessUser);
    assert.equal(outsider.canView, false);
    assert.equal(outsider.reason, "EVENT_OUTSIDE_ACTIVE_ORG");

    // Same org, no event membership, is still refused.
    const orgOnly = await resolveEventAccessForUser(roles.event.id, roles.unrelatedSameOrgMember.accessUser);
    assert.equal(orgOnly.canView, false);
    assert.equal(orgOnly.reason, "EVENT_MEMBERSHIP_REQUIRED");

    // EventMemberRole still separates read from write.
    const viewer = await assertEventAccessForUser(roles.event.id, roles.eventViewer.accessUser, "read");
    assert.equal(viewer.canView, true);
    assert.equal(viewer.canEdit, false);
    assert.equal(viewer.eventRole, EventMemberRole.EVENT_VIEWER);

    await assert.rejects(
      () => assertEventAccessForUser(roles.event.id, roles.eventViewer.accessUser, "write"),
      (error: unknown) =>
        error instanceof EventAccessError && error.reason === "EVENT_EDITOR_ROLE_REQUIRED",
    );
  } finally {
    await harness.cleanup();
  }
});

test("Platform entitlement does not substitute for Orca event access", async (t) => {
  const harness = createHarnessOrSkip(t, "phase2-entitlement-not-authorization");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const outsider = roles.unrelatedOtherOrgMember;
    const platformUserId = randomUUID();
    await getPrisma().user.update({ where: { id: outsider.user.id }, data: { platformUserId } });

    // Fully entitled to Orca by Platform Core, including an organization claim naming the
    // event's organization. Orca authorization is still the decider.
    const entitlement = resolveOrcaEntitlement({
      claims: { version: 1, access: [roles.organization.id].map((organizationId: string) => ({ organizationId, organizationRole: "MEMBER", products: ["orca"] })), legacy: false, platformAdmin: false },
      subject: {
        platformUserId,
        hasProvisionedOrcaAccess: (await countMemberships(outsider.user.id)) > 0,
      },
    });
    assert.equal(entitlement.status, "GRANTED");

    const decision = await resolveEventAccessForUser(roles.event.id, outsider.accessUser);
    assert.equal(decision.canView, false);
    assert.equal(decision.reason, "EVENT_OUTSIDE_ACTIVE_ORG");
  } finally {
    await harness.cleanup();
  }
});
