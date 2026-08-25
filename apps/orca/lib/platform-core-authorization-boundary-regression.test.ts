/**
 * Platform Core migration, Phase 1 — authorization must not move.
 *
 * A valid authenticated Platform Core identity is not access. Organization scope, event
 * membership, and Orca's own `EventMemberRole` remain the deciders, and every event route
 * must still pass through an identity gate — there is no RLS backstop in this product.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { EventMemberRole, UserRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { EventAccessError, assertEventAccessForUser, resolveEventAccessForUser } from "@/lib/event-access";
import { resolveAppUserByPlatformIdentity } from "@/lib/platform/identity";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

const EVENT_ROUTE_ROOT = "app/api/events/[eventId]";

/**
 * Identity gates recognised as entry points for an event route. Each either resolves the
 * request user itself or delegates to a helper that does; the next test proves the
 * delegating helpers really do funnel into `resolveRequestUser`.
 */
const APPROVED_ROUTE_GATES = [
  "requireEventRouteAccess",
  "resolveRequestUser",
  "requireRouteUser",
  "requireBudgetRouteAccess",
  "resolveDirectoryUser",
  "resolveAttendeeUser",
  "requireEnrollmentRouteUser",
  "ensureProvisionedUserAndContext",
] as const;

const INDIRECT_GATE_HELPERS = [
  "app/api/events/[eventId]/budget/_lib/route-auth.ts",
  "app/api/events/[eventId]/tasks/_lib/route-helpers.ts",
  "app/api/events/[eventId]/directory/_lib/route-helpers.ts",
  "app/api/events/[eventId]/attendees/_lib/route-helpers.ts",
  "app/api/events/[eventId]/attendees/_lib/session-enrollment-route-helpers.ts",
];

/**
 * Event routes that deliberately do not resolve a user identity, with the reason each is
 * safe. Anything else appearing unguarded is a tenant-isolation hole.
 */
const UNAUTHENTICATED_ROUTE_ALLOWLIST: Record<string, string> = {
  "app/api/events/[eventId]/marketing/run-due-scheduled-sends/route.ts":
    "pull-based runner authenticated by MARKETING_SEND_RUNNER_SECRET, not by a user session",
  "app/api/events/[eventId]/documents/upload-local/route.ts":
    "disabled endpoint that only returns 410 Gone and touches no data",
};

function listRouteFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...listRouteFiles(full));
    } else if (entry === "route.ts") {
      found.push(full);
    }
  }
  return found;
}

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed authorization tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

// --- Route coverage: no event route may skip the identity gate -----------------

test("every event-scoped API route passes through an approved identity gate", () => {
  const routes = listRouteFiles(EVENT_ROUTE_ROOT);
  assert.equal(routes.length > 150, true, `expected the full event route surface, saw ${routes.length}`);

  const unguarded: string[] = [];
  for (const route of routes) {
    if (route in UNAUTHENTICATED_ROUTE_ALLOWLIST) continue;
    const source = readFileSync(route, "utf8");
    if (!APPROVED_ROUTE_GATES.some((gate) => source.includes(gate))) {
      unguarded.push(route);
    }
  }

  assert.deepEqual(
    unguarded,
    [],
    `these event routes resolve no user identity and have no allowlist entry:\n${unguarded.join("\n")}`,
  );
});

test("the allowlisted routes are still exactly the ones we reasoned about", () => {
  for (const [route, reason] of Object.entries(UNAUTHENTICATED_ROUTE_ALLOWLIST)) {
    const source = readFileSync(route, "utf8");
    assert.equal(typeof reason, "string");
    assert.equal(
      APPROVED_ROUTE_GATES.some((gate) => source.includes(gate)),
      false,
      `${route} now resolves a user — remove it from the allowlist`,
    );
  }

  const runnerSource = readFileSync(
    "app/api/events/[eventId]/marketing/run-due-scheduled-sends/route.ts",
    "utf8",
  );
  assert.equal(runnerSource.includes("MARKETING_SEND_RUNNER_SECRET"), true);
  assert.equal(runnerSource.includes("isAuthorizedRunnerRequest(request)"), true);

  const disabledUploadSource = readFileSync(
    "app/api/events/[eventId]/documents/upload-local/route.ts",
    "utf8",
  );
  assert.equal(disabledUploadSource.includes("status: 410"), true);
  assert.equal(disabledUploadSource.includes("getPrisma"), false);
});

