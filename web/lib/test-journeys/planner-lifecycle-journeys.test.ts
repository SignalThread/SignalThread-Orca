import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import {
  BudgetActivityType,
  BudgetStatus,
  DocumentStatus,
  DocumentApprovalStatus,
  SpeakerStatus,
} from "@prisma/client";
import {
  EventAccessError,
  assertEventAccessForUser,
  type EventAccessUser,
} from "@/lib/event-access";
import { getMatrix2Snapshot } from "@/lib/matrix2";
import {
  addMatrix2SessionSpeakerAssignment,
  removeMatrix2SessionSpeakerAssignment,
} from "@/lib/matrix2-session";
import {
  approveBudget,
  assertBudgetAccessForEvent,
  rejectBudget,
  reviseBudget,
  submitBudget,
} from "@/src/server/services/budget";
import {
  approveDocument,
  createDocumentDraft,
  finalizeDocumentUpload,
  getDocumentDetails,
  listDocumentsForEvent,
  pullBackDocumentReview,
  reopenDocument,
  submitDocumentForReview,
} from "@/src/server/services/documents";
import {
  createSpeakerMessage,
  createSpeakerInternalNote,
} from "@/src/server/services/speaker-comms";
import { upsertSpeakerOnsiteInfo } from "@/src/server/services/speaker-onsite";
import {
  generateSpeakerPortalToken,
  hashSpeakerPortalToken,
  resolveSpeakerPortalToken,
  revokeSpeakerPortalTokens,
  SpeakerPortalTokenError,
} from "@/src/server/services/speaker-portal-tokens";
import {
  getSpeakerPortalView,
  submitSpeakerPortalProfile,
} from "@/src/server/services/speaker-portal";
import {
  createSpeaker,
  listSpeakers,
  updateSpeaker,
} from "@/src/server/services/speakers";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
  type PlannerRoleFixture,
} from "@/lib/test-harness/planner-fixtures";

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed lifecycle journey tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

async function assertDenied(
  work: () => Promise<unknown>,
  expectedReason: string,
): Promise<void> {
  await assert.rejects(
    work,
    (error) => error instanceof EventAccessError && error.reason === expectedReason,
  );
}

async function guardedDocumentAction<T>(
  eventId: string,
  user: EventAccessUser,
  work: () => Promise<T>,
): Promise<T> {
  await assertEventAccessForUser(eventId, user, "write");
  return work();
}

async function guardedBudgetAction<T>(
  eventId: string,
  user: EventAccessUser,
  work: () => Promise<T>,
): Promise<T> {
  await assertBudgetAccessForEvent(eventId, user, "write");
  return work();
}

async function guardedSpeakerAdd(
  eventId: string,
  sessionId: string,
  speakerId: string,
  user: EventAccessUser,
): Promise<void> {
  await assertEventAccessForUser(eventId, user, "write");
  await addMatrix2SessionSpeakerAssignment(eventId, sessionId, speakerId);
}

async function guardedSpeakerRemove(
  eventId: string,
  sessionId: string,
  speakerId: string,
  user: EventAccessUser,
): Promise<void> {
  await assertEventAccessForUser(eventId, user, "write");
  await removeMatrix2SessionSpeakerAssignment(eventId, sessionId, speakerId);
}

function trackDocument(harness: PlannerFixtureHarness, documentId: string): void {
  if (!harness.ids.documentIds.includes(documentId)) harness.ids.documentIds.push(documentId);
}

function trackDocumentVersion(harness: PlannerFixtureHarness, versionId: string): void {
  if (!harness.ids.documentVersionIds.includes(versionId)) harness.ids.documentVersionIds.push(versionId);
}

function trackSpeaker(harness: PlannerFixtureHarness, speakerId: string): void {
  if (!harness.ids.speakerIds.includes(speakerId)) harness.ids.speakerIds.push(speakerId);
}

async function createBudgetLineForEvent(
  harness: PlannerFixtureHarness,
  roles: PlannerRoleFixture,
  input: { eventId: string; label: string },
) {
  const budget = await harness.createBudget({ eventId: input.eventId });
  await harness.createBudgetVersion({
    budgetId: budget.id,
    createdByUserId: roles.owner.user.id,
    makeCurrent: true,
  });
  const lineItem = await harness.createBudgetLineItem({
    budgetId: budget.id,
    lineItem: input.label,
    forecastCents: 125000,
  });

  return { budget, lineItem };
}

