import { config as loadEnv } from "dotenv";
import {
  BudgetLineItemApproval,
  BudgetActivityType,
  BudgetItemStatus,
  BudgetLineItemStatus,
  BudgetStatus,
  DeadlineCategory,
  DeadlineStatus,
  DocumentApprovalStatus,
  DocumentLinkType,
  DocumentStatus,
  DocumentVisibility,
  EventAttendeeAttendanceStatus,
  EventAttendeePortalStatus,
  EventAttendeeRegistrationStatus,
  EventAttendeeSource,
  EventAttendeeSyncStatus,
  EventDirectoryImportRowResult,
  EventDirectoryImportStatus,
  EventDirectoryPersonStatus,
  EventDirectoryRoleType,
  EventDirectorySourceType,
  EventDirectorySyncStatus,
  EventMemberRole,
  EventStatus,
  MarketingCampaignStatus,
  MarketingEmailEventType,
  MarketingEmailRecipientStatus,
  MarketingEmailSendStatus,
  MarketingSuppressionReason,
  MarketingSuppressionSource,
  MealPeriod,
  SpeakerFileKind,
  SpeakerFileReviewStatus,
  SpeakerStatus,
  SpeakerSubmissionStatus,
  TimelineDependencyType,
  TimelinePriority,
  TimelineStatus,
  TimelineWorkstream,
  UserRole,
} from "@prisma/client";
import { getPrisma } from "../src/server/db/prisma";
import { createNotification } from "../src/server/services/notifications";

loadEnv({ path: "../.env.local" });
loadEnv({ path: ".env.local" });
loadEnv();

const prisma = getPrisma();

const ORG_SLUG = "orca-help-center-demo";
const EVENT_NAME = "Annual Sales Conference 2026";
const EVENT_SLUG_DATE_START = new Date("2026-10-12T00:00:00.000Z");
const EVENT_SLUG_DATE_END = new Date("2026-10-15T00:00:00.000Z");
const EVENT_ID = "ae4325f3-6a76-469e-ab50-78d0dcd4a4aa";
const EVENT_TIMEZONE = "America/New_York";
const EVENT_ORIGIN = "http://127.0.0.1:3100";
const PORTFOLIO_SUPPORT_EVENTS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Partner Growth Summit 2027",
    startDate: new Date("2027-02-09T00:00:00.000Z"),
    endDate: new Date("2027-02-11T00:00:00.000Z"),
    venueName: "Omni Nashville Hotel",
    city: "Nashville",
    state: "TN",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Customer Advisory Forum 2026",
    startDate: new Date("2026-11-09T00:00:00.000Z"),
    endDate: new Date("2026-11-10T00:00:00.000Z"),
    venueName: "Loews Chicago O'Hare Hotel",
    city: "Rosemont",
    state: "IL",
  },
] as const;

type SeedUser = {
  id: string;
  email: string;
  orgId: string;
  role: UserRole;
};

type SeedDirectoryPerson = {
  id: string;
  displayName: string;
  email: string | null;
};

function logStep(label: string) {
  console.log(`\n[help-seed] ${label}`);
}

function startOfDay(value: Date): Date {
  const copy = new Date(value);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function addDays(value: Date, days: number): Date {
  const copy = new Date(value);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function atTime(value: Date, hour: number, minute: number): Date {
  const copy = new Date(value);
  copy.setUTCHours(hour, minute, 0, 0);
  return copy;
}

function normalizeEmail(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function isMissingTable(error: unknown, tableName: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes(`table \`public.${tableName}\` does not exist`) ||
    message.includes(`relation "${tableName}" does not exist`)
  );
}

async function deleteSessionStaffAssignmentsForEvent(eventId: string) {
  try {
    await prisma.sessionStaffAssignment.deleteMany({
      where: { session: { eventId } },
    });
  } catch (error) {
    if (!isMissingTable(error, "SessionStaffAssignment")) throw error;
    await prisma.$executeRawUnsafe(
      `DELETE FROM "MatrixRowStaffAssignment"
       WHERE "matrixRowId" IN (SELECT id FROM "MatrixRow" WHERE "eventId" = $1::uuid)`,
      eventId,
    );
  }
}

async function deleteLegacySessionSpeakersForEvent(eventId: string) {
  try {
    await prisma.$executeRawUnsafe(
      'DELETE FROM "SessionSpeaker" WHERE "sessionId" IN (SELECT "id" FROM "MatrixRow" WHERE "eventId" = $1::uuid)',
      eventId,
    );
  } catch (error) {
    if (!isMissingTable(error, "SessionSpeaker")) throw error;
  }
}

async function upsertUser(input: {
  orgId: string;
  email: string;
  name: string;
  role: UserRole;
}): Promise<SeedUser> {
  const user = await prisma.user.upsert({
    where: { email: input.email },
    update: {
      orgId: input.orgId,
      name: input.name,
      role: input.role,
    },
    create: {
      orgId: input.orgId,
      email: input.email,
      name: input.name,
      role: input.role,
    },
    select: { id: true, email: true, orgId: true, role: true },
  });

  await prisma.membership.upsert({
    where: {
      orgId_userId: {
        orgId: input.orgId,
        userId: user.id,
      },
    },
    update: {},
    create: {
      orgId: input.orgId,
      userId: user.id,
    },
  });

  return user;
}

async function ensureOrganizationAndUsers() {
  const organization = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: "Orca Help Center Demo" },
    create: {
      slug: ORG_SLUG,
      name: "Orca Help Center Demo",
    },
  });

  const demo = await upsertUser({
    orgId: organization.id,
    email: "help-center@planneros.com",
    name: "Help Center Planner",
    role: UserRole.OWNER,
  });
  const sarah = await upsertUser({
    orgId: organization.id,
    email: "sarah.martinez@planneros.com",
    name: "Sarah Martinez",
    role: UserRole.ADMIN,
  });
  const emily = await upsertUser({
    orgId: organization.id,
    email: "emily.chen@planneros.com",
    name: "Emily Chen",
    role: UserRole.ADMIN,
  });
  const john = await upsertUser({
    orgId: organization.id,
    email: "john.smith@planneros.com",
    name: "John Smith",
    role: UserRole.MEMBER,
  });

  return { organization, demo, sarah, emily, john };
}

async function ensureClient(orgId: string) {
  return prisma.client.upsert({
    where: {
      orgId_slug: {
        orgId,
        slug: "annual-sales-conference",
      },
    },
    update: {
      name: "Annual Internal Sales Conference",
    },
    create: {
      orgId,
      slug: "annual-sales-conference",
      name: "Annual Internal Sales Conference",
    },
  });
}

async function ensureEvent(orgId: string, clientId: string, createdByUserId: string) {
  const existing = await prisma.event.findUnique({
    where: { id: EVENT_ID },
    select: { id: true },
  });

  if (existing) {
    return prisma.event.update({
      where: { id: EVENT_ID },
      data: {
        orgId,
        clientId,
        name: EVENT_NAME,
        startDate: EVENT_SLUG_DATE_START,
        endDate: EVENT_SLUG_DATE_END,
        timezone: EVENT_TIMEZONE,
        venueName: "JW Marriott Orlando Grande Lakes",
        city: "Orlando",
        state: "FL",
        status: EventStatus.ACTIVE,
        createdByUserId,
      },
    });
  }

  return prisma.event.create({
    data: {
      id: EVENT_ID,
      orgId,
      clientId,
      name: EVENT_NAME,
      startDate: EVENT_SLUG_DATE_START,
      endDate: EVENT_SLUG_DATE_END,
      timezone: EVENT_TIMEZONE,
      venueName: "JW Marriott Orlando Grande Lakes",
      city: "Orlando",
      state: "FL",
      status: EventStatus.ACTIVE,
      createdByUserId,
    },
  });
}

async function ensurePortfolioSupportEvents(orgId: string, clientId: string, createdByUserId: string) {
  const events = [];
  for (const definition of PORTFOLIO_SUPPORT_EVENTS) {
    const event = await prisma.event.upsert({
      where: { id: definition.id },
      update: {
        orgId,
        clientId,
        name: definition.name,
        startDate: definition.startDate,
        endDate: definition.endDate,
        timezone: EVENT_TIMEZONE,
        venueName: definition.venueName,
        city: definition.city,
        state: definition.state,
        status: EventStatus.ACTIVE,
        createdByUserId,
      },
      create: {
        id: definition.id,
        orgId,
        clientId,
        name: definition.name,
        startDate: definition.startDate,
        endDate: definition.endDate,
        timezone: EVENT_TIMEZONE,
        venueName: definition.venueName,
        city: definition.city,
        state: definition.state,
        status: EventStatus.ACTIVE,
        createdByUserId,
      },
    });
    events.push(event);
  }
  return events;
}

async function ensureEventMembers(eventId: string, users: SeedUser[]) {
  for (const user of users) {
    await prisma.eventMember.upsert({
      where: {
        eventId_userId: {
          eventId,
          userId: user.id,
        },
      },
      update: {
        eventRole: EventMemberRole.EVENT_EDITOR,
      },
      create: {
        eventId,
        userId: user.id,
        eventRole: EventMemberRole.EVENT_EDITOR,
      },
    });
  }
}

