import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { EventAccessError, assertEventAccessForUser } from "@/lib/event-access";
import {
  filterVisibleOrganizations,
  hasTestFixtureOrganizationIdentity,
  isTestFixtureOrganization,
  shouldShowTestFixtureOrganizations,
} from "@/lib/test-fixture-orgs";
import {
  buildPlannerFixture,
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
} from "./planner-fixtures";
import { cleanupTestFixtureOrganizations } from "./fixture-cleanup";

test("fixture organization markers identify only test-created organizations", () => {
  assert.equal(isTestFixtureOrganization({ name: "Fixture Org run-123", slug: "fixture-org-run-123" }), true);
  assert.equal(isTestFixtureOrganization({ name: "Browser Budget Org browser-budget-p0", slug: "browser-budget-org-browser-budget-p0" }), true);
  assert.equal(isTestFixtureOrganization({ name: "PF020 Org pf020-show-flow-run", slug: "pf020-org-pf020-show-flow-run" }), true);
  assert.equal(isTestFixtureOrganization({ name: "Acme Events", slug: "acme-events" }), false);
  assert.equal(isTestFixtureOrganization({ name: "Browser Industries", slug: "browser-industries" }), false);
  assert.equal(
    hasTestFixtureOrganizationIdentity({ name: "Fixture Org run-123", slug: "fixture-org-run-123" }),
    true,
  );
  assert.equal(
    hasTestFixtureOrganizationIdentity({ name: "PF020 Org pf020-show-flow-run", slug: "pf020-org-pf020-show-flow-run" }),
    true,
  );
  assert.equal(
    hasTestFixtureOrganizationIdentity({ name: "Fixture Org run-123", slug: "acme-events" }),
    false,
  );
  assert.equal(
    hasTestFixtureOrganizationIdentity({ name: "Acme Events", slug: "fixture-org-run-123" }),
    false,
  );
});

test("fixture organizations are hidden from manual org selection unless explicitly shown", () => {
  const organizations = [
    { id: "real", name: "Acme Events", slug: "acme-events" },
    { id: "fixture", name: "Fixture Org run-123", slug: "fixture-org-run-123" },
    { id: "browser", name: "Browser Timeline Org browser-timeline-p0", slug: "browser-timeline-org-browser-timeline-p0" },
  ];

  assert.deepEqual(
    filterVisibleOrganizations(organizations, { NODE_ENV: "development" } as NodeJS.ProcessEnv).map((org) => org.id),
    ["real"],
  );
  assert.deepEqual(
    filterVisibleOrganizations(organizations, { NODE_ENV: "test" } as NodeJS.ProcessEnv).map((org) => org.id),
    ["real", "fixture", "browser"],
  );
  assert.equal(shouldShowTestFixtureOrganizations({ SHOW_TEST_ORGS: "true" } as unknown as NodeJS.ProcessEnv), true);
});

test("org selection path filters fixture organizations through the shared guard", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/request-user.ts"), "utf8");

  assert.match(source, /import \{ filterVisibleOrganizations \} from "@\/lib\/test-fixture-orgs"/);
  assert.match(source, /organizations: filterVisibleOrganizations\(accessibleOrganizations\)/);
});

test("fixture cleanup source deletes canonical event children and requires paired fixture markers", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/test-harness/fixture-cleanup.ts"), "utf8");

  assert.match(source, /hasTestFixtureOrganizationIdentity\(organization\)/);
  assert.match(source, /eventMember\.deleteMany/);
  assert.match(source, /membership\.deleteMany/);
  assert.match(source, /eventActivity\.deleteMany/);
  assert.match(source, /timelineDependency\.deleteMany/);
  assert.match(source, /matrixRow\.deleteMany/);
  assert.match(source, /room\.deleteMany/);
  assert.match(source, /budgetLineItem\.deleteMany/);
  assert.match(source, /documentVersion\.deleteMany/);
  assert.match(source, /speaker\.deleteMany/);
  assert.match(source, /eventFnbCatalogItem\.deleteMany/);
  assert.match(source, /seatingAssignment\.deleteMany/);
  assert.match(source, /eventAttendee\.deleteMany/);
  assert.match(source, /dryRun/);
  assert.match(source, /Fixture cleanup verification failed/);
});

