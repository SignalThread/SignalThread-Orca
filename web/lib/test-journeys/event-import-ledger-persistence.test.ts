import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { EventImportCreateRequest } from "@/lib/event-import-types";
import {
  EventImportBuilderError,
  createEventFromImportPlan,
} from "@/src/server/services/event-import-builder";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `event-import-ledger-${randomUUID().slice(0, 8)}` });
}

function approvedRequest(overrides: Partial<EventImportCreateRequest> = {}): EventImportCreateRequest {
  return {
    idempotencyKey: randomUUID(),
    approval: {
      confirmed: true,
      reviewedAt: "2026-08-06T12:00:00.000Z",
      evidence: "FINAL_REVIEW",
    },
    sourceType: "workbook",
    eventBasics: {
      name: `Ledger import ${randomUUID().slice(0, 8)}`,
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      timezone: "America/New_York",
    },
    workbookMappings: [{
      fileName: "approved.xlsx",
      sheetName: "Timeline",
      sourceSheetName: "Timeline",
      selectedTarget: "timeline",
      columnMapping: { Task: "title", Due: "endDate" },
      skipped: false,
    }],
    runOfShow: [],
    budget: [],
    timeline: [{
      title: "Confirm production",
      endDateIso: "2026-09-20",
      status: "NOT_STARTED",
    }],
    timelineDependencies: [],
    ...overrides,
  };
}

test("approved imports persist exact evidence and retry without creating a duplicate event", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const request = approvedRequest({
      approval: {
        confirmed: true,
        reviewedAt: "2026-08-06T12:00:00.000Z",
        evidence: "FINAL_REVIEW",
        omissionsAcknowledged: true,
        omissions: {
          skippedSheets: [{ fileName: "approved.xlsx", sheetName: "Archive" }],
          skippedColumns: [{ fileName: "approved.xlsx", sheetName: "Timeline", column: "Legacy note" }],
          skippedRows: [{ fileName: "approved.xlsx", sheetName: "Timeline", rowNumber: 7, reason: "Task is required" }],
        },
      },
      workbookMappings: [
        {
          fileName: "approved.xlsx",
          sheetName: "Run of Show",
          sourceSheetName: "Run of Show",
          selectedTarget: "runOfShow",
          columnMapping: { Session: "title", Date: "date", Start: "startTime", End: "endTime", Setup: "setup", AV: "av" },
          skipped: false,
        },
        {
          fileName: "approved.xlsx",
          sheetName: "Budget",
          sourceSheetName: "Budget",
          selectedTarget: "budget",
          columnMapping: { Category: "category", Forecast: "forecast", Status: "status" },
          skipped: false,
        },
        {
          fileName: "approved.xlsx",
          sheetName: "Timeline",
          sourceSheetName: "Timeline",
          selectedTarget: "timeline",
          columnMapping: { Task: "title", Owner: "owner" },
          skipped: false,
        },
      ],
      runOfShow: [{
        sessionName: "Opening session",
        dayDateIso: "2026-10-01",
        startTime: "09:00",
        endTime: "10:00",
        roomName: "Main Hall",
        setupType: "Classroom",
        avNeeds: "Projector; handheld microphone",
        attendance: null,
        notes: "Preserve this imported note exactly.",
      }],
      budget: [{
        category: "Production",
        subcategory: "Audio visual",
        lineItem: "Projector package",
        vendor: "Example AV",
        forecastCents: 125050,
        actualCents: 120025,
        status: "COMMITTED",
      }],
      timeline: [{
        title: "Confirm production",
        status: "AT_RISK",
        priority: "HIGH",
        workstream: "PRODUCTION",
        planningStage: "BUILD",
        isCriticalPath: true,
        owner: roles.member.user.email,
      }],
    });
    const user = { id: roles.owner.user.id, orgId: roles.organization.id, role: roles.owner.user.role };

    const first = await createEventFromImportPlan(request, user);
    const retry = await createEventFromImportPlan(request, user);
    assert.equal(retry.eventId, first.eventId);
    assert.equal(retry.intentId, first.intentId);
    assert.equal(retry.replayed, true);

    const [intent, result, eventCount, timelineItem, session, budgetLine] = await Promise.all([
      harness.db.eventImportIntent.findUniqueOrThrow({
        where: {
          orgId_requestedByUserId_idempotencyKey: {
            orgId: roles.organization.id,
            requestedByUserId: roles.owner.user.id,
            idempotencyKey: request.idempotencyKey,
          },
        },
      }),
      harness.db.eventImportResult.findUniqueOrThrow({ where: { intentId: first.intentId! } }),
      harness.db.event.count({ where: { id: first.eventId } }),
      harness.db.timelineItem.findFirstOrThrow({
        where: { eventId: first.eventId, title: "Confirm production" },
      }),
      harness.db.matrixRow.findFirstOrThrow({
        where: { eventId: first.eventId, sessionName: "Opening session" },
      }),
      harness.db.budgetLineItem.findFirstOrThrow({
        where: { budget: { eventId: first.eventId }, lineItem: "Projector package" },
      }),
    ]);
    assert.equal(intent.status, "SUCCEEDED");
    assert.deepEqual(intent.reviewedMappings, request.workbookMappings);
    assert.deepEqual(intent.approvalEvidence, request.approval);
    assert.deepEqual(intent.approvedPlan, request);
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.eventId, first.eventId);
    assert.equal(eventCount, 1);
    assert.equal(timelineItem.ownerUserId, roles.member.user.id);
    assert.equal(timelineItem.startDate, null);
    assert.equal(timelineItem.endDate, null);
    assert.equal(timelineItem.status, "AT_RISK");
    assert.equal(timelineItem.priority, "HIGH");
    assert.equal(timelineItem.workstream, "PRODUCTION");
    assert.equal(timelineItem.planningStage, "BUILD");
    assert.equal(timelineItem.isCriticalPath, true);
    assert.equal(session.setupType, "Classroom");
    assert.equal(session.avNeeds, "Projector; handheld microphone");
    assert.equal(session.notes, "Preserve this imported note exactly.");
    assert.equal(budgetLine.subcategory, "Audio visual");
    assert.equal(budgetLine.vendor, "Example AV");
    assert.equal(budgetLine.forecastCents, 125050);
    assert.equal(budgetLine.actualCents, 120025);
    assert.equal(budgetLine.status, "COMMITTED");
  } finally {
    await harness.cleanup();
  }
});