async function resetEventScopedData(eventId: string) {
  await prisma.notification.deleteMany({ where: { eventId } });
  await prisma.marketingEmailEvent.deleteMany({ where: { eventId } });
  await prisma.marketingEmailSendRecipient.deleteMany({ where: { eventId } });
  await prisma.marketingEmailSend.deleteMany({ where: { eventId } });
  await prisma.marketingAudienceRecipient.deleteMany({ where: { eventId } });
  await prisma.marketingAudience.deleteMany({ where: { eventId } });
  await prisma.marketingKpiSnapshot.deleteMany({ where: { eventId } });
  await prisma.marketingCampaign.deleteMany({ where: { eventId } });
  await prisma.marketingPlan.deleteMany({ where: { eventId } });
  await prisma.marketingSuppression.deleteMany({ where: { eventId } });

  await prisma.documentApprovalRecipient.deleteMany({
    where: {
      approval: {
        document: { eventId },
      },
    },
  });
  await prisma.documentTagOnDocument.deleteMany({
    where: {
      document: { eventId },
    },
  });
  await prisma.documentLink.deleteMany({
    where: {
      document: { eventId },
    },
  });
  await prisma.documentApproval.deleteMany({
    where: {
      document: { eventId },
    },
  });
  await prisma.documentVersion.deleteMany({
    where: {
      document: { eventId },
    },
  });
  await prisma.document.deleteMany({ where: { eventId } });
  await prisma.documentCategory.deleteMany({ where: { eventId } });

  await prisma.speakerMessage.deleteMany({ where: { eventId } });
  await prisma.speakerInternalNote.deleteMany({ where: { eventId } });
  await prisma.speakerEmailLog.deleteMany({ where: { eventId } });
  await prisma.speakerDocumentRequest.deleteMany({ where: { eventId } });
  await prisma.speakerFile.deleteMany({ where: { eventId } });
  await prisma.speakerProfileSubmission.deleteMany({ where: { eventId } });
  await prisma.speakerIntakeToken.deleteMany({ where: { eventId } });
  await prisma.speakerReadinessItem.deleteMany({ where: { eventId } });
  await prisma.sessionSpeakerAssignment.deleteMany({
    where: { session: { eventId } },
  });
  await prisma.speaker.deleteMany({ where: { eventId } });

  await deleteSessionStaffAssignmentsForEvent(eventId);
  await deleteLegacySessionSpeakersForEvent(eventId);
  await prisma.eventPerson.deleteMany({ where: { eventId } });

  await prisma.sessionFnbCatalogAssignmentTax.deleteMany({
    where: { assignment: { session: { eventId } } },
  });
  await prisma.sessionFnbCatalogAssignment.deleteMany({
    where: { session: { eventId } },
  });
  await prisma.sessionFoodService.deleteMany({
    where: { session: { eventId } },
  });
  await prisma.sessionAVRequirement.deleteMany({
    where: { session: { eventId } },
  });
  await prisma.eventFnbCatalogItem.deleteMany({ where: { eventId } });

  await prisma.sessionRequirementSelection.deleteMany({
    where: { session: { eventId } },
  });
  await prisma.sessionRequirementItem.deleteMany({
    where: { section: { template: { eventId } } },
  });
  await prisma.sessionRequirementSection.deleteMany({
    where: { template: { eventId } },
  });
  await prisma.sessionRequirementTemplate.deleteMany({ where: { eventId } });

  await prisma.eventAttendeeSessionEnrollment.deleteMany({ where: { eventId } });
  await prisma.eventRegistrationRecord.deleteMany({ where: { eventId } });
  await prisma.eventAttendee.deleteMany({ where: { eventId } });
  await prisma.eventDirectoryImportRow.deleteMany({ where: { eventId } });
  await prisma.eventDirectoryImportBatch.deleteMany({ where: { eventId } });
  await prisma.eventDirectoryExternalIdentity.deleteMany({ where: { eventId } });
  await prisma.eventDirectoryModuleLink.deleteMany({ where: { eventId } });
  await prisma.eventDirectoryRole.deleteMany({ where: { eventId } });
  await prisma.eventDirectorySource.deleteMany({ where: { eventId } });
  await prisma.eventDirectoryPerson.deleteMany({ where: { eventId } });

  await prisma.seatingAssignment.deleteMany({ where: { eventId } });
  await prisma.seatingAttendee.deleteMany({ where: { eventId } });
  await prisma.seatingTable.deleteMany({ where: { eventId } });
  await prisma.seatingPlan.deleteMany({ where: { eventId } });

  await prisma.timelineDependency.deleteMany({
    where: {
      OR: [
        { predecessor: { eventId } },
        { successor: { eventId } },
      ],
    },
  });
  await prisma.timelineItem.deleteMany({ where: { eventId } });
  await prisma.deadline.deleteMany({ where: { eventId } });

  const budget = await prisma.budget.findUnique({
    where: { eventId },
    select: { id: true },
  });

  if (budget) {
    await prisma.budgetSubmissionLineItem.deleteMany({
      where: {
        submission: { budgetId: budget.id },
      },
    });
    await prisma.budgetSubmissionRecipient.deleteMany({
      where: {
        submission: { budgetId: budget.id },
      },
    });
    await prisma.budgetSubmission.deleteMany({ where: { budgetId: budget.id } });
    await prisma.budgetApproval.deleteMany({
      where: {
        budgetVersion: { budgetId: budget.id },
      },
    });
    await prisma.budgetItem.deleteMany({
      where: {
        budgetVersion: { budgetId: budget.id },
      },
    });
    await prisma.budgetVersion.deleteMany({ where: { budgetId: budget.id } });
    await prisma.budgetActivity.deleteMany({ where: { budgetId: budget.id } });
    await prisma.budgetLineItem.deleteMany({ where: { budgetId: budget.id } });
    await prisma.budget.update({
      where: { id: budget.id },
      data: {
        status: BudgetStatus.DRAFT,
        submittedAt: null,
        submittedByUserId: null,
        approvedAt: null,
        approvedByUserId: null,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectionReason: null,
        lockedAt: null,
        currentVersionId: null,
      },
    });
  }

  await prisma.matrixRow.deleteMany({ where: { eventId } });
  await prisma.room.deleteMany({ where: { eventId } });
}

async function seedRoadmap(eventId: string, ownerId: string) {
  const items = [
    ["Confirm venue master services agreement", "2026-07-15", "2026-07-22", TimelineStatus.COMPLETE, TimelineWorkstream.VENUE, TimelinePriority.HIGH],
    ["Launch attendee registration site", "2026-07-20", "2026-07-29", TimelineStatus.COMPLETE, TimelineWorkstream.MARKETING, TimelinePriority.HIGH],
    ["Publish sponsorship prospectus", "2026-07-24", "2026-08-03", TimelineStatus.IN_PROGRESS, TimelineWorkstream.MARKETING, TimelinePriority.MEDIUM],
    ["Approve keynote travel policy", "2026-07-28", "2026-08-06", TimelineStatus.AT_RISK, TimelineWorkstream.SPEAKERS, TimelinePriority.HIGH],
    ["Submit first-round AV design", "2026-08-04", "2026-08-13", TimelineStatus.IN_PROGRESS, TimelineWorkstream.PRODUCTION, TimelinePriority.HIGH],
    ["Finalize breakout room inventory", "2026-08-05", "2026-08-18", TimelineStatus.NOT_STARTED, TimelineWorkstream.VENUE, TimelinePriority.MEDIUM],
    ["Send speaker intake packets", "2026-08-06", "2026-08-12", TimelineStatus.COMPLETE, TimelineWorkstream.SPEAKERS, TimelinePriority.HIGH],
    ["Lock rooming list with hotel", "2026-08-12", "2026-08-21", TimelineStatus.IN_PROGRESS, TimelineWorkstream.HOUSING, TimelinePriority.HIGH],
    ["Confirm regional breakout facilitators", "2026-08-14", "2026-08-28", TimelineStatus.AT_RISK, TimelineWorkstream.SPEAKERS, TimelinePriority.HIGH],
    ["Review awards dinner entertainment holds", "2026-08-18", "2026-08-29", TimelineStatus.NOT_STARTED, TimelineWorkstream.VENUE, TimelinePriority.MEDIUM],
    ["Complete catering package selection", "2026-08-20", "2026-09-03", TimelineStatus.IN_PROGRESS, TimelineWorkstream.FNB, TimelinePriority.HIGH],
    ["Issue signage production brief", "2026-08-24", "2026-09-04", TimelineStatus.NOT_STARTED, TimelineWorkstream.MARKETING, TimelinePriority.MEDIUM],
    ["Approve executive keynote deck", "2026-09-01", "2026-09-09", TimelineStatus.AT_RISK, TimelineWorkstream.SPEAKERS, TimelinePriority.HIGH],
    ["Run crisis communications tabletop", "2026-09-02", "2026-09-10", TimelineStatus.NOT_STARTED, TimelineWorkstream.REGISTRATION, TimelinePriority.HIGH],
    ["Validate onsite staffing roster", "2026-09-08", "2026-09-17", TimelineStatus.IN_PROGRESS, TimelineWorkstream.PRODUCTION, TimelinePriority.HIGH],
    ["Freeze mobile app agenda", "2026-09-10", "2026-09-18", TimelineStatus.NOT_STARTED, TimelineWorkstream.MARKETING, TimelinePriority.MEDIUM],
    ["Confirm sponsor booth assignments", "2026-09-14", "2026-09-24", TimelineStatus.NOT_STARTED, TimelineWorkstream.SPONSORS, TimelinePriority.MEDIUM],
    ["Collect final BEO signatures", "2026-09-18", "2026-09-29", TimelineStatus.IN_PROGRESS, TimelineWorkstream.FNB, TimelinePriority.HIGH],
    ["Finalize load-in and rehearsal schedule", "2026-09-22", "2026-10-02", TimelineStatus.NOT_STARTED, TimelineWorkstream.PRODUCTION, TimelinePriority.HIGH],
    ["Execute final 30-day risk review", "2026-10-01", "2026-10-06", TimelineStatus.NOT_STARTED, TimelineWorkstream.REGISTRATION, TimelinePriority.HIGH],
  ] as const;

  const created: Array<{ id: string; title: string }> = [];
  for (const [title, start, end, status, workstream, priority] of items) {
    const item = await prisma.timelineItem.create({
      data: {
        eventId,
        ownerUserId: ownerId,
        title,
        startDate: new Date(`${start}T00:00:00.000Z`),
        endDate: new Date(`${end}T00:00:00.000Z`),
        status,
        workstream,
        priority,
        progress:
          status === TimelineStatus.COMPLETE ? 100 :
          status === TimelineStatus.IN_PROGRESS ? 55 :
          status === TimelineStatus.AT_RISK ? 35 : 0,
        sortOrder: created.length + 1,
      },
      select: { id: true, title: true },
    });
    created.push(item);
  }

  const dependencyPairs = [
    ["Send speaker intake packets", "Approve executive keynote deck"],
    ["Submit first-round AV design", "Finalize load-in and rehearsal schedule"],
    ["Complete catering package selection", "Collect final BEO signatures"],
  ];

  for (const [predecessor, successor] of dependencyPairs) {
    const predecessorItem = created.find((item) => item.title === predecessor);
    const successorItem = created.find((item) => item.title === successor);
    if (!predecessorItem || !successorItem) continue;
    await prisma.timelineDependency.create({
      data: {
        eventId,
        predecessorItemId: predecessorItem.id,
        successorItemId: successorItem.id,
        type: TimelineDependencyType.FINISH_TO_START,
      },
    });
  }
}

async function seedDeadlines(eventId: string) {
  const deadlines = [
    ["Speaker headshot deadline", "2026-07-25", DeadlineCategory.LOGISTICS],
    ["First sponsor email send", "2026-08-01", DeadlineCategory.REGISTRATION],
    ["A/V order", "2026-08-12", DeadlineCategory.AV],
    ["Housing cutoff", "2026-08-22", DeadlineCategory.HOUSING],
    ["F&B submission", "2026-09-04", DeadlineCategory.FNB],
    ["Rooming list due", "2026-09-08", DeadlineCategory.HOUSING],
    ["Print signage approval", "2026-09-12", DeadlineCategory.LOGISTICS],
    ["Final speaker deck upload", "2026-09-22", DeadlineCategory.LOGISTICS],
    ["Emergency response review", "2026-10-02", DeadlineCategory.OTHER],
    ["Show call rehearsal", "2026-10-11", DeadlineCategory.OTHER],
  ] as const;

  for (const [title, dueDate, category] of deadlines) {
    await prisma.deadline.create({
      data: {
        eventId,
        title,
        dueAt: new Date(`${dueDate}T15:00:00.000Z`),
        category,
        status: DeadlineStatus.OPEN,
      },
    });
  }
}

