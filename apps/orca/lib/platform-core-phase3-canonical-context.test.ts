/**
 * Platform Core migration, Phase 3 — canonical organization/event context.
 *
 * Phase 3 adopted the Platform Core uuid *as* Orca's `Organization.id` and `Event.id`, with
 * no mapping table. That makes Platform organization claims directly comparable to Orca
 * rows for the first time, so they finally become authoritative.
 *
 * These tests pin the two properties that matter:
 *   - a Platform claim is a **ceiling, never a grant** — it can only narrow Orca access;
 *   - a client-supplied organization or event id can never widen it.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { UserRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  arePlatformOrganizationClaimsAuthoritative,
  restrictOrganizationsToPlatformClaims,
} from "@/lib/platform/entitlements";
import { resolvePlatformEventHandoff } from "@/lib/platform/event-context";
import { resolveOrganizationSelection } from "@/lib/organization-selection";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

const requestUserSource = readFileSync("lib/request-user.ts", "utf8");
const entryRouteSource = readFileSync("app/platform-entry/route.ts", "utf8");
const eventContextSource = readFileSync("lib/platform/event-context.ts", "utf8");
const adoptScriptSource = readFileSync("scripts/adopt-platform-canonical-ids.ts", "utf8");

const MANAGED_ENV = ["NODE_ENV", "PLATFORM_ORG_CLAIMS_AUTHORITATIVE"] as const;

function withEnv<T>(overrides: Partial<Record<(typeof MANAGED_ENV)[number], string>>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of MANAGED_ENV) {
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

function createHarnessOrSkip(t: TestContext, label: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed Phase 3 tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${label}-${randomUUID().slice(0, 8)}` });
}

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

// --- 1. Organization claims are now authoritative --------------------------------

test("Platform organization claims are authoritative by default, overridable explicitly", () => {
  withEnv({}, () => assert.equal(arePlatformOrganizationClaimsAuthoritative(), true));
  withEnv({ PLATFORM_ORG_CLAIMS_AUTHORITATIVE: "false" }, () =>
    assert.equal(arePlatformOrganizationClaimsAuthoritative(), false),
  );
  withEnv({ PLATFORM_ORG_CLAIMS_AUTHORITATIVE: "true" }, () =>
    assert.equal(arePlatformOrganizationClaimsAuthoritative(), true),
  );
});

test("a Platform organization claim narrows Orca access to the intersection", () => {
  withEnv({}, () => {
    const result = restrictOrganizationsToPlatformClaims({
      accessibleOrgIds: [ORG_A, ORG_B],
      claims: { version: 1, access: [ORG_A].map((organizationId: string) => ({ organizationId, organizationRole: "MEMBER", products: ["orca"] })), legacy: false, platformAdmin: false },
    });
    assert.equal(result.status, "RESTRICTED");
    if (result.status !== "RESTRICTED") return;
    assert.deepEqual(result.orgIds, [ORG_A]);
  });
});

test("a Platform claim can never GRANT an organization Orca does not already allow", () => {
  withEnv({}, () => {
    const unknownOrg = randomUUID();
    const result = restrictOrganizationsToPlatformClaims({
      accessibleOrgIds: [ORG_A],
      claims: { version: 1, access: [ORG_A, unknownOrg].map((organizationId: string) => ({ organizationId, organizationRole: "MEMBER", products: ["orca"] })), legacy: false, platformAdmin: false },
    });
    assert.equal(result.status, "RESTRICTED");
    if (result.status !== "RESTRICTED") return;
    // The claimed-but-unknown organization is absent: Orca product access is still required.
    assert.deepEqual(result.orgIds, [ORG_A]);
    assert.equal(result.orgIds.includes(unknownOrg), false);
  });
});

test("wrong organization: a claim naming only foreign organizations denies outright", () => {
  withEnv({}, () => {
    const result = restrictOrganizationsToPlatformClaims({
      accessibleOrgIds: [ORG_A],
      claims: { version: 1, access: [ORG_B].map((organizationId: string) => ({ organizationId, organizationRole: "MEMBER", products: ["orca"] })), legacy: false, platformAdmin: false },
    });
    assert.equal(result.status, "DENIED");
    if (result.status !== "DENIED") return;
    assert.equal(result.reason, "PLATFORM_ORGANIZATION_CONTEXT_MISMATCH");
  });
});

test("entitled but no organization claim fails closed in production only", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    const result = restrictOrganizationsToPlatformClaims({
      accessibleOrgIds: [ORG_A],
      claims: { version: 1, access: [], legacy: false, platformAdmin: false, developmentBypass: true },
    });
    assert.equal(result.status, "DENIED");
    if (result.status !== "DENIED") return;
    assert.equal(result.reason, "PLATFORM_ORGANIZATION_CLAIM_MISSING");
  });
  // Outside production the organization claim is simply not part of the fixture harness.
  withEnv({ NODE_ENV: "development" }, () => {
    const result = restrictOrganizationsToPlatformClaims({
      accessibleOrgIds: [ORG_A],
      claims: { version: 1, access: [], legacy: false, platformAdmin: false, developmentBypass: true },
    });
    assert.equal(result.status, "UNRESTRICTED");
  });
});

test("a tampered client organization id cannot widen access", () => {
  withEnv({}, () => {
    // Platform grants ORG_A only; Orca can reach both.
    const restriction = restrictOrganizationsToPlatformClaims({
      accessibleOrgIds: [ORG_A, ORG_B],
      claims: { version: 1, access: [ORG_A].map((organizationId: string) => ({ organizationId, organizationRole: "MEMBER", products: ["orca"] })), legacy: false, platformAdmin: false },
    });
    assert.equal(restriction.status, "RESTRICTED");
    if (restriction.status !== "RESTRICTED") return;

    // The attacker sets both org cookies to ORG_B. Selection happens strictly within the
    // restricted set, so the forged value cannot be chosen.
    const selection = resolveOrganizationSelection({
      accessibleOrgIds: restriction.orgIds,
      requestedOrgId: ORG_B,
      selectedOrgId: ORG_B,
    });
    assert.equal(selection.status, "OK");
    if (selection.status !== "OK") return;
    assert.equal(selection.activeOrgId, ORG_A, "must fall back to the only authorized org");
    assert.notEqual(selection.activeOrgId, ORG_B);
  });
});

test("the restriction is applied in exactly one place, before organization selection", () => {
  const builder = requestUserSource.slice(
    requestUserSource.indexOf("async function buildContextForResolvedAppUser"),
    requestUserSource.indexOf("async function resolveFromDevFallback"),
  );
  const restrictIndex = builder.indexOf("restrictOrganizationsToPlatformClaims(");
  const selectIndex = builder.indexOf("resolveOrganizationSelection(");
  assert.notEqual(restrictIndex, -1);
  assert.notEqual(selectIndex, -1);
  assert.equal(restrictIndex < selectIndex, true, "claims must narrow the set before selection");
  // The entry route consumes the resolver's set rather than recomputing it.
  assert.equal(entryRouteSource.includes("context.authorizedOrganizationIds"), true);
  assert.equal(
    entryRouteSource.includes("restrictOrganizationsToPlatformClaims("),
    false,
    "the ceiling must not be recomputed where it could drift",
  );
});

// --- 2. Canonical ids are adopted directly, with no mapping table ------------------

test("canonical ids are adopted as primary keys, never mapped", () => {
  assert.equal(adoptScriptSource.includes("id: args.organizationId"), true, "Organization.id = platform org id");
  assert.equal(adoptScriptSource.includes("id: args.eventId"), true, "Event.id = platform event id");
  assert.equal(adoptScriptSource.includes("platformUserId: args.platformUserId"), true);
  for (const mapping of ["platformOrganizationId", "orcaOrganizationId", "platformEventId", "mappingTable"]) {
    assert.equal(adoptScriptSource.includes(mapping), false, `no ${mapping} mapping column`);
  }
  // The script must never invent an organization or event id.
  assert.equal(adoptScriptSource.includes("randomUUID"), false, "ids come from Platform Core only");
});

test("Orca runtime never queries Platform Core's database", () => {
  for (const source of [eventContextSource, entryRouteSource]) {
    assert.equal(
      source.includes("PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY"),
      false,
      "runtime must not hold a Platform Core service-role key",
    );
    assert.equal(/postgres:\/\/|postgresql:\/\//.test(source), false, "no direct Platform DB connection");
  }
  assert.equal(eventContextSource.includes("getPrisma()"), true, "event lookup uses the Orca database");
});

// --- 3. Event handoff is validated server-side ------------------------------------

test("a malformed or missing event id is rejected before any lookup", async () => {
  for (const bad of [null, "", "not-a-uuid", "../../etc/passwd", "8e4def56"]) {
    const decision = await resolvePlatformEventHandoff({
      requestedEventId: bad,
      authorizedOrganizationIds: [ORG_A],
      user: { id: randomUUID(), orgId: ORG_A, role: UserRole.MEMBER },
    });
    assert.equal(decision.status, "DENIED");
    if (decision.status !== "DENIED") return;
    assert.equal(decision.reason, "INVALID_EVENT_ID");
    assert.equal(decision.httpStatus, 400);
  }
});

test("event handoff: allow, and deny every hostile variation", async (t) => {
  const harness = createHarnessOrSkip(t, "phase3-handoff");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const orgId = roles.organization.id;
    const eventId = roles.event.id;
    const admin = roles.owner; // org-level role: can view every event in the active org

    // Baseline: authorized organization + real event => ALLOW.
    const allowed = await resolvePlatformEventHandoff({
      requestedEventId: eventId,
      authorizedOrganizationIds: [orgId],
      user: admin.accessUser,
    });
    assert.equal(allowed.status, "ALLOWED");
    if (allowed.status !== "ALLOWED") return;
    assert.equal(allowed.eventId, eventId);
    assert.equal(allowed.organizationId, orgId);

    // Tampered event id: a well-formed uuid that is not a real event.
    const notFound = await resolvePlatformEventHandoff({
      requestedEventId: randomUUID(),
      authorizedOrganizationIds: [orgId],
      user: admin.accessUser,
    });
    assert.equal(notFound.status, "DENIED");
    if (notFound.status !== "DENIED") return;
    assert.equal(notFound.reason, "EVENT_NOT_FOUND");

    // A real event, but the session is not authorized for its organization.
    const foreign = await resolvePlatformEventHandoff({
      requestedEventId: eventId,
      authorizedOrganizationIds: [ORG_B],
      user: admin.accessUser,
    });
    assert.equal(foreign.status, "DENIED");
    if (foreign.status !== "DENIED") return;
    assert.equal(foreign.reason, "EVENT_OUTSIDE_AUTHORIZED_ORGANIZATION");
    assert.equal(foreign.httpStatus, 403);

    // No authorized organizations at all.
    const none = await resolvePlatformEventHandoff({
      requestedEventId: eventId,
      authorizedOrganizationIds: [],
      user: admin.accessUser,
    });
    assert.equal(none.status, "DENIED");
  } finally {
    await harness.cleanup();
  }
});

test("a user from another organization cannot enter an event even with both orgs authorized", async (t) => {
  const harness = createHarnessOrSkip(t, "phase3-cross-org");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const outsider = roles.unrelatedOtherOrgMember; // belongs to a different organization

    // The strongest form of the check: pretend Platform Core authorized BOTH organizations
    // for this session. Platform-level organization authorization is still not event
    // access — Orca requires its own membership in the event's organization.
    const decision = await resolvePlatformEventHandoff({
      requestedEventId: roles.event.id,
      authorizedOrganizationIds: [roles.organization.id, outsider.accessUser.orgId!],
      user: outsider.accessUser,
    });

    assert.equal(decision.status, "DENIED");
    if (decision.status !== "DENIED") return;
    assert.equal(decision.reason, "EVENT_MEMBERSHIP_REQUIRED");
    assert.equal(decision.httpStatus, 403);
  } finally {
    await harness.cleanup();
  }
});

// --- 4. Platform context cannot bypass Orca product RBAC --------------------------

test("Platform authorization does not override Orca EventMemberRole", async (t) => {
  const harness = createHarnessOrSkip(t, "phase3-rbac");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const orgId = roles.organization.id;

    // A user with an Orca event role of VIEWER, fully authorized at the Platform level.
    const viewer = roles.eventViewer;
    const decision = await resolvePlatformEventHandoff({
      requestedEventId: roles.event.id,
      authorizedOrganizationIds: [orgId],
      user: viewer.accessUser,
    });
    assert.equal(decision.status, "ALLOWED", "a viewer may enter the event");
    if (decision.status !== "ALLOWED") return;
    // ...but Orca's own role still says read-only. Platform never grants write.
    assert.equal(decision.canEdit, false, "EventMemberRole still decides write access");

    // A user in the same organization with no event membership cannot enter at all,
    // despite full Platform organization authorization.
    const orgOnly = roles.unrelatedSameOrgMember;
    const denied = await resolvePlatformEventHandoff({
      requestedEventId: roles.event.id,
      authorizedOrganizationIds: [orgId],
      user: orgOnly.accessUser,
    });
    assert.equal(denied.status, "DENIED");
    if (denied.status !== "DENIED") return;
    assert.equal(denied.reason, "EVENT_MEMBERSHIP_REQUIRED");
  } finally {
    await harness.cleanup();
  }
});

// --- 5. Identity is never merged by email ------------------------------------------

test("the adoption script refuses to merge two identities or re-point a linked one", () => {
  assert.equal(
    adoptScriptSource.includes("Refusing to merge identities"),
    true,
    "same email + different platform user id must not merge",
  );
  assert.equal(
    adoptScriptSource.includes("Refusing to re-point identity"),
    true,
    "an already-linked email must not be re-pointed at a different platform user",
  );
  assert.equal(
    adoptScriptSource.includes("already exists under a different organization"),
    true,
    "a canonical event id must not be moved between organizations",
  );
});

test("Orca still keeps a local User.id distinct from the Platform user id", async (t) => {
  const harness = createHarnessOrSkip(t, "phase3-local-user-id");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const user = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });
    const platformUserId = randomUUID();
    await getPrisma().user.update({ where: { id: user.id }, data: { platformUserId } });

    const reread = await getPrisma().user.findUnique({
      where: { id: user.id },
      select: { id: true, platformUserId: true },
    });
    assert.equal(reread?.platformUserId, platformUserId);
    assert.notEqual(reread?.id, platformUserId, "Orca keeps its own local user id");
  } finally {
    await harness.cleanup();
  }
});

// --- 6. User.orgId is no longer access truth ----------------------------------------

test("User.orgId does not authorize organization access", () => {
  // Access comes from Membership (via listAccessibleOrganizationsForUser) narrowed by
  // Platform claims — never from the User.orgId column.
  const accessible = requestUserSource.slice(
    requestUserSource.indexOf("export async function listAccessibleOrganizationsForUser"),
    requestUserSource.indexOf("* `DEFAULT_ORG_ID` is retired"),
  );
  assert.equal(accessible.includes("membership.findMany") || accessible.includes("listMemberships("), true);
  assert.equal(accessible.includes("appUser.orgId"), false, "accessibility must not read User.orgId");

  // The single remaining read is the development-only no-membership bypass.
  const orgIdReads = [...requestUserSource.matchAll(/appUser\.orgId/g)].length;
  assert.equal(orgIdReads, 1, `expected exactly one dev-only read of User.orgId, saw ${orgIdReads}`);
  const devBypass = requestUserSource.slice(
    requestUserSource.indexOf("if (isDevNoMembershipBypassEnabled())"),
    requestUserSource.indexOf("resolvedMemberships = membershipResult.memberships;"),
  );
  assert.equal(devBypass.includes("appUser.orgId"), true, "the one read is inside the dev bypass");

  // And the request path still performs no writes to it.
  assert.equal(requestUserSource.includes("data: { orgId"), false);
});
