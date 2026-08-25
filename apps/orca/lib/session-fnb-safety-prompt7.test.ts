import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test, { type TestContext } from "node:test";
import {
  FnbClaimKind,
  FnbVerificationStatus,
  RequirementDisposition,
  UserRole,
} from "@prisma/client";
import { createSessionFnbCatalogAssignment } from "@/lib/fnb-catalog";
import {
  getSessionFnbSafetySummary,
  resolveSessionFnbSafety,
  SessionFnbSafetyError,
  upsertSessionFnbRequirement,
} from "@/lib/session-fnb-safety";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function harnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for Prompt 7 DB validation.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `prompt7-safety-${randomUUID().slice(0, 8)}` });
}

test("Prompt 7 safety API and workspace enforce read/write boundaries and privacy guidance", async () => {
  const [route, component, readiness, schema, migration] = await Promise.all([
    readFile("app/api/events/[eventId]/matrix-2/sessions/[sessionId]/fnb-safety/route.ts", "utf8"),
    readFile("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-fnb-safety-summary.tsx", "utf8"),
    readFile("lib/session-readiness.ts", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("test-fixtures/legacy-orca-migrations/20260811150000_session_safety_operations/migration.sql", "utf8"),
  ]);
  assert.match(route, /requireEventRouteAccess\(request, eventId, "read"\)/);
  assert.match(route, /requireEventRouteAccess\(request, eventId, "write"\)/);
  assert.match(route, /resolveSessionFnbSafety/);
  assert.match(component, /Aggregate operational counts only/);
  assert.match(component, /Do not enter attendee names, diagnoses, or person-level medical details/);
  assert.match(component, /Reason required for Not needed/);
  assert.match(component, /Base evidence:/);
  assert.match(component, /Verified assignment-specific modification/);
  assert.match(readiness, /safetyAlert/);
  assert.match(schema, /catalogItemSnapshot\s+Json\?/);
  assert.match(migration, /catalogItemSnapshot/);
  assert.match(migration, /verified_modification_check/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE\s+FROM)\b/im);
});