test("Lifecycle journey: Docs Hub draft, version, review, approval, reopen, and access state persist", async (t) => {
  const harness = createHarnessOrSkip(t, "lifecycle-docs");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const category = await harness.createDocumentCategory({
      eventId: roles.event.id,
      name: "Contracts",
      slug: `contracts-${harness.runLabel}`,
    });

    const document = await createDocumentDraft(roles.event.id, {
      title: "Hotel Agreement",
      categoryId: category.id,
    });
    trackDocument(harness, document.id);

    const version = await finalizeDocumentUpload(
      roles.event.id,
      document.id,
      {
        objectKey: `events/${roles.event.id}/documents/${document.id}/${harness.runLabel}.pdf`,
        objectEtag: "fixture-etag",
        mimeType: "application/pdf",
        fileSizeBytes: 2048,
        originalFilename: "hotel-agreement.pdf",
      },
      roles.member.user.id,
    );
    trackDocumentVersion(harness, version.id);

    const draftDetails = await getDocumentDetails(roles.event.id, document.id);
    assert.equal(draftDetails.id, document.id);
    assert.equal(draftDetails.status, DocumentStatus.DRAFT);
    assert.equal(draftDetails.versions[0]?.id, version.id);

    await submitDocumentForReview(roles.event.id, document.id, {
      actedByUserId: roles.member.user.id,
      recipientUserIds: [roles.admin.user.id],
      note: "Please review before contracting.",
    });
    assert.equal(
      (await harness.db.document.findUniqueOrThrow({ where: { id: document.id } })).status,
      DocumentStatus.IN_REVIEW,
    );

    let approvals = await harness.db.documentApproval.findMany({
      where: { documentId: document.id },
      orderBy: { actedAt: "asc" },
      include: { recipients: true },
    });
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0]?.status, DocumentApprovalStatus.IN_REVIEW);
    assert.deepEqual(approvals[0]?.recipients.map((entry) => entry.userId), [roles.admin.user.id]);

    await pullBackDocumentReview(roles.event.id, document.id, {
      actedByUserId: roles.member.user.id,
      note: "Need an updated addendum first.",
    });
    assert.equal(
      (await harness.db.document.findUniqueOrThrow({ where: { id: document.id } })).status,
      DocumentStatus.DRAFT,
    );

    await submitDocumentForReview(roles.event.id, document.id, {
      actedByUserId: roles.member.user.id,
      recipientUserIds: [roles.admin.user.id],
    });

    const approvalCountBeforeDeniedWrite = await harness.db.documentApproval.count({
      where: { documentId: document.id },
    });
    await assertDenied(
      () =>
        guardedDocumentAction(roles.event.id, roles.eventViewer.accessUser, () =>
          approveDocument(roles.event.id, document.id, { actedByUserId: roles.eventViewer.user.id }),
        ),
      "EVENT_EDITOR_ROLE_REQUIRED",
    );
    assert.equal(
      await harness.db.documentApproval.count({ where: { documentId: document.id } }),
      approvalCountBeforeDeniedWrite,
    );
    assert.equal(
      (await harness.db.document.findUniqueOrThrow({ where: { id: document.id } })).status,
      DocumentStatus.IN_REVIEW,
    );

    await approveDocument(roles.event.id, document.id, {
      actedByUserId: roles.admin.user.id,
      note: "Approved for signature.",
    });
    assert.equal(
      (await harness.db.document.findUniqueOrThrow({ where: { id: document.id } })).status,
      DocumentStatus.APPROVED,
    );

    approvals = await harness.db.documentApproval.findMany({
      where: { documentId: document.id },
      orderBy: { actedAt: "asc" },
      include: { recipients: true },
    });
    assert.deepEqual(
      approvals.map((entry) => entry.status),
      [
        DocumentApprovalStatus.IN_REVIEW,
        DocumentApprovalStatus.IN_REVIEW,
        DocumentApprovalStatus.IN_REVIEW,
        DocumentApprovalStatus.APPROVED,
      ],
    );

    await reopenDocument(roles.event.id, document.id, { actedByUserId: roles.admin.user.id });
    assert.equal(
      (await harness.db.document.findUniqueOrThrow({ where: { id: document.id } })).status,
      DocumentStatus.DRAFT,
    );

    const listed = await listDocumentsForEvent(roles.event.id, {});
    assert.equal(listed.documents.some((entry) => entry.id === document.id), true);
  } finally {
    await harness.cleanup();
  }
});