test("indirect gate helpers all funnel into the one canonical request-user resolver", () => {
  for (const helper of INDIRECT_GATE_HELPERS) {
    const source = readFileSync(helper, "utf8");
    assert.equal(
      source.includes("resolveRequestUser"),
      true,
      `${helper} must resolve identity through lib/request-user`,
    );
  }
});

// --- Authorization semantics are untouched by the identity change ---------------

test("the tenant boundary still compares the active org against the event org", () => {
  const eventAccessSource = readFileSync("lib/event-access.ts", "utf8");
  assert.equal(eventAccessSource.includes("if (!user.orgId || user.orgId !== event.orgId)"), true);
  assert.equal(eventAccessSource.includes('"EVENT_OUTSIDE_ACTIVE_ORG"'), true);
  assert.equal(eventAccessSource.includes('"EVENT_MEMBERSHIP_REQUIRED"'), true);
  assert.equal(eventAccessSource.includes('"EVENT_EDITOR_ROLE_REQUIRED"'), true);

  // Phase 1 must not have taught the access check about platform identity.
  assert.equal(
    /platformUserId|platform\/identity/.test(eventAccessSource),
    false,
    "event access must remain decided by org scope and EventMemberRole",
  );
});

test("Orca keeps its own event roles rather than inheriting platform ones", () => {
  const eventAccessSource = readFileSync("lib/event-access.ts", "utf8");
  assert.equal(eventAccessSource.includes("EventMemberRole.EVENT_VIEWER"), true);
  assert.equal(eventAccessSource.includes("canListOrganizationEvents(user.role)"), true);
});

// --- DB-backed: identity alone grants nothing -----------------------------------

test("a resolvable platform identity does not by itself grant event access", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-authz-identity-only");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const outsider = roles.unrelatedOtherOrgMember;

    // Give the outsider a perfectly valid canonical platform identity.
    const platformUserId = randomUUID();
    await getPrisma().user.update({
      where: { id: outsider.user.id },
      data: { platformUserId },
    });

    const resolution = await resolveAppUserByPlatformIdentity({
      platformUserId,
      email: outsider.user.email,
    });
    assert.equal(resolution.status, "RESOLVED");

    // ...and it still cannot see an event in another organization.
    const decision = await resolveEventAccessForUser(roles.event.id, outsider.accessUser);
    assert.equal(decision.canView, false);
    assert.equal(decision.reason, "EVENT_OUTSIDE_ACTIVE_ORG");

    await assert.rejects(
      () => assertEventAccessForUser(roles.event.id, outsider.accessUser, "read"),
      (error: unknown) => error instanceof EventAccessError && error.status === 403,
    );
  } finally {
    await harness.cleanup();
  }
});

test("org membership without event membership is still denied after linking identity", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-authz-org-only");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const sameOrgNoEvent = roles.unrelatedSameOrgMember;

    await getPrisma().user.update({
      where: { id: sameOrgNoEvent.user.id },
      data: { platformUserId: randomUUID() },
    });

    const decision = await resolveEventAccessForUser(roles.event.id, sameOrgNoEvent.accessUser);
    assert.equal(decision.canView, false);
    assert.equal(decision.reason, "EVENT_MEMBERSHIP_REQUIRED");
  } finally {
    await harness.cleanup();
  }
});

test("Orca event roles still decide read vs write for a linked identity", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-authz-event-roles");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const eventViewer = roles.eventViewer;

    await getPrisma().user.update({
      where: { id: eventViewer.user.id },
      data: { platformUserId: randomUUID() },
    });

    const decision = await assertEventAccessForUser(roles.event.id, eventViewer.accessUser, "read");
    assert.equal(decision.canView, true);
    assert.equal(decision.canEdit, false);
    assert.equal(decision.eventRole, EventMemberRole.EVENT_VIEWER);

    await assert.rejects(
      () => assertEventAccessForUser(roles.event.id, eventViewer.accessUser, "write"),
      (error: unknown) =>
        error instanceof EventAccessError && error.reason === "EVENT_EDITOR_ROLE_REQUIRED",
    );
  } finally {
    await harness.cleanup();
  }
});

test("an unauthenticated request has no platform identity and no access", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-authz-unauthenticated");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();

    // No user, no org context — the shape a rejected session produces downstream.
    const decision = await resolveEventAccessForUser(roles.event.id, {
      id: randomUUID(),
      orgId: null,
      role: UserRole.MEMBER,
    });

    assert.equal(decision.canView, false);
    assert.equal(decision.reason, "EVENT_OUTSIDE_ACTIVE_ORG");
  } finally {
    await harness.cleanup();
  }
});