test("timeline owners cannot resolve across organizations and the event transaction rolls back", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const user = { id: roles.owner.user.id, orgId: roles.organization.id, role: roles.owner.user.role };
    const request = approvedRequest({
      timeline: [{
        title: "Confirm production",
        status: "NOT_STARTED",
        owner: roles.unrelatedOtherOrgMember.user.email,
      }],
    });
    const eventCountBefore = await harness.db.event.count({ where: { orgId: roles.organization.id } });

    await assert.rejects(
      () => createEventFromImportPlan(request, user),
      (error: unknown) => error instanceof EventImportBuilderError && error.code === "TIMELINE_OWNER_NOT_FOUND",
    );

    const [eventCountAfter, intent] = await Promise.all([
      harness.db.event.count({ where: { orgId: roles.organization.id } }),
      harness.db.eventImportIntent.findUniqueOrThrow({
        where: {
          orgId_requestedByUserId_idempotencyKey: {
            orgId: roles.organization.id,
            requestedByUserId: roles.owner.user.id,
            idempotencyKey: request.idempotencyKey,
          },
        },
        include: { result: true },
      }),
    ]);
    assert.equal(eventCountAfter, eventCountBefore);
    assert.equal(intent.status, "FAILED");
    assert.equal(intent.result?.status, "FAILED");
    assert.equal(intent.result?.errorCode, "TIMELINE_OWNER_NOT_FOUND");
  } finally {
    await harness.cleanup();
  }
});

test("invalid timeline taxonomy is rejected without silently creating an event", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const user = { id: roles.owner.user.id, orgId: roles.organization.id, role: roles.owner.user.role };
    const request = approvedRequest({
      timeline: [{
        title: "Confirm production",
        status: "NOT_STARTED",
        workstream: "LOGISTICS" as "PRODUCTION",
      }],
    });
    const eventCountBefore = await harness.db.event.count({ where: { orgId: roles.organization.id } });

    await assert.rejects(
      () => createEventFromImportPlan(request, user),
      (error: unknown) => error instanceof EventImportBuilderError && error.code === "INVALID_TIMELINE_TAXONOMY",
    );

    assert.equal(
      await harness.db.event.count({ where: { orgId: roles.organization.id } }),
      eventCountBefore,
    );
  } finally {
    await harness.cleanup();
  }
});

test("failed and canceled imports persist terminal results and replay them without event creation", async (t) => {
  const harness = createHarnessOrSkip(t);
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const user = { id: roles.owner.user.id, orgId: roles.organization.id, role: roles.owner.user.role };
    const eventCountBefore = await harness.db.event.count({ where: { orgId: roles.organization.id } });

    const failed = approvedRequest({ sourceType: "template", workbookMappings: [], timeline: [] });
    await assert.rejects(
      () => createEventFromImportPlan(failed, user),
      (error: unknown) => error instanceof EventImportBuilderError && error.code === "EVENT_IMPORT_CREATE_ERROR",
    );
    await assert.rejects(
      () => createEventFromImportPlan(failed, user),
      (error: unknown) => error instanceof EventImportBuilderError && error.code === "EVENT_IMPORT_CREATE_ERROR",
    );

    const controller = new AbortController();
    controller.abort();
    const canceled = approvedRequest({ sourceType: "blank", workbookMappings: [], timeline: [] });
    await assert.rejects(
      () => createEventFromImportPlan(canceled, user, { signal: controller.signal }),
      (error: unknown) => error instanceof EventImportBuilderError && error.code === "IMPORT_CANCELED",
    );
    await assert.rejects(
      () => createEventFromImportPlan(canceled, user),
      (error: unknown) => error instanceof EventImportBuilderError && error.code === "IMPORT_CANCELED",
    );

    const [terminalIntents, terminalResults, eventCountAfter] = await Promise.all([
      harness.db.eventImportIntent.findMany({
        where: { idempotencyKey: { in: [failed.idempotencyKey, canceled.idempotencyKey] } },
        orderBy: { idempotencyKey: "asc" },
      }),
      harness.db.eventImportResult.findMany({
        where: { intent: { idempotencyKey: { in: [failed.idempotencyKey, canceled.idempotencyKey] } } },
      }),
      harness.db.event.count({ where: { orgId: roles.organization.id } }),
    ]);
    assert.deepEqual(new Set(terminalIntents.map((intent) => intent.status)), new Set(["FAILED", "CANCELED"]));
    assert.deepEqual(new Set(terminalResults.map((result) => result.status)), new Set(["FAILED", "CANCELED"]));
    assert.equal(terminalIntents.length, 2);
    assert.equal(terminalResults.length, 2);
    assert.equal(eventCountAfter, eventCountBefore);
  } finally {
    await harness.cleanup();
  }
});