test("Lifecycle journey: Budget submission, reject, revise, approve, and denied approval state persist", async (t) => {
  const harness = createHarnessOrSkip(t, "lifecycle-budget");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const first = await createBudgetLineForEvent(harness, roles, {
      eventId: roles.event.id,
      label: "General Session AV",
    });

    await submitBudget(roles.event.id, {
      actorUserId: roles.member.user.id,
      selectedLineItemId: first.lineItem.id,
      recipientUserIds: [roles.viewer.user.id],
      message: "Ready for budget review.",
    });

    let persistedBudget = await harness.db.budget.findUniqueOrThrow({ where: { id: first.budget.id } });
    assert.equal(persistedBudget.status, BudgetStatus.SUBMITTED);
    assert.ok(persistedBudget.submittedAt);
    assert.equal(persistedBudget.submittedByUserId, roles.member.user.id);

    const submission = await harness.db.budgetSubmission.findFirstOrThrow({
      where: { budgetId: first.budget.id },
      include: { recipients: true, lineItems: true },
    });
    assert.equal(submission.recipients[0]?.userId, roles.viewer.user.id);
    assert.equal(submission.lineItems[0]?.budgetLineItemId, first.lineItem.id);

    const activityCountBeforeDeniedWrite = await harness.db.budgetActivity.count({
      where: { budgetId: first.budget.id },
    });
    await assert.rejects(
      () =>
        guardedBudgetAction(roles.event.id, roles.eventViewer.accessUser, () =>
          approveBudget(roles.event.id, roles.eventViewer.user.id),
        ),
      /Event editor role required/,
    );
    assert.equal(
      await harness.db.budgetActivity.count({ where: { budgetId: first.budget.id } }),
      activityCountBeforeDeniedWrite,
    );
    assert.equal(
      (await harness.db.budget.findUniqueOrThrow({ where: { id: first.budget.id } })).status,
      BudgetStatus.SUBMITTED,
    );

    await rejectBudget(roles.event.id, "Needs stronger vendor backup.", roles.admin.user.id);
    persistedBudget = await harness.db.budget.findUniqueOrThrow({ where: { id: first.budget.id } });
    assert.equal(persistedBudget.status, BudgetStatus.REJECTED);
    assert.equal(persistedBudget.rejectedByUserId, roles.admin.user.id);

    await reviseBudget(roles.event.id, roles.member.user.id);
    persistedBudget = await harness.db.budget.findUniqueOrThrow({ where: { id: first.budget.id } });
    assert.equal(persistedBudget.status, BudgetStatus.DRAFT);
    assert.equal(persistedBudget.submittedAt, null);

    const secondLineItem = await harness.createBudgetLineItem({
      budgetId: first.budget.id,
      lineItem: "Revised General Session AV",
      forecastCents: 110000,
    });
    await submitBudget(roles.event.id, {
      actorUserId: roles.member.user.id,
      selectedLineItemId: secondLineItem.id,
      recipientUserIds: [roles.viewer.user.id],
    });
    await approveBudget(roles.event.id, roles.admin.user.id);

    persistedBudget = await harness.db.budget.findUniqueOrThrow({ where: { id: first.budget.id } });
    assert.equal(persistedBudget.status, BudgetStatus.APPROVED);
    assert.equal(persistedBudget.approvedByUserId, roles.admin.user.id);

    const activities = await harness.db.budgetActivity.findMany({
      where: { budgetId: first.budget.id },
      orderBy: { createdAt: "asc" },
      select: { type: true, actorUserId: true },
    });
    assert.deepEqual(
      activities.map((entry) => entry.type),
      [
        BudgetActivityType.SUBMITTED,
        BudgetActivityType.REJECTED,
        BudgetActivityType.REVISED,
        BudgetActivityType.SUBMITTED,
        BudgetActivityType.APPROVED,
      ],
    );

    assert.ok(persistedBudget.currentVersionId);
    const approvals = await harness.db.budgetApproval.findMany({
      where: { budgetVersionId: persistedBudget.currentVersionId },
      orderBy: { actedAt: "asc" },
      select: { status: true, actedByUserId: true },
    });
    assert.equal(approvals.some((entry) => entry.actedByUserId === roles.admin.user.id), true);
  } finally {
    await harness.cleanup();
  }
});