test("Prompt 7 menu-to-session safety resolution is versioned, auditable, isolated, and privacy-safe", async (t) => {
  const harness = harnessOrSkip(t);
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const owner = await harness.createUser({ orgId: organization.id, role: UserRole.OWNER });
    const client = await harness.createClient({ orgId: organization.id });
    const event = await harness.createEvent({ orgId: organization.id, clientId: client.id, createdByUserId: owner.id });
    const session = await harness.createMatrixRow({ eventId: event.id, sessionName: "Prompt 7 safety session" });
    const item = await harness.db.eventFnbCatalogItem.create({
      data: {
        eventId: event.id,
        itemName: "Verified dairy soup",
        category: "Lunch",
        publishedPriceCents: 2400,
        currency: "USD",
        verificationStatus: FnbVerificationStatus.VERIFIED,
        verifiedByUserId: owner.id,
        verifiedAt: new Date(),
        verificationSource: "Caterer specification 2026-08-11",
        claims: {
          create: {
            eventId: event.id,
            kind: FnbClaimKind.CONTAINS,
            code: "MILK",
            verificationStatus: FnbVerificationStatus.VERIFIED,
            verifiedByUserId: owner.id,
            verifiedAt: new Date(),
            evidenceSource: "Caterer ingredient sheet",
          },
        },
      },
    });
    const assignment = await createSessionFnbCatalogAssignment(event.id, session.id, {
      eventFnbCatalogItemId: item.id,
      quantity: 25,
    });
    const requirement = await upsertSessionFnbRequirement(event.id, session.id, owner.id, {
      kind: "ALLERGEN",
      code: "MILK",
      quantity: 2,
      disposition: "REQUIRED",
    });
    const conflict = await getSessionFnbSafetySummary(event.id, session.id);
    assert.equal(conflict.overall, "CONFLICT");
    assert.equal(conflict.alert.severity, "BLOCKING");
    assert.equal(conflict.alert.count, 1);
    assert.equal(conflict.compatibilityPairs[0]?.baseOutcome, "CONFLICT");
    assert.equal(conflict.compatibilityPairs[0]?.outcome, "CONFLICT");
    assert.doesNotMatch(JSON.stringify(conflict), /attendee|diagnosis|medical/i);

    const persistedAssignment = await harness.db.sessionFnbCatalogAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      select: { catalogItemSnapshot: true, catalogItemVersion: true },
    });
    assert.equal(persistedAssignment.catalogItemVersion, 1);
    assert.equal((persistedAssignment.catalogItemSnapshot as { publishedPriceCents?: number }).publishedPriceCents, 2400);
    assert.match(JSON.stringify(persistedAssignment.catalogItemSnapshot), /Caterer ingredient sheet/);

    await harness.db.eventFnbCatalogItem.update({
      where: { id: item.id },
      data: { publishedPriceCents: 3100, version: { increment: 1 } },
    });
    const immutableAssignment = await harness.db.sessionFnbCatalogAssignment.findUniqueOrThrow({
      where: { id: assignment.id },
      select: { catalogItemSnapshot: true, catalogItemVersion: true },
    });
    assert.equal(immutableAssignment.catalogItemVersion, 1);
    assert.equal((immutableAssignment.catalogItemSnapshot as { publishedPriceCents?: number }).publishedPriceCents, 2400);

    await resolveSessionFnbSafety(event.id, session.id, owner.id, {
      action: "VERIFY_MODIFICATION",
      assignmentId: assignment.id,
      requirementId: requirement.id,
      modification: "Prepare two portions in a sanitized dairy-free station using oat cream.",
      evidenceSource: "Caterer written confirmation 2026-08-11",
    });
    const resolved = await getSessionFnbSafetySummary(event.id, session.id);
    assert.equal(resolved.compatibilityPairs[0]?.baseOutcome, "CONFLICT");
    assert.equal(resolved.compatibilityPairs[0]?.outcome, "VERIFIED_MATCH");
    assert.equal(resolved.alert.severity, "CLEAR");

    await upsertSessionFnbRequirement(event.id, session.id, owner.id, {
      kind: "ACCESSIBILITY",
      code: "HEARING",
      disposition: RequirementDisposition.REQUIRED,
    });
    const accessibilityReview = await getSessionFnbSafetySummary(event.id, session.id);
    assert.equal(accessibilityReview.overall, "INSUFFICIENT_INFORMATION");
    assert.equal(accessibilityReview.alert.severity, "ATTENTION");

    await assert.rejects(
      upsertSessionFnbRequirement(event.id, session.id, owner.id, {
        kind: "ACCESSIBILITY",
        code: "HEARING",
        disposition: RequirementDisposition.NOT_NEEDED,
      }),
      /requires reason, actor, and timestamp/i,
    );
    const notNeeded = await upsertSessionFnbRequirement(event.id, session.id, owner.id, {
      kind: "ACCESSIBILITY",
      code: "HEARING",
      disposition: RequirementDisposition.NOT_NEEDED,
      dispositionReason: "Venue confirms no hearing accommodation is required for this session.",
    });
    assert.equal(notNeeded.disposition, RequirementDisposition.NOT_NEEDED);
    assert.equal(notNeeded.dispositionActorUserId, owner.id);
    assert.ok(notNeeded.dispositionAt);

    const otherEvent = await harness.createEvent({ orgId: organization.id, clientId: client.id, createdByUserId: owner.id, name: "Other tenant boundary event" });
    const otherSession = await harness.createMatrixRow({ eventId: otherEvent.id });
    await assert.rejects(
      resolveSessionFnbSafety(otherEvent.id, otherSession.id, owner.id, {
        action: "VERIFY_MODIFICATION",
        assignmentId: assignment.id,
        requirementId: requirement.id,
        modification: "Invalid cross-event resolution",
        evidenceSource: "Invalid",
      }),
      (error: unknown) => error instanceof SessionFnbSafetyError && error.code === "SAFETY_PAIR_NOT_FOUND",
    );

    const activity = await harness.db.eventActivity.findMany({
      where: {
        eventId: event.id,
        entityType: { in: ["SessionFnbRequirement", "SessionFnbAssignmentSafetyResolution"] },
      },
      select: { entityType: true, actorUserId: true, actionType: true },
    });
    assert.ok(activity.some((entry) => entry.entityType === "SessionFnbRequirement" && entry.actorUserId === owner.id));
    assert.ok(activity.some((entry) => entry.entityType === "SessionFnbAssignmentSafetyResolution" && entry.actorUserId === owner.id));
  } finally {
    await harness.cleanup();
  }
});