async function seedRoomsAndSessions(eventId: string) {
  const rooms = [
    ["Grand Ballroom", 1250],
    ["Ballroom A", 350],
    ["Ballroom B", 300],
    ["Ballroom C", 300],
    ["Salon 1", 120],
    ["Salon 2", 120],
    ["Salon 3", 120],
    ["Boardroom", 40],
  ] as const;

  const roomMap = new Map<string, string>();
  for (const [name, capacity] of rooms) {
    const room = await prisma.room.create({
      data: {
        eventId,
        name,
        capacity,
      },
    });
    roomMap.set(name, room.id);
  }

  const sessions = [
    ["Opening General Session", "Grand Ballroom", "2026-10-12", "13:00", "14:30", "General Session", 1200, MealPeriod.NONE],
    ["Executive Keynote", "Grand Ballroom", "2026-10-12", "15:00", "16:00", "Keynote", 1200, MealPeriod.NONE],
    ["Regional Leadership Welcome", "Ballroom A", "2026-10-12", "16:15", "17:00", "Breakout", 280, MealPeriod.NONE],
    ["Regional Sales Kickoff", "Ballroom B", "2026-10-12", "16:15", "17:00", "Breakout", 260, MealPeriod.NONE],
    ["Product Launch Rehearsal", "Grand Ballroom", "2026-10-13", "07:30", "08:15", "Production", 40, MealPeriod.NONE],
    ["Continental Breakfast", "Grand Ballroom", "2026-10-13", "08:00", "09:00", "Meal", 1150, MealPeriod.BREAKFAST],
    ["Product Launch General Session", "Grand Ballroom", "2026-10-13", "09:15", "10:30", "General Session", 1225, MealPeriod.NONE],
    ["North America Breakout", "Ballroom A", "2026-10-13", "11:00", "12:00", "Breakout", 260, MealPeriod.NONE],
    ["EMEA Breakout", "Ballroom B", "2026-10-13", "11:00", "12:00", "Breakout", 245, MealPeriod.NONE],
    ["APAC Breakout", "Ballroom C", "2026-10-13", "11:00", "12:00", "Breakout", 230, MealPeriod.NONE],
    ["Leadership Workshop", "Salon 1", "2026-10-13", "11:15", "12:15", "Workshop", 100, MealPeriod.NONE],
    ["Customer Success Roundtable", "Salon 2", "2026-10-13", "11:15", "12:15", "Roundtable", 90, MealPeriod.NONE],
    ["Lunch and Sponsor Expo", "Grand Ballroom", "2026-10-13", "12:15", "13:30", "Meal", 1180, MealPeriod.LUNCH],
    ["Revenue Operations Lab", "Salon 3", "2026-10-13", "13:45", "14:45", "Workshop", 90, MealPeriod.NONE],
    ["Partner Enablement Forum", "Ballroom A", "2026-10-13", "14:00", "15:00", "Breakout", 250, MealPeriod.NONE],
    ["Pricing Strategy Forum", "Ballroom B", "2026-10-13", "14:00", "15:15", "Breakout", 240, MealPeriod.NONE],
    ["Forecasting Masterclass", "Ballroom C", "2026-10-13", "14:00", "15:00", "Breakout", 220, MealPeriod.NONE],
    ["Coffee Break", "Grand Ballroom", "2026-10-13", "15:15", "15:45", "Meal", 1160, MealPeriod.BREAK],
    ["Awards Dinner", "Grand Ballroom", "2026-10-13", "19:00", "21:30", "Dinner", 1050, MealPeriod.DINNER],
    ["External Keynote", "Grand Ballroom", "2026-10-14", "09:00", "10:00", "Keynote", 1230, MealPeriod.NONE],
    ["Sales Coaching Clinic", "Ballroom A", "2026-10-14", "10:30", "11:30", "Workshop", 220, MealPeriod.NONE],
    ["Product Demo Theater", "Ballroom B", "2026-10-14", "10:30", "11:30", "Demo", 200, MealPeriod.NONE],
    ["Customer Panel", "Ballroom C", "2026-10-14", "10:30", "11:30", "Panel", 215, MealPeriod.NONE],
    ["Networking Lunch", "Grand Ballroom", "2026-10-14", "12:00", "13:15", "Meal", 1175, MealPeriod.LUNCH],
    ["Manager Bootcamp", "Salon 1", "2026-10-14", "13:30", "14:30", "Workshop", 100, MealPeriod.NONE],
    ["Forecasting Deep Dive", "Ballroom A", "2026-10-14", "13:30", "14:45", "Breakout", 230, MealPeriod.NONE],
    ["Customer Advisory Council", "Boardroom", "2026-10-14", "13:45", "15:00", "Roundtable", 32, MealPeriod.NONE],
    ["Closing Session", "Grand Ballroom", "2026-10-15", "10:00", "11:00", "General Session", 1180, MealPeriod.NONE],
  ] as const;

  const sessionMap = new Map<string, string>();

  let sortOrder = 1;
  for (const [sessionName, roomName, day, start, end, sessionType, attendance, mealPeriod] of sessions) {
    const session = await prisma.matrixRow.create({
      data: {
        eventId,
        roomId: roomMap.get(roomName) ?? null,
        sessionName,
        dayDate: new Date(`${day}T00:00:00.000Z`),
        startTime: new Date(`1970-01-01T${start}:00.000Z`),
        endTime: new Date(`1970-01-01T${end}:00.000Z`),
        roomName,
        attendance,
        setupType: roomName === "Grand Ballroom" ? "Theater" : "Classroom",
        mealPeriod,
        notes:
          sessionName === "Pricing Strategy Forum"
            ? `${sessionType}. Session is carrying an unresolved schedule conflict with the Customer Advisory Council.`
            : `${sessionType}.`,
        sortOrder: sortOrder++,
      },
      select: { id: true, sessionName: true },
    });
    sessionMap.set(sessionName, session.id);
  }

  return sessionMap;
}

async function seedSessionRequirements(eventId: string, sessionMap: Map<string, string>) {
  const template = await prisma.sessionRequirementTemplate.create({
    data: {
      eventId,
      name: "Annual Sales Conference Requirement Set",
    },
  });
  await prisma.event.update({
    where: { id: eventId },
    data: { sessionRequirementTemplateId: template.id },
  });

  const avSection = await prisma.sessionRequirementSection.create({
    data: {
      templateId: template.id,
      key: "av",
      label: "AV Requirements",
      icon: "Monitor",
      sortOrder: 1,
    },
  });
  const staffingSection = await prisma.sessionRequirementSection.create({
    data: {
      templateId: template.id,
      key: "staffing",
      label: "Staffing",
      icon: "Users",
      sortOrder: 2,
    },
  });

  const comfortMonitor = await prisma.sessionRequirementItem.create({
    data: {
      sectionId: avSection.id,
      key: "comfort-monitor",
      label: "Confidence monitor",
      hasQuantity: true,
      sortOrder: 1,
    },
  });
  const handheldMics = await prisma.sessionRequirementItem.create({
    data: {
      sectionId: avSection.id,
      key: "handheld-mics",
      label: "Handheld microphones",
      hasQuantity: true,
      sortOrder: 2,
    },
  });
  const stageManager = await prisma.sessionRequirementItem.create({
    data: {
      sectionId: staffingSection.id,
      key: "stage-manager",
      label: "Stage manager",
      hasQuantity: false,
      sortOrder: 1,
    },
  });

  const targetSessions = [
    "Opening General Session",
    "Executive Keynote",
    "Product Launch General Session",
    "Awards Dinner",
    "Closing Session",
  ];

  for (const sessionName of targetSessions) {
    const sessionId = sessionMap.get(sessionName);
    if (!sessionId) continue;
    await prisma.sessionRequirementSelection.createMany({
      data: [
        { sessionId, itemId: comfortMonitor.id, quantity: 2 },
        { sessionId, itemId: handheldMics.id, quantity: 4 },
        { sessionId, itemId: stageManager.id, quantity: 1 },
      ],
      skipDuplicates: true,
    });
  }
}