test("Lifecycle journey: Speaker create, assign, comms, onsite data, denial, and removal persist", async (t) => {
  const harness = createHarnessOrSkip(t, "lifecycle-speaker");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    await harness.createSessionRequirementTemplate({ eventId: roles.event.id });
    const room = await harness.createRoom({ eventId: roles.event.id, name: "Lifecycle Ballroom" });
    const session = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: room.id,
      sessionName: "Lifecycle Keynote",
    });

    const speaker = await createSpeaker(roles.event.id, roles.member.accessUser, {
      name: "Jordan Avery",
      email: `jordan-${randomUUID().slice(0, 8)}@planner.test`,
      title: "Chief Strategy Officer",
      status: SpeakerStatus.CONFIRMED,
    });
    trackSpeaker(harness, speaker.id);

    await guardedSpeakerAdd(roles.event.id, session.id, speaker.id, roles.member.accessUser);
    harness.ids.sessionSpeakerAssignments.push({ sessionId: session.id, speakerId: speaker.id });

    let snapshot = await getMatrix2Snapshot(roles.event.id);
    const assignedSession = snapshot.sessions.find((entry) => entry.id === session.id);
    assert.ok(assignedSession);
    assert.deepEqual(assignedSession.speakerAssignments.map((entry) => entry.speakerId), [speaker.id]);

    await createSpeakerMessage(roles.event.id, speaker.id, roles.member.accessUser, {
      body: "Please upload your final deck by Friday.",
      sessionId: session.id,
    });
    await createSpeakerInternalNote(roles.event.id, speaker.id, roles.member.accessUser, {
      body: "Prefers handheld mic.",
      sessionId: session.id,
    });
    const onsite = await upsertSpeakerOnsiteInfo(roles.event.id, roles.member.accessUser, {
      greenRoomLocation: "Level 2 Green Room",
      arrivalInstructions: "Use the staff entrance.",
      badgePickupInfo: "Planner desk.",
      onsiteContact: "Morgan",
      avRehearsalInfo: "Soundcheck at 8:15.",
    });
    assert.equal(onsite.greenRoomLocation, "Level 2 Green Room");

    const speakerCounts = await Promise.all([
      harness.db.speakerMessage.count({ where: { eventId: roles.event.id, speakerId: speaker.id } }),
      harness.db.speakerInternalNote.count({ where: { eventId: roles.event.id, speakerId: speaker.id } }),
      harness.db.speakerOnsiteInfo.count({ where: { eventId: roles.event.id } }),
    ]);
    assert.deepEqual(speakerCounts, [1, 1, 1]);

    await assert.rejects(
      () =>
        updateSpeaker(roles.event.id, speaker.id, roles.eventViewer.accessUser, {
          name: "Read Only Rename",
        }),
      /Event editor role required/,
    );
    assert.equal(
      (await harness.db.speaker.findUniqueOrThrow({ where: { id: speaker.id } })).name,
      "Jordan Avery",
    );

    await guardedSpeakerRemove(roles.event.id, session.id, speaker.id, roles.member.accessUser);
    snapshot = await getMatrix2Snapshot(roles.event.id);
    const clearedSession = snapshot.sessions.find((entry) => entry.id === session.id);
    assert.ok(clearedSession);
    assert.deepEqual(clearedSession.speakerAssignments, []);

    const directory = await listSpeakers(roles.event.id, roles.member.accessUser);
    assert.equal(directory.some((entry) => entry.id === speaker.id), true);
  } finally {
    await harness.cleanup();
  }
});