test("planner fixture harness creates isolated event data, role access, and explicit cleanup", async (t) => {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed fixture validation.");
    return;
  }

  const harness = createPlannerFixtureHarness({ runLabel: `harness-validation-${randomUUID().slice(0, 8)}` });
  let created:
    | {
        orgId: string;
        eventId: string;
        userId: string;
        sessionId: string;
      }
    | null = null;

  try {
    const roles = await harness.createRoleAccessFixture();
    const room = await harness.createRoom({ eventId: roles.event.id });
    const session = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: room.id,
    });
    const speaker = await harness.createSpeaker({ eventId: roles.event.id });
    await harness.createSessionSpeakerAssignment({ sessionId: session.id, speakerId: speaker.id });
    const staff = await harness.createEventPerson({ eventId: roles.event.id });
    await harness.createSessionStaffAssignment({ sessionId: session.id, personId: staff.id });
    const template = await harness.createSessionRequirementTemplate({ eventId: roles.event.id });
    const section = await harness.createSessionRequirementSection({ templateId: template.id, key: "av" });
    const requirement = await harness.createSessionRequirementItem({ sectionId: section.id, key: "projector" });
    const budget = await harness.createBudget({ eventId: roles.event.id });
    await harness.createBudgetVersion({ budgetId: budget.id, createdByUserId: roles.owner.user.id });
    const budgetLine = await harness.createBudgetLineItem({
      budgetId: budget.id,
      matrixRowId: session.id,
    });
    await harness.createSessionRequirementSelection({
      sessionId: session.id,
      itemId: requirement.id,
      budgetLineItemId: budgetLine.id,
    });
    const fnbItem = await harness.createEventFnbCatalogItem({ eventId: roles.event.id });
    await harness.createSessionFnbCatalogAssignment({
      sessionId: session.id,
      eventFnbCatalogItemId: fnbItem.id,
    });
    const seatingPlan = await harness.createSeatingPlan({
      eventId: roles.event.id,
      matrixRowId: session.id,
    });
    const seatingTable = await harness.createSeatingTable({
      eventId: roles.event.id,
      seatingPlanId: seatingPlan.id,
    });
    const seatingAttendee = await harness.createSeatingAttendee({ eventId: roles.event.id });
    await harness.createSeatingAssignment({
      eventId: roles.event.id,
      seatingPlanId: seatingPlan.id,
      tableId: seatingTable.id,
      attendeeId: seatingAttendee.id,
    });
    const documentCategory = await harness.createDocumentCategory({ eventId: roles.event.id });
    const document = await harness.createDocument({
      orgId: roles.organization.id,
      eventId: roles.event.id,
      categoryId: documentCategory.id,
    });
    await harness.createDocumentVersion({
      documentId: document.id,
      uploadedByUserId: roles.owner.user.id,
    });
    const timelineA = await harness.createTimelineItem({ eventId: roles.event.id, ownerUserId: roles.owner.user.id });
    const timelineB = await harness.createTimelineItem({ eventId: roles.event.id, ownerUserId: roles.member.user.id });
    await harness.createTimelineDependency({
      eventId: roles.event.id,
      predecessorItemId: timelineA.id,
      successorItemId: timelineB.id,
    });

    const memberWrite = await assertEventAccessForUser(roles.event.id, roles.member.accessUser, "write");
    assert.equal(memberWrite.canEdit, true);

    const eventViewerRead = await assertEventAccessForUser(roles.event.id, roles.eventViewer.accessUser, "read");
    assert.equal(eventViewerRead.canView, true);
    assert.equal(eventViewerRead.canEdit, false);

    await assert.rejects(
      () => assertEventAccessForUser(roles.event.id, roles.eventViewer.accessUser, "write"),
      (error) => error instanceof EventAccessError && error.reason === "EVENT_EDITOR_ROLE_REQUIRED",
    );
    await assert.rejects(
      () => assertEventAccessForUser(roles.event.id, roles.unrelatedSameOrgMember.accessUser, "read"),
      (error) => error instanceof EventAccessError && error.reason === "EVENT_MEMBERSHIP_REQUIRED",
    );

    created = {
      orgId: roles.organization.id,
      eventId: roles.event.id,
      userId: roles.owner.user.id,
      sessionId: session.id,
    };
  } finally {
    await harness.cleanup();
  }

  assert.ok(created);
  const [event, user, org, session] = await Promise.all([
    harness.db.event.findUnique({ where: { id: created.eventId }, select: { id: true } }),
    harness.db.user.findUnique({ where: { id: created.userId }, select: { id: true } }),
    harness.db.organization.findUnique({ where: { id: created.orgId }, select: { id: true } }),
    harness.db.matrixRow.findUnique({ where: { id: created.sessionId }, select: { id: true } }),
  ]);

  assert.equal(event, null);
  assert.equal(user, null);
  assert.equal(org, null);
  assert.equal(session, null);
});

test("cleanup helper dry run refuses non-fixture org ids", async (t) => {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed fixture validation.");
    return;
  }

  const harness = createPlannerFixtureHarness({ runLabel: "cleanup-refusal" });
  const realLookingOrg = await harness.db.organization.create({
    data: {
      name: "Cleanup Refusal Real Org",
      slug: `cleanup-refusal-real-org-${Date.now()}`,
    },
  });

  try {
    const result = await cleanupTestFixtureOrganizations({
      db: harness.db,
      orgIds: [realLookingOrg.id],
      dryRun: true,
    });

    assert.deepEqual(result.organizationIds, []);
    assert.equal(result.deletedOrganizations, 0);
  } finally {
    await harness.db.organization.deleteMany({ where: { id: realLookingOrg.id } });
  }
});

test("fixture builder cleans partial setup failures", async (t) => {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed fixture validation.");
    return;
  }

  const runLabel = `partial-setup-${randomUUID().slice(0, 8)}`;
  let organizationId: string | null = null;

  await assert.rejects(
    () =>
      buildPlannerFixture({ runLabel }, async (harness) => {
        const organization = await harness.createOrganization();
        organizationId = organization.id;
        throw new Error("intentional fixture setup failure");
      }),
    /intentional fixture setup failure/,
  );

  assert.ok(organizationId);
  const organization = await createPlannerFixtureHarness().db.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  assert.equal(organization, null);
});

test("PF-020 browser fixture organizations are eligible for canonical cleanup", async (t) => {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed fixture validation.");
    return;
  }

  const runLabel = `pf020-cleanup-${randomUUID().slice(0, 8)}`;
  const harness = createPlannerFixtureHarness({ runLabel });
  const organization = await harness.createOrganization({ name: `PF020 Org ${runLabel}` });

  const result = await cleanupTestFixtureOrganizations({
    db: harness.db,
    orgIds: [organization.id],
    testRunId: runLabel,
  });

  assert.deepEqual(result.organizationIds, [organization.id]);
  assert.equal(result.deletedOrganizations, 1);
  assert.equal(await harness.db.organization.count({ where: { id: organization.id } }), 0);
});