async function seedBudget(eventId: string, users: { demo: SeedUser; sarah: SeedUser; emily: SeedUser }, sessionMap: Map<string, string>) {
  const budget = await prisma.budget.upsert({
    where: { eventId },
    update: {
      status: BudgetStatus.SUBMITTED,
      submittedAt: atTime(new Date("2026-09-05T00:00:00.000Z"), 14, 0),
      submittedByUserId: users.sarah.id,
    },
    create: {
      eventId,
      status: BudgetStatus.SUBMITTED,
      submittedAt: atTime(new Date("2026-09-05T00:00:00.000Z"), 14, 0),
      submittedByUserId: users.sarah.id,
    },
  });

  const version = await prisma.budgetVersion.create({
    data: {
      budgetId: budget.id,
      versionNumber: 1,
      createdByUserId: users.sarah.id,
    },
  });
  await prisma.budget.update({
    where: { id: budget.id },
    data: { currentVersionId: version.id },
  });

  const lineItems = [
    ["Venue", "Venue Rental", "Ballroom rental", "JW Marriott Orlando Grande Lakes", 1850000, 1850000, BudgetLineItemStatus.COMMITTED, BudgetLineItemApproval.APPROVED, "Opening General Session", 1850000],
    ["Hotel", "Room Block", "Room block attrition reserve", "JW Marriott Orlando Grande Lakes", 325000, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.PENDING, null, 325000],
    ["Food & Beverage", "Breakfast", "Continental breakfast", "Encore Catering", 156500, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.PENDING, "Continental Breakfast", 148000],
    ["Food & Beverage", "Lunch", "Buffet lunch", "Encore Catering", 241000, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.APPROVED, "Networking Lunch", 228000],
    ["AV Production", "Main Stage", "Main stage package", "AV Unlimited", 655000, 140000, BudgetLineItemStatus.COMMITTED, BudgetLineItemApproval.PENDING, "Product Launch General Session", 620000],
    ["AV Production", "Breakouts", "Breakout support", "AV Unlimited", 176500, 32000, BudgetLineItemStatus.COMMITTED, BudgetLineItemApproval.APPROVED, "North America Breakout", 182000],
    ["Registration", "Badging", "Badge printing", "RegPro", 52000, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.PENDING, null, 48000],
    ["Speakers", "Keynotes", "External keynote fee", "Summit Speakers Bureau", 125000, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.APPROVED, "External Keynote", 125000],
    ["Entertainment", "Awards Dinner", "Awards dinner entertainment", "Beacon Talent", 61000, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.PENDING, "Awards Dinner", 54000],
    ["Transportation", "Ground", "Airport transfers", "Mears", 26000, 4000, BudgetLineItemStatus.COMMITTED, BudgetLineItemApproval.APPROVED, null, 28000],
    ["Decor", "Scenic", "General session scenic", "Impact Scenic", 81000, 15000, BudgetLineItemStatus.COMMITTED, BudgetLineItemApproval.PENDING, "Opening General Session", 74000],
    ["Printing", "Collateral", "Pocket agendas", "Orlando Print House", 19000, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.APPROVED, null, 22000],
    ["Marketing", "Email", "Attendee nurture email program", "Signal Thread Digital", 21000, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.PENDING, null, 18000],
    ["Staff Travel", "Airfare", "Onsite team airfare", "Navan", 64500, 51000, BudgetLineItemStatus.COMMITTED, BudgetLineItemApproval.APPROVED, null, 67000],
    ["Signage", "Wayfinding", "Wayfinding and expo signage", "ColorBox", 42000, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.PENDING, null, 38000],
    ["Photography", "Coverage", "Event photography", "Shutterline", 19500, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.APPROVED, "Closing Session", 19500],
    ["Contingency", "Reserve", "Storm contingency hold", "Reserve", 50000, 0, BudgetLineItemStatus.PLANNED, BudgetLineItemApproval.APPROVED, null, 50000],
  ] as const;

  const createdLineItems = [];
  let sortOrder = 1;
  for (const [category, subcategory, lineItem, vendor, forecast, actual, status, approval, sessionName] of lineItems) {
    const row = await prisma.budgetLineItem.create({
      data: {
        budgetId: budget.id,
        category,
        subcategory,
        lineItem,
        vendor,
        forecastCents: forecast,
        actualCents: actual,
        status,
        approval,
        matrixRowId: sessionName ? sessionMap.get(sessionName) ?? null : null,
        sortOrder: sortOrder++,
      },
    });
    createdLineItems.push(row);
  }

  await prisma.budgetItem.createMany({
    data: createdLineItems.map((item) => ({
      budgetVersionId: version.id,
      category: item.category,
      subcategory: item.subcategory,
      name: item.lineItem,
      vendor: item.vendor,
      forecastCents: item.forecastCents,
      actualCents: item.actualCents,
      status:
        item.status === BudgetLineItemStatus.COMMITTED && item.actualCents > 0
          ? BudgetItemStatus.COMMITTED
          : item.actualCents > 0
            ? BudgetItemStatus.PAID
            : BudgetItemStatus.PLANNED,
    })),
  });

  const submittedIds = createdLineItems
    .filter((item) => item.approval === BudgetLineItemApproval.PENDING)
    .slice(0, 3)
    .map((item) => item.id);

  if (submittedIds.length > 0) {
    const submission = await prisma.budgetSubmission.create({
      data: {
        budgetId: budget.id,
        budgetVersionId: version.id,
        submittedByUserId: users.sarah.id,
        status: "SUBMITTED" as never,
        submittedAt: atTime(new Date("2026-09-05T00:00:00.000Z"), 14, 0),
        message: "Please review the AV, decor, and entertainment updates before final lock.",
      },
    });

    await prisma.budgetSubmissionRecipient.create({
      data: {
        submissionId: submission.id,
        userId: users.emily.id,
      },
    });

    await prisma.budgetSubmissionLineItem.createMany({
      data: submittedIds.map((budgetLineItemId) => ({
        submissionId: submission.id,
        budgetLineItemId,
      })),
    });
  }

  await prisma.budgetActivity.createMany({
    data: [
      {
        budgetId: budget.id,
        actorUserId: users.sarah.id,
        type: BudgetActivityType.REVISED,
        note: "Forecasts refreshed after venue reconciliation.",
        createdAt: atTime(new Date("2026-09-02T00:00:00.000Z"), 10, 15),
      },
      {
        budgetId: budget.id,
        actorUserId: users.sarah.id,
        type: BudgetActivityType.SUBMITTED,
        note: "Submitted the AV, decor, and entertainment bundle for approval.",
        createdAt: atTime(new Date("2026-09-05T00:00:00.000Z"), 14, 5),
      },
    ],
  });
}

async function seedFnbCatalog(eventId: string, sessionMap: Map<string, string>) {
  const catalogRows = [
    ["Continental Breakfast", "Morning service with pastries, fruit, and coffee", "22.00", "Breakfast"],
    ["Coffee Break", "Coffee, tea, and snack break", "14.50", "Break"],
    ["Buffet Lunch", "Working lunch buffet with dessert", "38.00", "Lunch"],
    ["Networking Reception", "Passed hors d'oeuvres and bar package", "44.00", "Reception"],
    ["Plated Awards Dinner", "Three-course plated dinner", "82.00", "Dinner"],
  ] as const;

  const itemMap = new Map<string, string>();
  for (const [itemName, description, price, category] of catalogRows) {
    const item = await prisma.eventFnbCatalogItem.create({
      data: {
        eventId,
        itemName,
        description,
        price,
        unit: "person",
        category,
      },
    });
    itemMap.set(itemName, item.id);
  }

  const assignments = [
    ["Continental Breakfast", "Continental Breakfast", 1150, 1200],
    ["Networking Lunch", "Buffet Lunch", 1180, 950],
    ["Awards Dinner", "Plated Awards Dinner", 1050, 0],
    ["Awards Dinner", "Networking Reception", 1050, 0],
    ["Coffee Break", "Coffee Break", 1160, 0],
  ] as const;

  for (const [sessionName, itemName, quantity, manualPriceCents] of assignments) {
    const sessionId = sessionMap.get(sessionName);
    const eventFnbCatalogItemId = itemMap.get(itemName);
    if (!sessionId || !eventFnbCatalogItemId) continue;
    const assignment = await prisma.sessionFnbCatalogAssignment.create({
      data: {
        sessionId,
        eventFnbCatalogItemId,
        quantity,
        manualPriceCents,
        serviceTiming: sessionName === "Awards Dinner" ? "After session" : "Before session",
        notes: sessionName === "Awards Dinner" ? "Awards dinner plated service with sponsor toast." : null,
      },
    });
    await prisma.sessionFnbCatalogAssignmentTax.createMany({
      data: [
        { assignmentId: assignment.id, label: "Service charge", percentage: "0.24" as never },
        { assignmentId: assignment.id, label: "Sales tax", percentage: "0.065" as never },
      ],
    });
  }
}

