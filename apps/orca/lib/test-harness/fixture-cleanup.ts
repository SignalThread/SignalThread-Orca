import type { Organization, Prisma, PrismaClient } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  TEST_FIXTURE_ORG_NAME_PREFIXES,
  TEST_FIXTURE_ORG_SLUG_PREFIXES,
  hasTestFixtureOrganizationIdentity,
} from "@/lib/test-fixture-orgs";

type Db = PrismaClient;

type OrganizationIdentity = Pick<Organization, "id" | "name" | "slug" | "createdAt">;

export type CleanupTestFixtureOrganizationsOptions = Readonly<{
  db?: Db;
  orgIds?: readonly string[];
  testRunId?: string;
  prefix?: string;
  dryRun?: boolean;
  olderThan?: Date;
}>;

export type CleanupTestFixtureOrganizationsSummary = Readonly<{
  dryRun: boolean;
  organizationIds: string[];
  organizationNames: string[];
  eventIds: string[];
  userIds: string[];
  deletedOrganizations: number;
  deletedEvents: number;
  deletedUsers: number;
}>;

function unique(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function slugFor(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function containsAnyRunMarker(organization: OrganizationIdentity, marker: string): boolean {
  const normalized = slugFor(marker);
  return organization.name.includes(marker) || organization.slug.includes(normalized);
}

function buildCandidateWhere(input: CleanupTestFixtureOrganizationsOptions): Prisma.OrganizationWhereInput {
  const filters: Prisma.OrganizationWhereInput[] = [];

  if (input.orgIds?.length) {
    filters.push({ id: { in: unique([...input.orgIds]) } });
  }

  const marker = input.testRunId?.trim() || input.prefix?.trim();
  if (marker) {
    const normalized = slugFor(marker);
    filters.push({
      OR: [
        ...TEST_FIXTURE_ORG_NAME_PREFIXES.map((prefix) => ({ name: { startsWith: `${prefix}${marker}` } })),
        ...TEST_FIXTURE_ORG_SLUG_PREFIXES.map((prefix) => ({ slug: { startsWith: `${prefix}${normalized}` } })),
        { name: { contains: marker } },
        { slug: { contains: normalized } },
      ],
    });
  }

  if (filters.length === 0) {
    filters.push({
      OR: [
        ...TEST_FIXTURE_ORG_NAME_PREFIXES.map((prefix) => ({ name: { startsWith: prefix } })),
        ...TEST_FIXTURE_ORG_SLUG_PREFIXES.map((prefix) => ({ slug: { startsWith: prefix } })),
      ],
    });
  }

  const where: Prisma.OrganizationWhereInput = { OR: filters };
  if (input.olderThan) {
    where.createdAt = { lt: input.olderThan };
  }
  return where;
}

async function findCandidateOrganizations(
  db: Db,
  input: CleanupTestFixtureOrganizationsOptions,
): Promise<OrganizationIdentity[]> {
  const organizations = await db.organization.findMany({
    where: buildCandidateWhere(input),
    select: { id: true, name: true, slug: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const marker = input.testRunId?.trim() || input.prefix?.trim() || null;
  return organizations.filter((organization) => {
    if (!hasTestFixtureOrganizationIdentity(organization)) return false;
    return marker ? containsAnyRunMarker(organization, marker) : true;
  });
}

async function deleteMatrixRowStaffAssignments(db: Prisma.TransactionClient, matrixRowIds: readonly string[]): Promise<void> {
  if (matrixRowIds.length === 0) return;

  await db.$executeRaw`
    DELETE FROM "MatrixRowStaffAssignment"
    WHERE "matrixRowId"::text = ANY(${matrixRowIds}::text[])
  `;
}

async function getExistingPublicTables(db: Db, tableNames: readonly string[]): Promise<Set<string>> {
  if (tableNames.length === 0) return new Set();

  const rows = await db.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    tableNames,
  );
  return new Set(rows.map((row) => row.table_name));
}

export async function listTestFixtureOrganizations(
  options: CleanupTestFixtureOrganizationsOptions = {},
): Promise<OrganizationIdentity[]> {
  const db = options.db ?? getPrisma();
  return findCandidateOrganizations(db, options);
}

export async function cleanupTestFixtureOrganizations(
  options: CleanupTestFixtureOrganizationsOptions = {},
): Promise<CleanupTestFixtureOrganizationsSummary> {
  const db = options.db ?? getPrisma();
  const organizations = await findCandidateOrganizations(db, options);
  const organizationIds = organizations.map((organization) => organization.id);
  const organizationNames = organizations.map((organization) => organization.name);

  if (organizationIds.length === 0) {
    return {
      dryRun: Boolean(options.dryRun),
      organizationIds: [],
      organizationNames: [],
      eventIds: [],
      userIds: [],
      deletedOrganizations: 0,
      deletedEvents: 0,
      deletedUsers: 0,
    };
  }

  const [events, users, clients, documents, documentApprovals, budgets, tasks] = await Promise.all([
    db.event.findMany({ where: { orgId: { in: organizationIds } }, select: { id: true } }),
    db.user.findMany({ where: { orgId: { in: organizationIds } }, select: { id: true } }),
    db.client.findMany({ where: { orgId: { in: organizationIds } }, select: { id: true } }),
    db.document.findMany({ where: { orgId: { in: organizationIds } }, select: { id: true } }),
    db.documentApproval.findMany({
      where: { document: { orgId: { in: organizationIds } } },
      select: { id: true },
    }),
    db.budget.findMany({
      where: { event: { orgId: { in: organizationIds } } },
      select: { id: true },
    }),
    db.task.findMany({ where: { orgId: { in: organizationIds } }, select: { id: true } }),
  ]);

  const eventIds = events.map((event) => event.id);
  const userIds = users.map((user) => user.id);
  const clientIds = clients.map((client) => client.id);
  const documentIds = documents.map((document) => document.id);
  const documentApprovalIds = documentApprovals.map((approval) => approval.id);
  const budgetIds = budgets.map((budget) => budget.id);
  const taskIds = tasks.map((task) => task.id);
  const existingTables = await getExistingPublicTables(db, [
    "SessionStaffAssignment",
    "SessionSpeaker",
    "MatrixRowStaffAssignment",
  ]);

  if (options.dryRun) {
    return {
      dryRun: true,
      organizationIds,
      organizationNames,
      eventIds,
      userIds,
      deletedOrganizations: 0,
      deletedEvents: 0,
      deletedUsers: 0,
    };
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const [budgetVersions, budgetLineItems, matrixRows, fnbAssignments, seatingPlans, directoryPeople, attendees] =
      await Promise.all([
        tx.budgetVersion.findMany({ where: { budgetId: { in: budgetIds } }, select: { id: true } }),
        tx.budgetLineItem.findMany({ where: { budgetId: { in: budgetIds } }, select: { id: true } }),
        tx.matrixRow.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } }),
        tx.sessionFnbCatalogAssignment.findMany({
          where: { session: { eventId: { in: eventIds } } },
          select: { id: true },
        }),
        tx.seatingPlan.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } }),
        tx.eventDirectoryPerson.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } }),
        tx.eventAttendee.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } }),
      ]);

    const budgetVersionIds = budgetVersions.map((version) => version.id);
    const budgetLineItemIds = budgetLineItems.map((lineItem) => lineItem.id);
    const matrixRowIds = matrixRows.map((row) => row.id);
    const fnbAssignmentIds = fnbAssignments.map((assignment) => assignment.id);
    const seatingPlanIds = seatingPlans.map((plan) => plan.id);
    const directoryPersonIds = directoryPeople.map((person) => person.id);
    const attendeeIds = attendees.map((attendee) => attendee.id);

    await tx.notification.deleteMany({
      where: {
        OR: [
          { orgId: { in: organizationIds } },
          { userId: { in: userIds } },
          { actorUserId: { in: userIds } },
          { eventId: { in: eventIds } },
          { documentId: { in: documentIds } },
        ],
      },
    });
    await tx.copilotAuditLog.deleteMany({ where: { orgId: { in: organizationIds } } });

    await tx.taskWatcher.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.taskAssignment.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.taskComment.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.taskActivity.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.taskLink.deleteMany({ where: { taskId: { in: taskIds } } });
    await tx.task.deleteMany({ where: { id: { in: taskIds } } });

    await tx.marketingEmailEvent.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.marketingEmailSendRecipient.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.marketingKpiSnapshot.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.marketingEmailSend.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.marketingAudienceRecipient.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.marketingSuppression.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.marketingAudience.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.marketingCampaign.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.marketingPlan.deleteMany({ where: { eventId: { in: eventIds } } });

    await tx.eventAttendeeSessionEnrollment.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventExternalIdentity.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventRegistrationRecord.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.seatingAssignment.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.seatingAttendee.updateMany({
      where: { eventId: { in: eventIds }, eventAttendeeId: { in: attendeeIds } },
      data: { eventAttendeeId: null },
    });
    await tx.seatingAttendee.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventAttendee.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventDirectoryModuleLink.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventDirectoryExternalIdentity.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventDirectoryImportRow.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventDirectoryRole.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventDirectoryImportBatch.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventDirectorySource.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventDirectoryPerson.deleteMany({ where: { id: { in: directoryPersonIds } } });

    await tx.speakerMessage.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.speakerInternalNote.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.speakerDocumentRequest.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.speakerEmailLog.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.speakerProfileSubmission.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.speakerIntakeToken.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.speakerReadinessItem.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.speakerFile.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.speakerOnsiteInfo.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.speaker.deleteMany({ where: { eventId: { in: eventIds } } });

    await tx.timelineDependency.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.timelineItem.updateMany({
      where: { eventId: { in: eventIds } },
      data: { parentId: null },
    });
    await tx.timelineItem.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.deadline.updateMany({
      where: { eventId: { in: eventIds } },
      data: { dependsOnDeadlineId: null },
    });
    await tx.deadline.deleteMany({ where: { eventId: { in: eventIds } } });

    await tx.documentApprovalRecipient.deleteMany({ where: { approvalId: { in: documentApprovalIds } } });
    await tx.documentApproval.deleteMany({ where: { id: { in: documentApprovalIds } } });
    await tx.documentTagOnDocument.deleteMany({ where: { documentId: { in: documentIds } } });
    await tx.documentLink.deleteMany({ where: { documentId: { in: documentIds } } });
    await tx.documentVersion.deleteMany({ where: { documentId: { in: documentIds } } });
    await tx.fnbParserFeedback.deleteMany({ where: { orgId: { in: organizationIds } } });
    await tx.document.deleteMany({ where: { id: { in: documentIds } } });
    await tx.documentCategory.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.documentTag.deleteMany({ where: { orgId: { in: organizationIds } } });

    await tx.sessionFnbCatalogAssignmentTax.deleteMany({ where: { assignmentId: { in: fnbAssignmentIds } } });
    await tx.sessionFnbCatalogAssignment.deleteMany({ where: { id: { in: fnbAssignmentIds } } });
    await tx.sessionRequirementSelection.deleteMany({ where: { sessionId: { in: matrixRowIds } } });
    await tx.sessionRequirementSelection.deleteMany({ where: { budgetLineItemId: { in: budgetLineItemIds } } });
    await tx.budget.updateMany({
      where: { id: { in: budgetIds } },
      data: { currentVersionId: null },
    });
    await tx.budgetSubmissionRecipient.deleteMany({
      where: { submission: { budgetId: { in: budgetIds } } },
    });
    await tx.budgetSubmissionLineItem.deleteMany({
      where: { submission: { budgetId: { in: budgetIds } } },
    });
    await tx.budgetSubmission.deleteMany({ where: { budgetId: { in: budgetIds } } });
    await tx.budgetActivity.deleteMany({ where: { budgetId: { in: budgetIds } } });
    await tx.budgetApproval.deleteMany({ where: { budgetVersionId: { in: budgetVersionIds } } });
    await tx.budgetItem.deleteMany({ where: { budgetVersionId: { in: budgetVersionIds } } });
    await tx.budgetLineItem.deleteMany({ where: { id: { in: budgetLineItemIds } } });
    await tx.budgetGroup.deleteMany({ where: { budgetId: { in: budgetIds } } });
    await tx.budgetCategoryTarget.deleteMany({ where: { budgetId: { in: budgetIds } } });
    await tx.budgetVersion.deleteMany({ where: { id: { in: budgetVersionIds } } });
    await tx.budget.deleteMany({ where: { id: { in: budgetIds } } });

    await tx.sessionAVRequirement.deleteMany({ where: { sessionId: { in: matrixRowIds } } });
    await tx.sessionFoodService.deleteMany({ where: { sessionId: { in: matrixRowIds } } });
    if (existingTables.has("SessionStaffAssignment")) {
      await tx.sessionStaffAssignment.deleteMany({ where: { sessionId: { in: matrixRowIds } } });
    }
    if (existingTables.has("SessionSpeaker")) {
      await tx.$executeRawUnsafe('DELETE FROM "SessionSpeaker" WHERE "sessionId" = ANY($1::uuid[])', matrixRowIds);
    }
    await tx.sessionSpeakerAssignment.deleteMany({ where: { sessionId: { in: matrixRowIds } } });
    if (existingTables.has("MatrixRowStaffAssignment")) {
      await deleteMatrixRowStaffAssignments(tx, matrixRowIds);
    }
    await tx.seatingAssignment.deleteMany({ where: { seatingPlanId: { in: seatingPlanIds } } });
    await tx.seatingTable.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.seatingPlan.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.event.updateMany({
      where: { id: { in: eventIds } },
      data: { sessionRequirementTemplateId: null },
    });
    await tx.sessionRequirementItem.deleteMany({ where: { section: { template: { eventId: { in: eventIds } } } } });
    await tx.sessionRequirementSection.deleteMany({ where: { template: { eventId: { in: eventIds } } } });
    await tx.sessionRequirementTemplate.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.matrixRow.deleteMany({ where: { id: { in: matrixRowIds } } });
    await tx.room.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventFnbCatalogItem.updateMany({
      where: { eventId: { in: eventIds } },
      data: { sourceMenuId: null },
    });
    await tx.eventFnbCatalogItem.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventFnbSourceMenu.updateMany({
      where: { eventId: { in: eventIds } },
      data: { baseSourceMenuId: null },
    });
    await tx.eventFnbSourceMenu.deleteMany({ where: { eventId: { in: eventIds } } });

    await tx.eventActivity.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventIntegrationMetric.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventIntegrationConnection.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventImportResult.deleteMany({ where: { orgId: { in: organizationIds } } });
    await tx.eventImportIntent.deleteMany({ where: { orgId: { in: organizationIds } } });
    await tx.eventMember.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.eventPerson.deleteMany({ where: { eventId: { in: eventIds } } });
    await tx.event.deleteMany({ where: { id: { in: eventIds } } });
    await tx.client.deleteMany({ where: { id: { in: clientIds } } });
    await tx.membership.deleteMany({ where: { orgId: { in: organizationIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.organization.deleteMany({ where: { id: { in: organizationIds } } });
  }, { maxWait: 10_000, timeout: 120_000 });

  const remaining = await db.organization.count({ where: { id: { in: organizationIds } } });
  if (remaining !== 0) {
    throw new Error(`Fixture cleanup verification failed: ${remaining} organization(s) still remain.`);
  }

  return {
    dryRun: false,
    organizationIds,
    organizationNames,
    eventIds,
    userIds,
    deletedOrganizations: organizationIds.length,
    deletedEvents: eventIds.length,
    deletedUsers: userIds.length,
  };
}