test("Lifecycle journey: Speaker portal token is token-scoped, unauthenticated, revocable, and expiry-aware", async (t) => {
  const harness = createHarnessOrSkip(t, "lifecycle-portal");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const protectedRoom = await harness.createRoom({ eventId: roles.event.id, name: "Portal Stage" });
    const protectedSession = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: protectedRoom.id,
      sessionName: "Portal Session",
    });
    const protectedSpeaker = await harness.createSpeaker({
      eventId: roles.event.id,
      name: "Token Speaker",
      email: `token-${randomUUID().slice(0, 8)}@planner.test`,
    });
    await harness.createSessionSpeakerAssignment({
      sessionId: protectedSession.id,
      speakerId: protectedSpeaker.id,
    });
    await upsertSpeakerOnsiteInfo(roles.event.id, roles.member.accessUser, {
      greenRoomLocation: "Token Green Room",
      arrivalInstructions: "Check in with security.",
      badgePickupInfo: "Portal desk.",
      onsiteContact: "Casey",
      avRehearsalInfo: "Ten minutes before session.",
    });

    const otherOrg = await harness.createOrganization({ name: `Fixture Other Org ${harness.runLabel}-portal` });
    const otherClient = await harness.createClient({ orgId: otherOrg.id, name: "Other Portal Client" });
    const otherEvent = await harness.createEvent({
      orgId: otherOrg.id,
      clientId: otherClient.id,
      createdByUserId: roles.unrelatedOtherOrgMember.user.id,
      name: "Other Portal Event",
    });
    const otherSpeaker = await harness.createSpeaker({
      eventId: otherEvent.id,
      name: "Other Token Speaker",
      email: `other-token-${randomUUID().slice(0, 8)}@planner.test`,
    });

    const grant = await generateSpeakerPortalToken(
      roles.event.id,
      protectedSpeaker.id,
      roles.member.accessUser,
      { origin: "https://planner.test" },
    );
    const persistedToken = await harness.db.speakerIntakeToken.findUniqueOrThrow({
      where: { id: grant.tokenId },
      select: { tokenHash: true, eventId: true, speakerId: true, revokedAt: true },
    });
    assert.equal(persistedToken.tokenHash, hashSpeakerPortalToken(grant.token));
    assert.notEqual(persistedToken.tokenHash, grant.token);
    assert.equal(persistedToken.eventId, roles.event.id);
    assert.equal(persistedToken.speakerId, protectedSpeaker.id);
    assert.equal(persistedToken.revokedAt, null);

    const resolved = await resolveSpeakerPortalToken(grant.token);
    assert.deepEqual(resolved, {
      tokenId: grant.tokenId,
      eventId: roles.event.id,
      speakerId: protectedSpeaker.id,
    });

    const portalView = await getSpeakerPortalView(grant.token);
    assert.equal(portalView.eventName, roles.event.name);
    assert.equal(portalView.speaker.id, protectedSpeaker.id);
    assert.equal(portalView.sessions.map((entry) => entry.id).includes(protectedSession.id), true);
    assert.equal(portalView.speaker.id === otherSpeaker.id, false);
    assert.equal(portalView.onsite?.greenRoomLocation, "Token Green Room");

    const submission = await submitSpeakerPortalProfile(grant.token, {
      name: "Token Speaker Updated",
      title: "Guest Speaker",
      topics: ["Leadership"],
      noteToPlanner: "I need a confidence monitor.",
    });
    assert.equal(submission.status, "PENDING");
    assert.equal(
      await harness.db.speakerProfileSubmission.count({
        where: { eventId: roles.event.id, speakerId: protectedSpeaker.id, tokenId: grant.tokenId },
      }),
      1,
    );

    await assert.rejects(() => resolveSpeakerPortalToken("not-a-real-token"), SpeakerPortalTokenError);

    const revoked = await revokeSpeakerPortalTokens(
      roles.event.id,
      protectedSpeaker.id,
      roles.member.accessUser,
    );
    assert.equal(revoked.revoked, 1);
    await assert.rejects(
      () => resolveSpeakerPortalToken(grant.token),
      /revoked/,
    );

    const expiredGrant = await generateSpeakerPortalToken(
      roles.event.id,
      protectedSpeaker.id,
      roles.member.accessUser,
      { origin: "https://planner.test", expiresInSeconds: -1 },
    );
    await assert.rejects(
      () => resolveSpeakerPortalToken(expiredGrant.token),
      /expired/,
    );
  } finally {
    await harness.cleanup();
  }
});