async function seedSpeakersAndDocs(
  eventId: string,
  users: { demo: SeedUser; sarah: SeedUser; emily: SeedUser; john: SeedUser },
  sessionMap: Map<string, string>,
) {
  const speakers = [
    ["Jennifer Adams", "Chief Revenue Officer", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Executive Keynote"],
    ["Marcus Bennett", "SVP, Global Sales", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Opening General Session"],
    ["Priya Desai", "VP, Product Marketing", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Product Launch General Session"],
    ["Thomas Reed", "VP, Sales Operations", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Forecasting Deep Dive"],
    ["Leila Brooks", "Regional GM, North America", "Acme Events Inc", SpeakerStatus.CONFIRMED, "North America Breakout"],
    ["Andre Muller", "Regional GM, EMEA", "Acme Events Inc", SpeakerStatus.CONFIRMED, "EMEA Breakout"],
    ["Vivian Tan", "Regional GM, APAC", "Acme Events Inc", SpeakerStatus.CONFIRMED, "APAC Breakout"],
    ["Harper Cole", "VP, Customer Success", "BrightPath Software", SpeakerStatus.CONFIRMED, "Customer Success Roundtable"],
    ["Daniel Kim", "Chief Product Officer", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Product Demo Theater"],
    ["Allison Pierce", "Enterprise Sales Director", "Northstar Health", SpeakerStatus.CONFIRMED, "Sales Coaching Clinic"],
    ["Rafael Ortiz", "VP, Field Enablement", "Acme Events Inc", SpeakerStatus.INVITED, "Manager Bootcamp"],
    ["Mina Hassan", "Head of RevOps", "Skyline Labs", SpeakerStatus.CONFIRMED, "Revenue Operations Lab"],
    ["Chloe Everett", "Chief People Officer", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Regional Leadership Welcome"],
    ["Evan Ross", "Partner Director", "Signal Thread Digital", SpeakerStatus.CONFIRMED, "Partner Enablement Forum"],
    ["Olivia Grant", "Senior Director, Pricing", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Pricing Strategy Forum"],
    ["Avery Cole", "CEO", "Beacon Advisory", SpeakerStatus.CONFIRMED, "External Keynote"],
    ["Kevin Liu", "Director, CX", "Summit Financial", SpeakerStatus.CONFIRMED, "Customer Panel"],
    ["Natalie Flores", "VP, Events", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Awards Dinner"],
    ["Mason Patel", "Director, Sponsorships", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Lunch and Sponsor Expo"],
    ["Jade Foster", "Sales Enablement Lead", "Acme Events Inc", SpeakerStatus.NEEDS_INFO, "Manager Bootcamp"],
    ["Noah Sinclair", "Product Strategy Lead", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Forecasting Masterclass"],
    ["Grace Ibrahim", "Chief Customer Officer", "Northstar Health", SpeakerStatus.CONFIRMED, "Customer Advisory Council"],
    ["Liam Carter", "GM, Emerging Markets", "Acme Events Inc", SpeakerStatus.CONFIRMED, "APAC Breakout"],
    ["Sofia Nunez", "Revenue Operations Manager", "BrightPath Software", SpeakerStatus.CONFIRMED, "Revenue Operations Lab"],
    ["Isabel Turner", "VP, Brand", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Opening General Session"],
    ["Julian Cook", "Channel Marketing Director", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Partner Enablement Forum"],
    ["Zoe Fisher", "Field Marketing Director", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Lunch and Sponsor Expo"],
    ["Nikhil Rao", "Chief Solutions Architect", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Product Demo Theater"],
    ["Paige Lawson", "Executive Coach", "Insight Partners", SpeakerStatus.CONFIRMED, "Leadership Workshop"],
    ["Hannah Doyle", "Regional Sales Director", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Regional Sales Kickoff"],
    ["Brandon Shah", "VP, Enterprise Accounts", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Closing Session"],
    ["Claire Morgan", "Director, Internal Communications", "Acme Events Inc", SpeakerStatus.CONFIRMED, "Closing Session"],
  ] as const;

  const speakerMap = new Map<string, string>();
  const speakerIdsForPortal: string[] = [];

  for (const [name, title, company, status, sessionName] of speakers) {
    const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@example.com`;
    const speaker = await prisma.speaker.create({
      data: {
        eventId,
        name,
        email,
        title,
        company,
        status,
        bio: `Enterprise conference speaker focused on ${title.toLowerCase()} and field execution.`,
        headshotUrl: name === "Jade Foster" ? null : `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`,
        avNeeds: name === "Olivia Grant" ? null : "Confidence monitor, handheld backup, clicker",
        travelNeeds: name === "Rafael Ortiz" ? null : "Flight arrival on October 11, sedan transfer requested",
        dietaryRestrictions: name === "Jade Foster" ? null : "No restrictions",
        topics: [sessionName, "Sales leadership", "Field execution"],
        linkedinUrl: `https://www.linkedin.com/in/${name.toLowerCase().replace(/[^a-z]+/g, "-")}`,
        websiteUrl: company.includes("Acme") ? "https://acme-events.example.com" : "https://customer.example.com",
      },
    });
    speakerMap.set(name, speaker.id);
    speakerIdsForPortal.push(speaker.id);

    const sessionId = sessionMap.get(sessionName);
    if (sessionId) {
      await prisma.sessionSpeakerAssignment.create({
        data: {
          sessionId,
          speakerId: speaker.id,
        },
      });
    }

    await prisma.speakerReadinessItem.createMany({
      data: [
        {
          speakerId: speaker.id,
          eventId,
          key: "bio",
          label: "Bio approved",
          completed: Boolean(speaker.bio),
          completedAt: speaker.bio ? new Date("2026-08-02T14:00:00.000Z") : null,
        },
        {
          speakerId: speaker.id,
          eventId,
          key: "deck",
          label: "Deck received",
          completed: name !== "Jade Foster",
          completedAt: name !== "Jade Foster" ? new Date("2026-09-18T17:00:00.000Z") : null,
        },
      ],
      skipDuplicates: true,
    });
  }

  const jenniferId = speakerMap.get("Jennifer Adams");
  const jadeId = speakerMap.get("Jade Foster");
  const averyId = speakerMap.get("Avery Cole");
  const keynoteSessionId = sessionMap.get("Executive Keynote");

  if (jenniferId) {
    const deck = await prisma.speakerFile.create({
      data: {
        speakerId: jenniferId,
        eventId,
        sessionId: keynoteSessionId ?? null,
        kind: SpeakerFileKind.SLIDES,
        filename: "executive-keynote-v4.pdf",
        objectKey: `help-seed/${eventId}/${jenniferId}/executive-keynote-v4.pdf`,
        contentType: "application/pdf",
        fileSizeBytes: 4_800_000,
        version: 4,
        reviewStatus: SpeakerFileReviewStatus.APPROVED,
        reviewedAt: new Date("2026-09-24T14:00:00.000Z"),
        reviewedByUserId: users.emily.id,
        uploadedViaPortal: true,
      },
    });

    await prisma.speakerDocumentRequest.create({
      data: {
        eventId,
        speakerId: jenniferId,
        title: "Signed speaker agreement",
        instructions: "Upload the countersigned agreement PDF.",
        requiresSignature: true,
        submittedAt: new Date("2026-08-27T18:00:00.000Z"),
        createdByUserId: users.sarah.id,
        speakerFileId: deck.id,
      },
    });

    await prisma.speakerIntakeToken.create({
      data: {
        speakerId: jenniferId,
        eventId,
        tokenHash: "help-seed-jennifer-hash",
        expiresAt: new Date("2026-10-10T00:00:00.000Z"),
        submittedAt: new Date("2026-08-18T13:30:00.000Z"),
      },
    });
    await prisma.speakerProfileSubmission.create({
      data: {
        speakerId: jenniferId,
        eventId,
        status: SpeakerSubmissionStatus.PENDING,
        name: "Jennifer Adams",
        title: "Chief Revenue Officer",
        company: "Acme Events Inc",
        bio: "Updated CRO bio pending final review.",
        submittedAt: new Date("2026-08-18T13:30:00.000Z"),
      },
    });
  }

  if (jadeId) {
    await prisma.speakerDocumentRequest.create({
      data: {
        eventId,
        speakerId: jadeId,
        title: "Travel release form",
        instructions: "Upload a signed travel release before September 30.",
        requiresSignature: true,
        createdByUserId: users.sarah.id,
      },
    });
  }

  if (averyId) {
    const file = await prisma.speakerFile.create({
      data: {
        speakerId: averyId,
        eventId,
        sessionId: sessionMap.get("External Keynote") ?? null,
        kind: SpeakerFileKind.SLIDES,
        filename: "external-keynote-draft.pptx",
        objectKey: `help-seed/${eventId}/${averyId}/external-keynote-draft.pptx`,
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        fileSizeBytes: 7_100_000,
        version: 1,
        reviewStatus: SpeakerFileReviewStatus.RECEIVED,
        uploadedViaPortal: true,
      },
    });

    await prisma.speakerDocumentRequest.create({
      data: {
        eventId,
        speakerId: averyId,
        title: "W-9",
        instructions: "Submit the completed tax form before payment processing.",
        requiresSignature: false,
        createdByUserId: users.sarah.id,
        submittedAt: new Date("2026-09-10T16:00:00.000Z"),
        speakerFileId: file.id,
      },
    });
  }

  const categoryRows = [
    ["General", "general", "#2563eb"],
    ["Speaker Docs", "speaker-docs", "#9333ea"],
    ["Finance", "finance", "#0f766e"],
    ["Venue", "venue", "#d97706"],
    ["Production", "production", "#475569"],
  ] as const;

  const categoryMap = new Map<string, string>();
  for (const [name, slug, color] of categoryRows) {
    const category = await prisma.documentCategory.create({
      data: {
        eventId,
        name,
        slug,
        color,
      },
    });
    categoryMap.set(name, category.id);
  }

  const docs = [
    ["Final Agenda", "General", DocumentStatus.APPROVED, "final-agenda.pdf"],
    ["Speaker Guidelines", "Speaker Docs", DocumentStatus.APPROVED, "speaker-guidelines.pdf"],
    ["Budget Workbook", "Finance", DocumentStatus.IN_REVIEW, "budget-workbook.xlsx"],
    ["AV Production Schedule", "Production", DocumentStatus.APPROVED, "av-production-schedule.xlsx"],
    ["Banquet Event Orders", "Venue", DocumentStatus.IN_REVIEW, "beos.pdf"],
    ["Rooming List", "Venue", DocumentStatus.DRAFT, "rooming-list.xlsx"],
    ["Venue Floorplans", "Venue", DocumentStatus.APPROVED, "venue-floorplans.pdf"],
    ["Vendor Contracts", "Finance", DocumentStatus.APPROVED, "vendor-contracts.pdf"],
    ["Emergency Contacts", "General", DocumentStatus.DRAFT, "emergency-contacts.docx"],
  ] as const;

  const documentMap = new Map<string, string>();
  let docIndex = 1;
  for (const [title, categoryName, status, filename] of docs) {
    const document = await prisma.document.create({
      data: {
        orgId: users.demo.orgId,
        eventId,
        categoryId: categoryMap.get(categoryName)!,
        title,
        status,
        visibility: DocumentVisibility.INTERNAL_ONLY,
      },
    });
    documentMap.set(title, document.id);

    await prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        objectKey: `help-seed/${eventId}/docs/${filename}`,
        objectEtag: `doc-${docIndex++}`,
        mimeType: filename.endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSizeBytes: 2_400_000,
        originalFilename: filename,
        uploadedByUserId: users.sarah.id,
      },
    });

    if (status === DocumentStatus.IN_REVIEW) {
      const approval = await prisma.documentApproval.create({
        data: {
          documentId: document.id,
          status: DocumentApprovalStatus.IN_REVIEW,
          actedByUserId: users.sarah.id,
          actedAt: new Date("2026-09-12T15:30:00.000Z"),
          note: "Shared for reviewer sign-off.",
        },
      });
      await prisma.documentApprovalRecipient.create({
        data: {
          approvalId: approval.id,
          userId: users.emily.id,
        },
      });
    } else if (status === DocumentStatus.APPROVED) {
      await prisma.documentApproval.create({
        data: {
          documentId: document.id,
          status: DocumentApprovalStatus.APPROVED,
          actedByUserId: users.emily.id,
          actedAt: new Date("2026-09-18T13:00:00.000Z"),
          note: "Approved for planner use.",
        },
      });
    }
  }

  const finalAgendaId = documentMap.get("Final Agenda");
  if (finalAgendaId) {
    await prisma.documentLink.create({
      data: {
        documentId: finalAgendaId,
        linkType: DocumentLinkType.EVENT,
        linkedId: eventId,
      },
    });
  }

  return { speakerMap };
}

async function seedDirectoryAndAttendees(
  eventId: string,
  orgId: string,
  clientId: string | null,
  createdByUserId: string,
) {
  const source = await prisma.eventDirectorySource.create({
    data: {
      eventId,
      type: EventDirectorySourceType.MANUAL,
      label: "Help Center Seed",
      createdByUserId,
    },
  });

  const directorySeed = [
    ["Taylor Nguyen", "taylor.nguyen@novushealth.com", "Novus Health", "VP Sales", EventDirectoryRoleType.ATTENDEE, EventDirectoryPersonStatus.ACTIVE, EventDirectorySyncStatus.LINKED],
    ["Megan Foster", "megan.foster@northstar.io", "Northstar", "Director, CX", EventDirectoryRoleType.ATTENDEE, EventDirectoryPersonStatus.ACTIVE, EventDirectorySyncStatus.PULLED],
    ["Lucas Meyer", "lucas.meyer@signalthread.com", "Signal Thread", "Sponsor Lead", EventDirectoryRoleType.SPONSOR_CONTACT, EventDirectoryPersonStatus.ACTIVE, EventDirectorySyncStatus.LINKED],
    ["Ariana Wells", "ariana.wells@skyline.io", "Skyline Labs", "Exhibitor Marketing", EventDirectoryRoleType.EXHIBITOR_CONTACT, EventDirectoryPersonStatus.ACTIVE, EventDirectorySyncStatus.LINKED],
    ["Jordan Price", "jordan.price@globenews.com", "Globe News", "Reporter", EventDirectoryRoleType.PRESS, EventDirectoryPersonStatus.ACTIVE, EventDirectorySyncStatus.LINKED],
    ["Carla Ruiz", null, "Acme Events Inc", "VIP Guest", EventDirectoryRoleType.VIP, EventDirectoryPersonStatus.NEEDS_REVIEW, EventDirectorySyncStatus.ERROR],
    ["Cameron Blake", "cameron.blake@novushealth.com", "Novus Health", "Regional VP", EventDirectoryRoleType.ATTENDEE, EventDirectoryPersonStatus.DUPLICATE_REVIEW, EventDirectorySyncStatus.CONFLICT],
    ["Cameron Blake", "c.blake@novushealth.com", "Novus Health", "Regional VP", EventDirectoryRoleType.ATTENDEE, EventDirectoryPersonStatus.DUPLICATE_REVIEW, EventDirectorySyncStatus.CONFLICT],
    ["Mila Thompson", "mila.thompson@acme.com", "Acme Events Inc", "Onsite Producer", EventDirectoryRoleType.STAFF, EventDirectoryPersonStatus.ACTIVE, EventDirectorySyncStatus.READ_ONLY],
    ["Sean Porter", "sean.porter@acme.com", "Acme Events Inc", "Registration Manager", EventDirectoryRoleType.STAFF, EventDirectoryPersonStatus.ACTIVE, EventDirectorySyncStatus.READ_ONLY],
    ["Bethany Cross", "bethany.cross@futurebank.com", "FutureBank", "Client Speaker", EventDirectoryRoleType.MARKETING_CONTACT, EventDirectoryPersonStatus.ACTIVE, EventDirectorySyncStatus.PUSHED],
  ] as const;

  const directoryMap = new Map<string, SeedDirectoryPerson>();
  for (const [displayName, email, company, title, role, status, syncStatus] of directorySeed) {
    const [firstName, ...rest] = displayName.split(" ");
    const lastName = rest.join(" ");
    const person = await prisma.eventDirectoryPerson.create({
      data: {
        orgId,
        clientId,
        eventId,
        firstName,
        lastName,
        displayName,
        email,
        normalizedEmail: normalizeEmail(email),
        company,
        title,
        status,
        createdByUserId,
        updatedByUserId: createdByUserId,
      },
    });
    await prisma.eventDirectoryRole.create({
      data: {
        eventId,
        personId: person.id,
        role,
        sourceId: source.id,
        createdByUserId,
      },
    });
    if (email) {
      const externalSlug = `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${email
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;
      await prisma.eventDirectoryExternalIdentity.create({
        data: {
          eventId,
          personId: person.id,
          provider: "cvent",
          externalPersonId: `${externalSlug}-person`,
          externalRegistrationId: `${externalSlug}-reg`,
          syncStatus,
          lastPulledAt: new Date("2026-09-09T13:00:00.000Z"),
          lastPushedAt: syncStatus === EventDirectorySyncStatus.PUSHED ? new Date("2026-09-11T15:00:00.000Z") : null,
        },
      });
    }
    directoryMap.set(displayName, { id: person.id, displayName, email });
  }

  const attendeeRows = [
    ["Taylor Nguyen", EventAttendeeRegistrationStatus.REGISTERED, EventAttendeeAttendanceStatus.EXPECTED, EventAttendeeSyncStatus.SYNCED],
    ["Megan Foster", EventAttendeeRegistrationStatus.WAITLISTED, EventAttendeeAttendanceStatus.EXPECTED, EventAttendeeSyncStatus.PENDING_WRITEBACK],
    ["Carla Ruiz", EventAttendeeRegistrationStatus.PENDING_APPROVAL, EventAttendeeAttendanceStatus.EXPECTED, EventAttendeeSyncStatus.WRITEBACK_FAILED],
    ["Cameron Blake", EventAttendeeRegistrationStatus.REGISTERED, EventAttendeeAttendanceStatus.ATTENDED, EventAttendeeSyncStatus.CONFLICT],
  ] as const;

  for (const [displayName, registrationStatus, attendanceStatus, syncStatus] of attendeeRows) {
    const person = directoryMap.get(displayName);
    if (!person) continue;
    const attendee = await prisma.eventAttendee.create({
      data: {
        eventId,
        directoryPersonId: person.id,
        registrationStatus,
        attendanceStatus,
        source: EventAttendeeSource.MANUAL,
        syncStatus,
        portalAccessStatus: EventAttendeePortalStatus.INVITED,
        registeredAt: registrationStatus === EventAttendeeRegistrationStatus.REGISTERED ? new Date("2026-08-18T14:00:00.000Z") : null,
        waitlistedAt: registrationStatus === EventAttendeeRegistrationStatus.WAITLISTED ? new Date("2026-08-20T14:00:00.000Z") : null,
        checkedInAt: attendanceStatus === EventAttendeeAttendanceStatus.ATTENDED ? new Date("2026-10-12T13:02:00.000Z") : null,
        createdByUserId,
      },
    });
    if (person.email) {
      await prisma.eventRegistrationRecord.create({
        data: {
          eventId,
          attendeeId: attendee.id,
          directoryPersonId: person.id,
          provider: "cvent",
          externalRegistrationId: `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-registration`,
          externalPersonId: `${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-person`,
          registrationStatus,
          registrationType: displayName === "Taylor Nguyen" ? "Full Conference" : "Day Pass",
          ticketType: displayName === "Taylor Nguyen" ? "Sales Leader" : "Guest",
          badgeType: displayName === "Taylor Nguyen" ? "Attendee" : "VIP",
          paymentStatus: registrationStatus === EventAttendeeRegistrationStatus.REGISTERED ? "Paid" : "Pending",
          syncStatus,
          registeredAt: attendee.registeredAt,
        },
      });
    }
  }

  const importBatch = await prisma.eventDirectoryImportBatch.create({
    data: {
      eventId,
      sourceId: source.id,
      fileName: "annual-sales-directory-import.csv",
      uploadedByUserId: createdByUserId,
      targetRole: EventDirectoryRoleType.ATTENDEE,
      sourceLabel: "Attendee spreadsheet",
      totalRows: 4,
      createdCount: 1,
      updatedCount: 1,
      duplicateCount: 1,
      invalidCount: 1,
      skippedCount: 0,
      status: EventDirectoryImportStatus.COMPLETE,
    },
  });

  await prisma.eventDirectoryImportRow.createMany({
    data: [
      {
        eventId,
        batchId: importBatch.id,
        rowNumber: 1,
        rawName: "Taylor Nguyen",
        rawEmail: "taylor.nguyen@novushealth.com",
        rawCompany: "Novus Health",
        parsedFirstName: "Taylor",
        parsedLastName: "Nguyen",
        parsedEmail: "taylor.nguyen@novushealth.com",
        result: EventDirectoryImportRowResult.UPDATED,
        matchedPersonId: directoryMap.get("Taylor Nguyen")?.id ?? null,
      },
      {
        eventId,
        batchId: importBatch.id,
        rowNumber: 2,
        rawName: "New Prospect",
        rawEmail: "",
        rawCompany: "Prospect Labs",
        parsedFirstName: "New",
        parsedLastName: "Prospect",
        parsedEmail: null,
        result: EventDirectoryImportRowResult.INVALID,
        errorMessage: "Missing a usable identity",
      },
      {
        eventId,
        batchId: importBatch.id,
        rowNumber: 3,
        rawName: "Cameron Blake",
        rawEmail: "c.blake@novushealth.com",
        rawCompany: "Novus Health",
        parsedFirstName: "Cameron",
        parsedLastName: "Blake",
        parsedEmail: "c.blake@novushealth.com",
        result: EventDirectoryImportRowResult.DUPLICATE_REVIEW,
        matchedPersonId: directoryMap.get("Cameron Blake")?.id ?? null,
      },
      {
        eventId,
        batchId: importBatch.id,
        rowNumber: 4,
        rawName: "Bethany Cross",
        rawEmail: "bethany.cross@futurebank.com",
        rawCompany: "FutureBank",
        parsedFirstName: "Bethany",
        parsedLastName: "Cross",
        parsedEmail: "bethany.cross@futurebank.com",
        result: EventDirectoryImportRowResult.CREATED,
        matchedPersonId: directoryMap.get("Bethany Cross")?.id ?? null,
      },
    ],
  });
}

async function seedSeating(eventId: string) {
  const plan = await prisma.seatingPlan.create({
    data: {
      eventId,
      name: "Awards Dinner Seating",
    },
  });

  const tables = await Promise.all(
    ([
      ["VIP Table", 8],
      ["Table 12", 10],
      ["Table 14", 10],
      ["Table 18", 10],
    ] satisfies Array<[string, number]>).map(([name, capacity], index) =>
      prisma.seatingTable.create({
        data: {
          eventId,
          seatingPlanId: plan.id,
          name,
          capacity,
          sortOrder: index + 1,
        },
      }),
    ),
  );

  const attendees = await Promise.all(
    [
      ["Taylor", "Nguyen", "Novus Health", "taylor.nguyen@novushealth.com"],
      ["Megan", "Foster", "Northstar", "megan.foster@northstar.io"],
      ["Avery", "Cole", "Beacon Advisory", "avery.cole@example.com"],
      ["Natalie", "Flores", "Acme Events Inc", "natalie.flores@example.com"],
    ].map(([firstName, lastName, company, email]) =>
      prisma.seatingAttendee.create({
        data: {
          eventId,
          firstName,
          lastName,
          company,
          email,
        },
      }),
    ),
  );

  await prisma.seatingAssignment.createMany({
    data: [
      { eventId, seatingPlanId: plan.id, tableId: tables[0]!.id, attendeeId: attendees[0]!.id, seatIndex: 0 },
      { eventId, seatingPlanId: plan.id, tableId: tables[0]!.id, attendeeId: attendees[2]!.id, seatIndex: 1 },
      { eventId, seatingPlanId: plan.id, tableId: tables[1]!.id, attendeeId: attendees[1]!.id, seatIndex: 0 },
      { eventId, seatingPlanId: plan.id, tableId: tables[2]!.id, attendeeId: attendees[3]!.id, seatIndex: 0 },
    ],
  });
}

async function seedMarketing(eventId: string, ownerUserId: string) {
  const plan = await prisma.marketingPlan.create({
    data: {
      eventId,
      ownerUserId,
      summary: "Drive registration completion, sponsor engagement, and closing-session attendance.",
      goals: "Protect executive attendance, keep sponsors informed, and surface awards-dinner RSVP risk.",
    },
  });

  const audienceRows = [
    ["Attendees - Registered", "From directory sync", 412],
    ["Attendees - Waitlist", "From directory sync", 36],
    ["Sponsors and Exhibitors", "Marketing curated", 54],
  ] as const;

  const audienceMap = new Map<string, string>();
  for (const [name, sourceLabel] of audienceRows) {
    const audience = await prisma.marketingAudience.create({
      data: {
        eventId,
        name,
        sourceLabel,
      },
    });
    audienceMap.set(name, audience.id);
  }

  const recipientRows = [
    ["Attendees - Registered", "taylor.nguyen@novushealth.com", "Taylor", "Nguyen", "Novus Health", "VP Sales", "Full Conference", "Registered"],
    ["Attendees - Registered", "megan.foster@northstar.io", "Megan", "Foster", "Northstar", "Director, CX", "Full Conference", "Registered"],
    ["Attendees - Waitlist", "carla.ruiz@example.com", "Carla", "Ruiz", "Acme Events Inc", "VIP Guest", "Waitlist", "Pending"],
    ["Sponsors and Exhibitors", "lucas.meyer@signalthread.com", "Lucas", "Meyer", "Signal Thread", "Sponsor Lead", "Sponsor", "Registered"],
  ] as const;

  for (const [audienceName, email, firstName, lastName, company, title, registrationType, status] of recipientRows) {
    const audienceId = audienceMap.get(audienceName);
    if (!audienceId) continue;
    await prisma.marketingAudienceRecipient.create({
      data: {
        eventId,
        audienceId,
        email,
        normalizedEmail: email.toLowerCase(),
        firstName,
        lastName,
        company,
        title,
        registrationType,
        status,
      },
    });
  }

  for (const [name] of audienceRows) {
    const audienceId = audienceMap.get(name)!;
    const count = await prisma.marketingAudienceRecipient.count({ where: { audienceId } });
    await prisma.marketingAudience.update({
      where: { id: audienceId },
      data: { recipientCount: count },
    });
  }

  const campaignRows = [
    ["Registration Push", "Drive final attendee registrations", MarketingCampaignStatus.ACTIVE, "Attendees - Registered", "2026-08-01", "2026-09-15"],
    ["Sponsor Readiness", "Keep sponsors ready for onsite delivery", MarketingCampaignStatus.ACTIVE, "Sponsors and Exhibitors", "2026-08-12", "2026-10-10"],
    ["Awards Dinner RSVP", "Collect final dinner selections", MarketingCampaignStatus.DRAFT, "Attendees - Registered", "2026-09-10", "2026-10-05"],
  ] as const;

  const sendRows: Array<{
    campaignId: string;
    audienceId: string;
    subject: string;
    previewText: string;
    status: MarketingEmailSendStatus;
    scheduledSendAt: Date | null;
    actualSentAt: Date | null;
    recipientCount: number;
    deliveredCount: number;
    openCount: number;
    clickCount: number;
    bounceCount: number;
    unsubscribeCount: number;
  }> = [];

  for (const [name, description, status, audienceName, startDate, endDate] of campaignRows) {
    const campaign = await prisma.marketingCampaign.create({
      data: {
        eventId,
        marketingPlanId: plan.id,
        ownerUserId,
        name,
        description,
        status,
        audienceLabel: audienceName,
        startDate: new Date(`${startDate}T00:00:00.000Z`),
        endDate: new Date(`${endDate}T00:00:00.000Z`),
      },
    });

    const audienceId = audienceMap.get(audienceName)!;
    if (name === "Registration Push") {
      sendRows.push({
        campaignId: campaign.id,
        audienceId,
        subject: "Your Annual Sales Conference travel and session planning guide",
        previewText: "Agenda highlights, hotel timing, and the sessions to lock first.",
        status: MarketingEmailSendStatus.SENT,
        scheduledSendAt: new Date("2026-08-28T14:00:00.000Z"),
        actualSentAt: new Date("2026-08-28T14:05:00.000Z"),
        recipientCount: 2,
        deliveredCount: 2,
        openCount: 1,
        clickCount: 1,
        bounceCount: 0,
        unsubscribeCount: 0,
      });
    } else if (name === "Sponsor Readiness") {
      sendRows.push({
        campaignId: campaign.id,
        audienceId,
        subject: "Sponsor move-in and exhibit services checklist",
        previewText: "Deadlines, floorplan, and electrical order reminders.",
        status: MarketingEmailSendStatus.SCHEDULED,
        scheduledSendAt: new Date("2026-09-18T15:30:00.000Z"),
        actualSentAt: null,
        recipientCount: 1,
        deliveredCount: 0,
        openCount: 0,
        clickCount: 0,
        bounceCount: 0,
        unsubscribeCount: 0,
      });
    } else {
      sendRows.push({
        campaignId: campaign.id,
        audienceId,
        subject: "Confirm your awards dinner RSVP",
        previewText: "Meal choice, accessibility notes, and final dinner details.",
        status: MarketingEmailSendStatus.DRAFT,
        scheduledSendAt: null,
        actualSentAt: null,
        recipientCount: 0,
        deliveredCount: 0,
        openCount: 0,
        clickCount: 0,
        bounceCount: 0,
        unsubscribeCount: 0,
      });
    }
  }

  for (const row of sendRows) {
    const send = await prisma.marketingEmailSend.create({
      data: {
        eventId,
        campaignId: row.campaignId,
        audienceId: row.audienceId,
        ownerUserId,
        subject: row.subject,
        previewText: row.previewText,
        bodyHtml: "<p>Conference message</p>",
        bodyText: "Conference message",
        fromEmail: "events@acme-events.example.com",
        replyTo: "events@acme-events.example.com",
        registrationUrl: "https://acme-events.example.com/register",
        utmUrl: "https://acme-events.example.com/register?utm_source=orca",
        status: row.status,
        scheduledSendAt: row.scheduledSendAt,
        actualSentAt: row.actualSentAt,
        recipientCount: row.recipientCount,
        deliveredCount: row.deliveredCount,
        openCount: row.openCount,
        clickCount: row.clickCount,
        bounceCount: row.bounceCount,
        unsubscribeCount: row.unsubscribeCount,
      },
    });

    const recipients = await prisma.marketingAudienceRecipient.findMany({
      where: { audienceId: row.audienceId },
      orderBy: { createdAt: "asc" },
    });

    for (const recipient of recipients) {
      const sendRecipient = await prisma.marketingEmailSendRecipient.create({
        data: {
          eventId,
          emailSendId: send.id,
          sourceAudienceRecipientId: recipient.id,
          email: recipient.email,
          normalizedEmail: recipient.normalizedEmail,
          firstName: recipient.firstName,
          lastName: recipient.lastName,
          company: recipient.company,
          title: recipient.title,
          registrationType: recipient.registrationType,
          providerStatus:
            row.status === MarketingEmailSendStatus.SENT
              ? MarketingEmailRecipientStatus.DELIVERED
              : MarketingEmailRecipientStatus.PENDING,
          deliveredAt: row.status === MarketingEmailSendStatus.SENT ? row.actualSentAt : null,
          openedAt: row.status === MarketingEmailSendStatus.SENT && recipient.email.includes("taylor") ? new Date("2026-08-28T15:42:00.000Z") : null,
          clickedAt: row.status === MarketingEmailSendStatus.SENT && recipient.email.includes("taylor") ? new Date("2026-08-28T15:43:00.000Z") : null,
          processedAt: row.status === MarketingEmailSendStatus.SENT ? row.actualSentAt : null,
        },
      });

      if (row.status === MarketingEmailSendStatus.SENT) {
        await prisma.marketingEmailEvent.createMany({
          data: [
            {
              eventId,
              emailSendId: send.id,
              emailSendRecipientId: sendRecipient.id,
              type: MarketingEmailEventType.DELIVERED,
              sgEventId: `${send.id}-${sendRecipient.id}-delivered`,
              occurredAt: row.actualSentAt ?? new Date("2026-08-28T14:05:00.000Z"),
            },
            ...(recipient.email.includes("taylor")
              ? [
                  {
                    eventId,
                    emailSendId: send.id,
                    emailSendRecipientId: sendRecipient.id,
                    type: MarketingEmailEventType.OPEN,
                    sgEventId: `${send.id}-${sendRecipient.id}-open`,
                    occurredAt: new Date("2026-08-28T15:42:00.000Z"),
                  },
                  {
                    eventId,
                    emailSendId: send.id,
                    emailSendRecipientId: sendRecipient.id,
                    type: MarketingEmailEventType.CLICK,
                    sgEventId: `${send.id}-${sendRecipient.id}-click`,
                    occurredAt: new Date("2026-08-28T15:43:00.000Z"),
                    url: "https://acme-events.example.com/register",
                  },
                ]
              : []),
          ],
        });
      }
    }
  }

  await prisma.marketingSuppression.create({
    data: {
      eventId,
      email: "carla.ruiz@example.com",
      normalizedEmail: "carla.ruiz@example.com",
      reason: MarketingSuppressionReason.UNSUBSCRIBE,
      source: MarketingSuppressionSource.MANUAL,
    },
  });

  const sentCampaign = await prisma.marketingCampaign.findFirst({
    where: { eventId, name: "Registration Push" },
    select: { id: true },
  });
  const sentEmail = await prisma.marketingEmailSend.findFirst({
    where: { eventId, subject: { contains: "travel and session planning guide" } },
    select: { id: true },
  });

  if (sentCampaign && sentEmail) {
    await prisma.marketingKpiSnapshot.create({
      data: {
        eventId,
        campaignId: sentCampaign.id,
        emailSendId: sentEmail.id,
        capturedByUserId: ownerUserId,
        capturedAt: new Date("2026-08-29T12:00:00.000Z"),
        registrationCount: 18,
        revenueAmountCents: 486000,
        goalValue: 30,
        note: "Registration push pacing above forecast after travel guide send.",
      },
    });
  }
}

async function seedNotifications(
  users: { demo: SeedUser; sarah: SeedUser; emily: SeedUser; john: SeedUser },
  eventId: string,
  speakerMap: Map<string, string>,
) {
  const rows = [
    ["speaker.upload", "Speaker uploaded presentation", "Jennifer Adams uploaded executive-keynote-v4.pdf.", `/events/${eventId}/speakers/${speakerMap.get("Jennifer Adams")}`],
    ["budget.approval", "Budget approval requested", "Sarah Martinez requested approval for AV, decor, and entertainment updates.", `/events/${eventId}/budget?view=grid`],
    ["session.updated", "Session updated", "Pricing Strategy Forum changed duration and remains at risk.", `/events/${eventId}/matrix`],
    ["document.approved", "Document approved", "Venue Floorplans was approved by Emily Chen.", `/events/${eventId}/docs`],
    ["roadmap.deadline", "Roadmap deadline approaching", "Collect final BEO signatures is due in 11 days.", `/events/${eventId}/timeline`],
    ["speaker.reminder", "Speaker reminder sent", "A reminder was sent to Rafael Ortiz for missing travel details.", `/events/${eventId}/speakers`],
    ["marketing.send", "Campaign scheduled", "Sponsor Readiness is scheduled for September 18 at 11:30 AM ET.", `/events/${eventId}/marketing`],
    ["fnb.assignment", "F&B assignment updated", "Buffet Lunch was assigned to Networking Lunch.", `/events/${eventId}/matrix`],
  ] as const;

  let index = 0;
  for (const [type, title, body, linkUrl] of rows) {
    const notification = await createNotification({
      userId: users.demo.id,
      orgId: users.demo.orgId,
      actorUserId: index % 2 === 0 ? users.sarah.id : users.emily.id,
      eventId,
      type,
      title,
      body,
      linkUrl,
    });
    if (index > 3) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          isRead: true,
          readAt: addDays(new Date(), -1),
        },
      });
    }
    index += 1;
  }
}

async function seedPortfolioSupportEvent(
  event: { id: string },
  users: { demo: SeedUser; sarah: SeedUser; emily: SeedUser },
) {
  await resetEventScopedData(event.id);

  const isPartnerSummit = event.id === PORTFOLIO_SUPPORT_EVENTS[0].id;

  await prisma.timelineItem.createMany({
    data: isPartnerSummit
      ? [
          {
            eventId: event.id,
            ownerUserId: users.sarah.id,
            title: "Confirm sponsor expo rules",
            startDate: new Date("2026-07-14T00:00:00.000Z"),
            endDate: new Date("2026-07-24T00:00:00.000Z"),
            status: TimelineStatus.AT_RISK,
            workstream: TimelineWorkstream.SPONSORS,
            priority: TimelinePriority.CRITICAL,
            progress: 35,
            sortOrder: 1,
          },
          {
            eventId: event.id,
            ownerUserId: users.emily.id,
            title: "Finalize partner advisory dinner agenda",
            startDate: new Date("2026-07-16T00:00:00.000Z"),
            endDate: new Date("2026-07-29T00:00:00.000Z"),
            status: TimelineStatus.IN_PROGRESS,
            workstream: TimelineWorkstream.SPEAKERS,
            priority: TimelinePriority.HIGH,
            progress: 60,
            sortOrder: 2,
          },
        ]
      : [
          {
            eventId: event.id,
            ownerUserId: users.sarah.id,
            title: "Approve customer council attendee list",
            startDate: new Date("2026-07-13T00:00:00.000Z"),
            endDate: new Date("2026-07-27T00:00:00.000Z"),
            status: TimelineStatus.AT_RISK,
            workstream: TimelineWorkstream.REGISTRATION,
            priority: TimelinePriority.HIGH,
            progress: 40,
            sortOrder: 1,
          },
          {
            eventId: event.id,
            ownerUserId: users.emily.id,
            title: "Ship moderator briefing packet",
            startDate: new Date("2026-07-15T00:00:00.000Z"),
            endDate: new Date("2026-07-30T00:00:00.000Z"),
            status: TimelineStatus.NOT_STARTED,
            workstream: TimelineWorkstream.SPEAKERS,
            priority: TimelinePriority.HIGH,
            progress: 0,
            sortOrder: 2,
          },
        ],
  });

  await prisma.deadline.create({
    data: {
      eventId: event.id,
      title: isPartnerSummit ? "Sponsor prospectus sign-off" : "Customer advisory invite approval",
      dueAt: isPartnerSummit
        ? new Date("2026-07-24T15:00:00.000Z")
        : new Date("2026-07-27T15:00:00.000Z"),
      category: DeadlineCategory.OTHER,
      status: DeadlineStatus.OPEN,
    },
  });

  const budget = await prisma.budget.upsert({
    where: { eventId: event.id },
    update: {
      status: BudgetStatus.SUBMITTED,
      submittedAt: new Date("2026-07-12T16:00:00.000Z"),
      submittedByUserId: users.sarah.id,
    },
    create: {
      eventId: event.id,
      status: BudgetStatus.SUBMITTED,
      submittedAt: new Date("2026-07-12T16:00:00.000Z"),
      submittedByUserId: users.sarah.id,
    },
  });

  const version = await prisma.budgetVersion.create({
    data: {
      budgetId: budget.id,
      versionNumber: 1,
      createdByUserId: users.sarah.id,
    },
  });
  await prisma.budget.update({
    where: { id: budget.id },
    data: { currentVersionId: version.id },
  });

  const approvalLine = await prisma.budgetLineItem.create({
    data: {
      budgetId: budget.id,
      category: isPartnerSummit ? "Sponsorship" : "Production",
      subcategory: isPartnerSummit ? "Expo" : "Stage",
      lineItem: isPartnerSummit ? "Expo hall power drops" : "Moderator stage package",
      vendor: isPartnerSummit ? "Convention Services Group" : "AV Unlimited",
      forecastCents: isPartnerSummit ? 185000 : 132000,
      actualCents: isPartnerSummit ? 210000 : 54000,
      status: BudgetLineItemStatus.COMMITTED,
      approval: BudgetLineItemApproval.PENDING,
      sortOrder: 1,
    },
  });

  await prisma.budgetLineItem.create({
    data: {
      budgetId: budget.id,
      category: "Food & Beverage",
      subcategory: "Hospitality",
      lineItem: isPartnerSummit ? "Partner welcome reception" : "Customer lunch service",
      vendor: "Encore Catering",
      forecastCents: isPartnerSummit ? 96000 : 74000,
      actualCents: isPartnerSummit ? 91000 : 68000,
      status: BudgetLineItemStatus.COMMITTED,
      approval: BudgetLineItemApproval.APPROVED,
      sortOrder: 2,
    },
  });

  await prisma.budgetItem.create({
    data: {
      budgetVersionId: version.id,
      category: approvalLine.category,
      subcategory: approvalLine.subcategory,
      name: approvalLine.lineItem,
      vendor: approvalLine.vendor,
      forecastCents: approvalLine.forecastCents,
      actualCents: approvalLine.actualCents,
      status: BudgetItemStatus.COMMITTED,
    },
  });

  const submission = await prisma.budgetSubmission.create({
    data: {
      budgetId: budget.id,
      budgetVersionId: version.id,
      submittedByUserId: users.sarah.id,
      status: "SUBMITTED" as never,
      submittedAt: new Date("2026-07-12T16:15:00.000Z"),
      message: isPartnerSummit
        ? "Please review the expo services cost increase."
        : "Please review the updated stage and moderator package.",
    },
  });

  await prisma.budgetSubmissionRecipient.create({
    data: {
      submissionId: submission.id,
      userId: users.emily.id,
    },
  });

  await prisma.budgetSubmissionLineItem.create({
    data: {
      submissionId: submission.id,
      budgetLineItemId: approvalLine.id,
    },
  });

  const category = await prisma.documentCategory.create({
    data: {
      eventId: event.id,
      name: "Operations",
      slug: "operations",
      color: "#2563eb",
    },
  });

  const document = await prisma.document.create({
    data: {
      orgId: users.demo.orgId,
      eventId: event.id,
      categoryId: category.id,
      title: isPartnerSummit ? "Expo Operations Brief" : "Customer Advisory Run Sheet",
      status: DocumentStatus.IN_REVIEW,
      visibility: DocumentVisibility.INTERNAL_ONLY,
    },
  });

  await prisma.documentVersion.create({
    data: {
      documentId: document.id,
      versionNumber: 1,
      objectKey: `help-seed/${event.id}/docs/${document.id}.pdf`,
      objectEtag: `${document.id}-v1`,
      mimeType: "application/pdf",
      fileSizeBytes: 1_500_000,
      originalFilename: isPartnerSummit ? "expo-operations-brief.pdf" : "customer-advisory-run-sheet.pdf",
      uploadedByUserId: users.sarah.id,
    },
  });

  const approval = await prisma.documentApproval.create({
    data: {
      documentId: document.id,
      status: DocumentApprovalStatus.IN_REVIEW,
      actedByUserId: users.sarah.id,
      actedAt: new Date("2026-07-12T17:00:00.000Z"),
      note: "Shared for operational review.",
    },
  });

  await prisma.documentApprovalRecipient.create({
    data: {
      approvalId: approval.id,
      userId: users.emily.id,
    },
  });
}

async function main() {
  const baseDate = startOfDay(new Date("2026-07-13T00:00:00.000Z"));
  void baseDate;

  logStep("Ensuring organization, users, client, and event");
  const { organization, demo, sarah, emily, john } = await ensureOrganizationAndUsers();
  const client = await ensureClient(organization.id);
  const event = await ensureEvent(organization.id, client.id, demo.id);
  const supportEvents = await ensurePortfolioSupportEvents(organization.id, client.id, demo.id);
  await ensureEventMembers(event.id, [demo, sarah, emily, john]);
  for (const supportEvent of supportEvents) {
    await ensureEventMembers(supportEvent.id, [demo, sarah, emily, john]);
  }

  logStep("Resetting existing event-scoped demo data");
  await resetEventScopedData(event.id);

  logStep("Seeding rooms and sessions");
  const sessionMap = await seedRoomsAndSessions(event.id);
  logStep("Seeding reusable session requirements");
  await seedSessionRequirements(event.id, sessionMap);
  logStep("Seeding roadmap and deadlines");
  await seedRoadmap(event.id, sarah.id);
  await seedDeadlines(event.id);
  logStep("Seeding budget");
  await seedBudget(event.id, { demo, sarah, emily }, sessionMap);
  logStep("Seeding F&B catalog");
  await seedFnbCatalog(event.id, sessionMap);
  logStep("Seeding speakers and docs");
  const { speakerMap } = await seedSpeakersAndDocs(event.id, { demo, sarah, emily, john }, sessionMap);
  logStep("Seeding directory and attendees");
  await seedDirectoryAndAttendees(event.id, organization.id, client.id, sarah.id);
  logStep("Seeding seating");
  await seedSeating(event.id);
  logStep("Seeding marketing");
  await seedMarketing(event.id, sarah.id);
  logStep("Seeding notifications");
  await seedNotifications({ demo, sarah, emily, john }, event.id, speakerMap);
  logStep("Seeding portfolio support events");
  for (const supportEvent of supportEvents) {
    await seedPortfolioSupportEvent(supportEvent, { demo, sarah, emily });
  }

  const [
    sessionCount,
    roadmapCount,
    budgetLineCount,
    documentCount,
    speakerCount,
    directoryCount,
    attendeeCount,
    marketingCampaignCount,
    notificationCount,
    portfolioEventCount,
  ] = await Promise.all([
    prisma.matrixRow.count({ where: { eventId: event.id } }),
    prisma.timelineItem.count({ where: { eventId: event.id } }),
    prisma.budgetLineItem.count({ where: { budget: { eventId: event.id } } }),
    prisma.document.count({ where: { eventId: event.id } }),
    prisma.speaker.count({ where: { eventId: event.id } }),
    prisma.eventDirectoryPerson.count({ where: { eventId: event.id } }),
    prisma.eventAttendee.count({ where: { eventId: event.id } }),
    prisma.marketingCampaign.count({ where: { eventId: event.id } }),
    prisma.notification.count({ where: { eventId: event.id } }),
    prisma.event.count({ where: { orgId: organization.id } }),
  ]);

  logStep("Completed");
  console.log(
    JSON.stringify(
      {
        eventId: event.id,
        eventName: event.name,
        eventDates: {
          start: event.startDate.toISOString().slice(0, 10),
          end: event.endDate?.toISOString().slice(0, 10) ?? null,
        },
        portalUrl: `${EVENT_ORIGIN}/speaker-portal/{token}`,
        intakeUrl: `${EVENT_ORIGIN}/speaker-intake/{token}`,
        counts: {
          sessions: sessionCount,
          roadmapItems: roadmapCount,
          budgetLineItems: budgetLineCount,
          documents: documentCount,
          speakers: speakerCount,
          directoryPeople: directoryCount,
          attendees: attendeeCount,
          marketingCampaigns: marketingCampaignCount,
          notifications: notificationCount,
          portfolioEvents: portfolioEventCount,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