test("Lifecycle journey: Cross-module tenant isolation holds for Docs, Budget, Speakers, and Matrix assignment IDs", async (t) => {
  const harness = createHarnessOrSkip(t, "lifecycle-isolation");
  if (!harness) return;

  try {
    const roles = await harness.createRoleAccessFixture();
    const protectedCategory = await harness.createDocumentCategory({
      eventId: roles.event.id,
      name: "Protected Contracts",
      slug: `protected-contracts-${harness.runLabel}`,
    });
    const protectedDoc = await harness.createDocument({
      orgId: roles.organization.id,
      eventId: roles.event.id,
      categoryId: protectedCategory.id,
      title: "Protected Contract",
    });

    const protectedBudget = await harness.createBudget({ eventId: roles.event.id });
    await harness.createBudgetVersion({
      budgetId: protectedBudget.id,
      createdByUserId: roles.owner.user.id,
      makeCurrent: true,
    });
    const protectedLineItem = await harness.createBudgetLineItem({
      budgetId: protectedBudget.id,
      lineItem: "Protected Budget Line",
    });
    const protectedRoom = await harness.createRoom({ eventId: roles.event.id, name: "Protected Room" });
    const protectedSession = await harness.createMatrixRow({
      eventId: roles.event.id,
      roomId: protectedRoom.id,
      sessionName: "Protected Session",
    });
    const protectedSpeaker = await harness.createSpeaker({
      eventId: roles.event.id,
      name: "Protected Speaker",
      email: `protected-${randomUUID().slice(0, 8)}@planner.test`,
    });

    const otherOrg = await harness.createOrganization({ name: `Fixture Other Org ${harness.runLabel}-isolation` });
    const otherClient = await harness.createClient({ orgId: otherOrg.id, name: "Other Isolation Client" });
    const otherEvent = await harness.createEvent({
      orgId: otherOrg.id,
      clientId: otherClient.id,
      createdByUserId: roles.unrelatedOtherOrgMember.user.id,
      name: "Other Isolation Event",
    });
    const otherCategory = await harness.createDocumentCategory({
      eventId: otherEvent.id,
      name: "Other Contracts",
      slug: `other-contracts-${harness.runLabel}`,
    });
    const otherDoc = await harness.createDocument({
      orgId: otherOrg.id,
      eventId: otherEvent.id,
      categoryId: otherCategory.id,
      title: "Other Contract",
    });
    const otherBudget = await harness.createBudget({ eventId: otherEvent.id });
    await harness.createBudgetVersion({
      budgetId: otherBudget.id,
      createdByUserId: roles.unrelatedOtherOrgMember.user.id,
      makeCurrent: true,
    });
    await harness.createBudgetLineItem({
      budgetId: otherBudget.id,
      lineItem: "Other Budget Line",
    });
    const otherSpeaker = await harness.createSpeaker({
      eventId: otherEvent.id,
      name: "Other Speaker",
      email: `other-${randomUUID().slice(0, 8)}@planner.test`,
    });

    const docs = await listDocumentsForEvent(roles.event.id, {});
    assert.equal(docs.documents.some((entry) => entry.id === protectedDoc.id), true);
    assert.equal(docs.documents.some((entry) => entry.id === otherDoc.id), false);

    const budgetRows = await harness.db.budgetLineItem.findMany({
      where: { budget: { eventId: roles.event.id } },
      select: { id: true, lineItem: true },
    });
    assert.equal(budgetRows.some((entry) => entry.id === protectedLineItem.id), true);
    assert.equal(budgetRows.some((entry) => entry.lineItem === "Other Budget Line"), false);

    const speakers = await listSpeakers(roles.event.id, roles.member.accessUser);
    assert.equal(speakers.some((entry) => entry.id === protectedSpeaker.id), true);
    assert.equal(speakers.some((entry) => entry.id === otherSpeaker.id), false);

    const assignmentCountBefore = await harness.db.sessionSpeakerAssignment.count({
      where: { sessionId: protectedSession.id },
    });
    await assert.rejects(
      () => addMatrix2SessionSpeakerAssignment(roles.event.id, protectedSession.id, otherSpeaker.id),
      /Speaker not found for this event/,
    );
    assert.equal(
      await harness.db.sessionSpeakerAssignment.count({ where: { sessionId: protectedSession.id } }),
      assignmentCountBefore,
    );

    await assertDenied(
      () => assertEventAccessForUser(otherEvent.id, roles.member.accessUser, "write"),
      "EVENT_OUTSIDE_ACTIVE_ORG",
    );
  } finally {
    await harness.cleanup();
  }
});

test("Lifecycle source contracts: Docs, Budget, Speaker, and portal-token routes preserve authorization boundaries", () => {
  const docsDetailRoute = readFileSync("app/api/events/[eventId]/documents/[documentId]/route.ts", "utf8");
  const docsDownloadRoute = readFileSync("app/api/events/[eventId]/documents/[documentId]/download/route.ts", "utf8");
  const docsSubmitRoute = readFileSync("app/api/events/[eventId]/documents/[documentId]/review/submit/route.ts", "utf8");
  const docsApproveRoute = readFileSync("app/api/events/[eventId]/documents/[documentId]/approve/route.ts", "utf8");
  const docsRejectRoute = readFileSync("app/api/events/[eventId]/documents/[documentId]/reject/route.ts", "utf8");
  const docsReopenRoute = readFileSync("app/api/events/[eventId]/documents/[documentId]/reopen/route.ts", "utf8");
  const docsPullBackRoute = readFileSync("app/api/events/[eventId]/documents/[documentId]/review/pull-back/route.ts", "utf8");
  const docsLinkOptionsRoute = readFileSync("app/api/events/[eventId]/documents/link-options/route.ts", "utf8");
  const budgetSubmissionApproveRoute = readFileSync(
    "app/api/events/[eventId]/budget/submissions/[submissionId]/approve/route.ts",
    "utf8",
  );
  const budgetSubmissionRejectRoute = readFileSync(
    "app/api/events/[eventId]/budget/submissions/[submissionId]/reject/route.ts",
    "utf8",
  );
  const speakersRoute = readFileSync("app/api/events/[eventId]/speakers/route.ts", "utf8");
  const speakerDetailRoute = readFileSync("app/api/events/[eventId]/speakers/[speakerId]/route.ts", "utf8");
  const matrixSpeakerAssignmentRoute = readFileSync(
    "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/speakers/[speakerId]/route.ts",
    "utf8",
  );
  const portalLinkRoute = readFileSync(
    "app/api/events/[eventId]/speakers/[speakerId]/portal-link/route.ts",
    "utf8",
  );

  for (const source of [
    docsDetailRoute,
    docsDownloadRoute,
    docsSubmitRoute,
    docsApproveRoute,
    docsRejectRoute,
    docsReopenRoute,
    docsPullBackRoute,
    docsLinkOptionsRoute,
  ]) {
    assert.equal(source.includes("resolveRequestUser(request)"), true);
    assert.equal(source.includes("assertEventAccessForUser"), true);
    assert.equal(source.includes("error instanceof EventAccessError"), true);
  }

  assert.equal(docsDetailRoute.includes('assertEventAccessForUser(eventId, currentUserResult.user, "read")'), true);
  assert.equal(docsDetailRoute.includes('assertEventAccessForUser(eventId, currentUserResult.user, "write")'), true);
  assert.equal(docsDownloadRoute.includes('assertEventAccessForUser(eventId, currentUserResult.user, "read")'), true);
  for (const source of [docsSubmitRoute, docsApproveRoute, docsRejectRoute, docsReopenRoute, docsPullBackRoute]) {
    assert.equal(source.includes('assertEventAccessForUser(eventId, currentUserResult.user, "write")'), true);
  }

  for (const source of [budgetSubmissionApproveRoute, budgetSubmissionRejectRoute]) {
    assert.equal(source.includes('requireBudgetRouteAccess(request, eventId, "write")'), true);
    assert.equal(source.includes("decideBudgetSubmission(eventId, submissionId"), true);
  }

  assert.equal(speakersRoute.includes("createSpeaker(eventId, authResult.user"), true);
  assert.equal(speakerDetailRoute.includes("updateSpeaker(eventId, speakerId, authResult.user"), true);
  assert.equal(speakerDetailRoute.includes("deleteSpeaker(eventId, speakerId, authResult.user"), true);
  assert.equal(matrixSpeakerAssignmentRoute.includes('assertEventAccessForUser(eventId, authResult.user, "write")'), true);
  assert.equal(portalLinkRoute.includes("generateSpeakerPortalToken(eventId, speakerId, authResult.user"), true);
  assert.equal(portalLinkRoute.includes("getSpeakerPortalTokenStatus(eventId, speakerId, authResult.user"), true);
  assert.equal(portalLinkRoute.includes("revokeSpeakerPortalTokens(eventId, speakerId, authResult.user"), true);
});
