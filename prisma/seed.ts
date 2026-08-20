import "dotenv/config";

import {
  BudgetLineItemApproval,
  BudgetLineItemStatus,
  BudgetSubmissionStatus,
  BudgetStatus,
  BudgetItemStatus,
  DeadlineCategory,
  DeadlineStatus,
  DocumentApprovalStatus,
  DocumentLinkType,
  DocumentStatus,
  DocumentVisibility,
  EventStatus,
  MealPeriod,
  UserRole,
} from "@prisma/client";
import { getPrisma } from "../web/src/server/db/prisma";

const prisma = getPrisma();

function startOfDay(value: Date): Date {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number): Date {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function atTime(baseDate: Date, hour: number, minute: number): Date {
  const date = new Date(baseDate);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function main(): Promise<void> {
  const today = startOfDay(new Date());

  const organization = await prisma.organization.upsert({
    where: { slug: "acme-events-inc" },
    update: { name: "Acme Events Inc" },
    create: {
      name: "Acme Events Inc",
      slug: "acme-events-inc",
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: "demo@planneros.com" },
    update: {
      orgId: organization.id,
      name: "Demo Admin",
      role: UserRole.OWNER,
    },
    create: {
      orgId: organization.id,
      email: "demo@planneros.com",
      name: "Demo Admin",
      role: UserRole.OWNER,
    },
  });

  await prisma.membership.upsert({
    where: {
      orgId_userId: {
        orgId: organization.id,
        userId: demoUser.id,
      },
    },
    update: {},
    create: {
      orgId: organization.id,
      userId: demoUser.id,
    },
  });

  const sarahUser = await prisma.user.upsert({
    where: { email: "sarah.martinez@planneros.com" },
    update: {
      orgId: organization.id,
      name: "Sarah Martinez",
      role: UserRole.ADMIN,
    },
    create: {
      orgId: organization.id,
      email: "sarah.martinez@planneros.com",
      name: "Sarah Martinez",
      role: UserRole.ADMIN,
    },
  });

  const emilyUser = await prisma.user.upsert({
    where: { email: "emily.chen@planneros.com" },
    update: {
      orgId: organization.id,
      name: "Emily Chen",
      role: UserRole.ADMIN,
    },
    create: {
      orgId: organization.id,
      email: "emily.chen@planneros.com",
      name: "Emily Chen",
      role: UserRole.ADMIN,
    },
  });

  const johnUser = await prisma.user.upsert({
    where: { email: "john.smith@planneros.com" },
    update: {
      orgId: organization.id,
      name: "John Smith",
      role: UserRole.MEMBER,
    },
    create: {
      orgId: organization.id,
      email: "john.smith@planneros.com",
      name: "John Smith",
      role: UserRole.MEMBER,
    },
  });

  const existingEvent = await prisma.event.findFirst({
    where: {
      orgId: organization.id,
      name: { in: ["Annual Sales Conference 2026", "Demo Program"] },
    },
    select: { id: true },
  });

  const event = existingEvent
    ? await prisma.event.update({
        where: { id: existingEvent.id },
        data: {
          orgId: organization.id,
          name: "Annual Sales Conference 2026",
          startDate: today,
          timezone: "America/New_York",
          status: EventStatus.ACTIVE,
          createdByUserId: demoUser.id,
        },
      })
    : await prisma.event.create({
        data: {
          orgId: organization.id,
          name: "Annual Sales Conference 2026",
          startDate: today,
          timezone: "America/New_York",
          status: EventStatus.ACTIVE,
          createdByUserId: demoUser.id,
        },
      });

  const budget = await prisma.budget.upsert({
    where: { eventId: event.id },
    update: {
      status: BudgetStatus.DRAFT,
      submittedAt: null,
      submittedByUserId: null,
      approvedAt: null,
      approvedByUserId: null,
      rejectedAt: null,
      rejectedByUserId: null,
      rejectionReason: null,
      lockedAt: null,
    },
    create: {
      eventId: event.id,
      status: BudgetStatus.DRAFT,
    },
  });

  await prisma.budget.update({
    where: { id: budget.id },
    data: { currentVersionId: null },
  });

  await prisma.budgetSubmissionLineItem.deleteMany({
    where: {
      submission: {
        budgetId: budget.id,
      },
    },
  });

  await prisma.budgetSubmissionRecipient.deleteMany({
    where: {
      submission: {
        budgetId: budget.id,
      },
    },
  });

  await prisma.budgetSubmission.deleteMany({
    where: { budgetId: budget.id },
  });

  await prisma.budgetApproval.deleteMany({
    where: {
      budgetVersion: {
        budgetId: budget.id,
      },
    },
  });

  await prisma.budgetItem.deleteMany({
    where: {
      budgetVersion: {
        budgetId: budget.id,
      },
    },
  });

  await prisma.budgetVersion.deleteMany({
    where: { budgetId: budget.id },
  });
  await prisma.budgetLineItem.deleteMany({
    where: { budgetId: budget.id },
  });
  await prisma.budgetActivity.deleteMany({
    where: { budgetId: budget.id },
  });

  const budgetVersion = await prisma.budgetVersion.create({
    data: {
      budgetId: budget.id,
      versionNumber: 1,
      createdByUserId: demoUser.id,
    },
  });

  await prisma.budget.update({
    where: { id: budget.id },
    data: { currentVersionId: budgetVersion.id },
  });

  await prisma.deadline.deleteMany({ where: { eventId: event.id } });
  await prisma.matrixRow.deleteMany({ where: { eventId: event.id } });

  await prisma.deadline.createMany({
    data: [
      {
        eventId: event.id,
        title: "F&B Submission",
        dueAt: addDays(today, 7),
        category: DeadlineCategory.FNB,
        status: DeadlineStatus.OPEN,
      },
      {
        eventId: event.id,
        title: "A/V Order",
        dueAt: addDays(today, 14),
        category: DeadlineCategory.AV,
        status: DeadlineStatus.OPEN,
      },
      {
        eventId: event.id,
        title: "Housing Cutoff",
        dueAt: addDays(today, 21),
        category: DeadlineCategory.HOUSING,
        status: DeadlineStatus.OPEN,
      },
    ],
  });

  await prisma.budgetItem.createMany({
    data: [
      {
        budgetVersionId: budgetVersion.id,
        category: "F&B",
        subcategory: "Coffee Break",
        name: "Morning Coffee Service",
        forecastCents: 25000,
        actualCents: 0,
        status: BudgetItemStatus.PLANNED,
      },
      {
        budgetVersionId: budgetVersion.id,
        category: "F&B",
        subcategory: "Lunch",
        name: "Buffet Lunch",
        forecastCents: 120000,
        actualCents: 0,
        status: BudgetItemStatus.PLANNED,
      },
      {
        budgetVersionId: budgetVersion.id,
        category: "A/V",
        subcategory: "Audio",
        name: "PA System Rental",
        forecastCents: 80000,
        actualCents: 0,
        status: BudgetItemStatus.PLANNED,
      },
      {
        budgetVersionId: budgetVersion.id,
        category: "A/V",
        subcategory: "Visual",
        name: "Projector and Screen",
        forecastCents: 60000,
        actualCents: 0,
        status: BudgetItemStatus.PLANNED,
      },
      {
        budgetVersionId: budgetVersion.id,
        category: "Rooms",
        subcategory: "Meeting Space",
        name: "Ballroom Rental",
        forecastCents: 300000,
        actualCents: 0,
        status: BudgetItemStatus.PLANNED,
      },
    ],
  });

  await prisma.budgetLineItem.createMany({
    data: [
      {
        budgetId: budget.id,
        category: "F&B",
        subcategory: "Catering",
        lineItem: "Breakfast - Day 1",
        vendor: "Gourmet Catering Co.",
        forecastCents: 1_250_000,
        actualCents: 1_250_000,
        status: BudgetLineItemStatus.PAID,
        approval: BudgetLineItemApproval.APPROVED,
        sortOrder: 1,
      },
      {
        budgetId: budget.id,
        category: "F&B",
        subcategory: "Catering",
        lineItem: "Lunch - Day 1",
        vendor: "Gourmet Catering Co.",
        forecastCents: 1_800_000,
        actualCents: 1_780_000,
        status: BudgetLineItemStatus.PAID,
        approval: BudgetLineItemApproval.APPROVED,
        sortOrder: 2,
      },
      {
        budgetId: budget.id,
        category: "F&B",
        subcategory: "Beverages",
        lineItem: "Coffee Service - 3 Days",
        vendor: "Premium Coffee Service",
        forecastCents: 450_000,
        actualCents: 0,
        status: BudgetLineItemStatus.PLANNED,
        approval: BudgetLineItemApproval.PENDING,
        sortOrder: 3,
      },
      {
        budgetId: budget.id,
        category: "AV",
        subcategory: "Equipment",
        lineItem: "Main Stage Setup",
        vendor: "TechAV Solutions",
        forecastCents: 4_500_000,
        actualCents: 4_500_000,
        status: BudgetLineItemStatus.COMMITTED,
        approval: BudgetLineItemApproval.APPROVED,
        sortOrder: 4,
      },
      {
        budgetId: budget.id,
        category: "AV",
        subcategory: "Equipment",
        lineItem: "Breakout Room Equipment",
        vendor: "TechAV Solutions",
        forecastCents: 1_500_000,
        actualCents: 0,
        status: BudgetLineItemStatus.PLANNED,
        approval: BudgetLineItemApproval.PENDING,
        sortOrder: 5,
      },
      {
        budgetId: budget.id,
        category: "Rooms",
        subcategory: "Sleeping Rooms",
        lineItem: "Guest Room Block",
        vendor: "Grand Hotel",
        forecastCents: 12_000_000,
        actualCents: 0,
        status: BudgetLineItemStatus.COMMITTED,
        approval: BudgetLineItemApproval.APPROVED,
        sortOrder: 6,
      },
      {
        budgetId: budget.id,
        category: "Rooms",
        subcategory: "Meeting Space",
        lineItem: "Ballroom Rental",
        vendor: "Grand Hotel",
        forecastCents: 2_500_000,
        actualCents: 2_500_000,
        status: BudgetLineItemStatus.PAID,
        approval: BudgetLineItemApproval.APPROVED,
        sortOrder: 7,
      },
    ],
  });

  const seededBudgetLineItems = await prisma.budgetLineItem.findMany({
    where: { budgetId: budget.id },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  const firstSubmissionLineItemId = seededBudgetLineItems[0]?.id;
  const secondSubmissionLineItemId = seededBudgetLineItems[3]?.id ?? seededBudgetLineItems[1]?.id;

  if (firstSubmissionLineItemId && secondSubmissionLineItemId) {
    const firstSubmittedAt = atTime(addDays(today, -2), 10, 30);
    const firstApprovedAt = atTime(addDays(today, -2), 16, 0);
    const secondSubmittedAt = atTime(addDays(today, -1), 14, 20);
    const secondPulledBackAt = atTime(addDays(today, -1), 16, 5);

    const firstSubmission = await prisma.budgetSubmission.create({
      data: {
        budgetId: budget.id,
        budgetVersionId: budgetVersion.id,
        status: BudgetSubmissionStatus.APPROVED,
        submittedAt: firstSubmittedAt,
        submittedByUserId: sarahUser.id,
        message: "Submitting AV package for client approval.",
      },
    });

    await prisma.budgetSubmissionRecipient.createMany({
      data: [
        { submissionId: firstSubmission.id, userId: emilyUser.id },
        { submissionId: firstSubmission.id, userId: demoUser.id },
      ],
      skipDuplicates: true,
    });

    await prisma.budgetSubmissionLineItem.create({
      data: {
        submissionId: firstSubmission.id,
        budgetLineItemId: firstSubmissionLineItemId,
      },
    });

    const secondSubmission = await prisma.budgetSubmission.create({
      data: {
        budgetId: budget.id,
        budgetVersionId: budgetVersion.id,
        status: BudgetSubmissionStatus.PULLED_BACK,
        submittedAt: secondSubmittedAt,
        submittedByUserId: demoUser.id,
        pulledBackAt: secondPulledBackAt,
        pulledBackByUserId: demoUser.id,
        message: "Need to adjust vendor pricing before re-submitting.",
      },
    });

    await prisma.budgetSubmissionRecipient.createMany({
      data: [
        { submissionId: secondSubmission.id, userId: sarahUser.id },
        { submissionId: secondSubmission.id, userId: emilyUser.id },
      ],
      skipDuplicates: true,
    });

    await prisma.budgetSubmissionLineItem.create({
      data: {
        submissionId: secondSubmission.id,
        budgetLineItemId: secondSubmissionLineItemId,
      },
    });

    await prisma.budgetActivity.createMany({
      data: [
        {
          budgetId: budget.id,
          type: "SUBMITTED",
          actorUserId: sarahUser.id,
          note: `submissionId=${firstSubmission.id}`,
          createdAt: firstSubmittedAt,
        },
        {
          budgetId: budget.id,
          type: "APPROVED",
          actorUserId: emilyUser.id,
          note: `submissionId=${firstSubmission.id}`,
          createdAt: firstApprovedAt,
        },
        {
          budgetId: budget.id,
          type: "SUBMITTED",
          actorUserId: demoUser.id,
          note: `submissionId=${secondSubmission.id}`,
          createdAt: secondSubmittedAt,
        },
        {
          budgetId: budget.id,
          type: "REVISED",
          actorUserId: demoUser.id,
          note: `submissionId=${secondSubmission.id}`,
          createdAt: secondPulledBackAt,
        },
      ],
    });

    await prisma.budget.update({
      where: { id: budget.id },
      data: {
        status: BudgetStatus.DRAFT,
        submittedAt: secondSubmittedAt,
        submittedByUserId: demoUser.id,
        approvedAt: null,
        approvedByUserId: null,
        rejectedAt: null,
        rejectedByUserId: null,
        rejectionReason: null,
        lockedAt: null,
      },
    });
  }

  const dayOne = today;
  const dayTwo = addDays(today, 1);

  await prisma.matrixRow.createMany({
    data: [
      {
        eventId: event.id,
        dayDate: dayOne,
        startTime: atTime(dayOne, 8, 0),
        endTime: atTime(dayOne, 9, 0),
        roomName: "Grand Ballroom",
        sessionName: "Breakfast Briefing",
        setupType: "Rounds",
        attendance: 120,
        mealPeriod: MealPeriod.BREAKFAST,
        avNeeds: "Podium mic, confidence monitor",
      },
      {
        eventId: event.id,
        dayDate: dayOne,
        startTime: atTime(dayOne, 10, 0),
        endTime: atTime(dayOne, 12, 0),
        roomName: "Room A",
        sessionName: "General Session",
        setupType: "Theater",
        attendance: 200,
        mealPeriod: MealPeriod.NONE,
        avNeeds: "2 handheld mics, projector",
      },
      {
        eventId: event.id,
        dayDate: dayOne,
        startTime: atTime(dayOne, 12, 30),
        endTime: atTime(dayOne, 13, 30),
        roomName: "Grand Ballroom",
        sessionName: "Networking Lunch",
        setupType: "Rounds",
        attendance: 140,
        mealPeriod: MealPeriod.LUNCH,
        avNeeds: "Background music feed",
      },
      {
        eventId: event.id,
        dayDate: dayTwo,
        startTime: atTime(dayTwo, 9, 0),
        endTime: atTime(dayTwo, 10, 30),
        roomName: "Room B",
        sessionName: "Workshop",
        setupType: "Classroom",
        attendance: 60,
        mealPeriod: MealPeriod.BREAK,
        avNeeds: "HDMI to projector, lapel mic",
      },
      {
        eventId: event.id,
        dayDate: dayTwo,
        startTime: atTime(dayTwo, 17, 0),
        endTime: atTime(dayTwo, 18, 30),
        roomName: "Terrace",
        sessionName: "Closing Reception",
        setupType: "Reception",
        attendance: 150,
        mealPeriod: MealPeriod.RECEPTION,
        avNeeds: "Wireless speaker setup",
      },
    ],
  });

  const budgetLineItems = await prisma.budgetLineItem.findMany({
    where: { budgetId: budget.id },
    select: { id: true, lineItem: true },
  });
  const deadlines = await prisma.deadline.findMany({
    where: { eventId: event.id },
    select: { id: true, title: true },
  });
  const matrixRows = await prisma.matrixRow.findMany({
    where: { eventId: event.id },
    select: { id: true, sessionName: true },
  });

  const budgetItemIdByName = new Map(budgetLineItems.map((item) => [item.lineItem, item.id]));
  const deadlineIdByTitle = new Map(deadlines.map((deadline) => [deadline.title, deadline.id]));
  const matrixIdBySession = new Map(
    matrixRows
      .filter((row) => row.sessionName)
      .map((row) => [row.sessionName as string, row.id]),
  );

  const existingDocs = await prisma.document.findMany({
    where: { eventId: event.id },
    select: { id: true },
  });
  const existingDocIds = existingDocs.map((doc) => doc.id);

  if (existingDocIds.length > 0) {
    await prisma.documentTagOnDocument.deleteMany({ where: { documentId: { in: existingDocIds } } });
    await prisma.documentLink.deleteMany({ where: { documentId: { in: existingDocIds } } });
    await prisma.documentApproval.deleteMany({ where: { documentId: { in: existingDocIds } } });
    await prisma.documentVersion.deleteMany({ where: { documentId: { in: existingDocIds } } });
    await prisma.document.deleteMany({ where: { id: { in: existingDocIds } } });
  }

  const categoryConfig = [
    { name: "Contracts", slug: "contracts", color: "#2563eb" },
    { name: "Insurance", slug: "insurance", color: "#16a34a" },
    { name: "Floorplans", slug: "floorplans", color: "#d97706" },
    { name: "Production", slug: "production", color: "#7c3aed" },
    { name: "Vendor Docs", slug: "vendor-docs", color: "#0f766e" },
    { name: "Finance", slug: "finance", color: "#0ea5e9" },
    { name: "Seating", slug: "seating", color: "#6366f1" },
    { name: "Staffing", slug: "staffing", color: "#9333ea" },
    { name: "AV", slug: "av", color: "#1d4ed8" },
    { name: "Catering", slug: "catering", color: "#ca8a04" },
    { name: "Marketing", slug: "marketing", color: "#db2777" },
  ];

  const categories = await Promise.all(
    categoryConfig.map((category) =>
      prisma.documentCategory.upsert({
        where: {
          eventId_slug: {
            eventId: event.id,
            slug: category.slug,
          },
        },
        update: {
          name: category.name,
          color: category.color,
        },
        create: {
          eventId: event.id,
          name: category.name,
          slug: category.slug,
          color: category.color,
        },
      }),
    ),
  );
  const categoryByName = new Map(categories.map((category) => [category.name, category.id]));

  const tags = await Promise.all(
    categoryConfig.map((tag) =>
      prisma.documentTag.upsert({
        where: {
          orgId_name: {
            orgId: organization.id,
            name: tag.name,
          },
        },
        update: {
          color: tag.color,
        },
        create: {
          orgId: organization.id,
          name: tag.name,
          color: tag.color,
        },
      }),
    ),
  );
  const tagByName = new Map(tags.map((tag) => [tag.name, tag.id]));

  async function createSeedDocument(input: {
    title: string;
    categoryName: string;
    status: DocumentStatus;
    visibility?: DocumentVisibility;
    tagNames: string[];
    links: Array<{ linkType: DocumentLinkType; linkedId: string }>;
    versions: Array<{
      versionNumber: number;
      filename: string;
      mimeType: string;
      fileSizeBytes: number;
      uploadedByUserId: string;
      createdAt: Date;
      etag: string;
    }>;
    approvals: Array<{
      status: DocumentApprovalStatus;
      actedByUserId: string;
      actedAt: Date;
      note?: string;
    }>;
  }): Promise<void> {
    const categoryId = categoryByName.get(input.categoryName);
    if (!categoryId) return;

    const created = await prisma.document.create({
      data: {
        orgId: organization.id,
        eventId: event.id,
        title: input.title,
        categoryId,
        visibility: input.visibility ?? DocumentVisibility.INTERNAL_ONLY,
        status: input.status,
      },
    });

    const docId = created.id;

    const tagRows = input.tagNames
      .map((name) => tagByName.get(name))
      .filter((tagId): tagId is string => Boolean(tagId))
      .map((tagId) => ({ documentId: docId, tagId }));

    if (tagRows.length > 0) {
      await prisma.documentTagOnDocument.createMany({
        data: tagRows,
        skipDuplicates: true,
      });
    }

    if (input.links.length > 0) {
      await prisma.documentLink.createMany({
        data: input.links.map((link) => ({
          documentId: docId,
          linkType: link.linkType,
          linkedId: link.linkedId,
        })),
        skipDuplicates: true,
      });
    }

    for (const version of input.versions) {
      await prisma.documentVersion.create({
        data: {
          documentId: docId,
          versionNumber: version.versionNumber,
          objectKey: `org/${organization.id}/events/${event.id}/docs/${docId}/v${version.versionNumber}/${version.filename}`,
          objectEtag: version.etag,
          mimeType: version.mimeType,
          fileSizeBytes: version.fileSizeBytes,
          originalFilename: version.filename,
          uploadedByUserId: version.uploadedByUserId,
          createdAt: version.createdAt,
        },
      });
    }

    for (const approval of input.approvals) {
      await prisma.documentApproval.create({
        data: {
          documentId: docId,
          status: approval.status,
          actedByUserId: approval.actedByUserId,
          actedAt: approval.actedAt,
          note: approval.note ?? null,
        },
      });
    }
  }

  const docsBase = addDays(today, -6);

  await createSeedDocument({
    title: "AV Equipment Contract - TechAV Solutions",
    categoryName: "Contracts",
    status: DocumentStatus.APPROVED,
    tagNames: ["Contracts"],
    links: [
      { linkType: DocumentLinkType.BUDGET_ITEM, linkedId: budgetItemIdByName.get("Main Stage Setup") ?? "" },
      { linkType: DocumentLinkType.DEADLINE, linkedId: deadlineIdByTitle.get("A/V Order") ?? "" },
    ].filter((link) => link.linkedId),
    versions: [
      {
        versionNumber: 1,
        filename: "av-equipment-contract-v1.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 2_400_000,
        uploadedByUserId: sarahUser.id,
        createdAt: atTime(addDays(docsBase, 1), 9, 0),
        etag: "doc-1-v1",
      },
      {
        versionNumber: 2,
        filename: "av-equipment-contract-v2.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 2_500_000,
        uploadedByUserId: johnUser.id,
        createdAt: atTime(addDays(docsBase, 3), 10, 15),
        etag: "doc-1-v2",
      },
      {
        versionNumber: 3,
        filename: "av-equipment-contract-v3.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 2_550_000,
        uploadedByUserId: sarahUser.id,
        createdAt: atTime(addDays(docsBase, 5), 14, 30),
        etag: "doc-1-v3",
      },
    ],
    approvals: [
      {
        status: DocumentApprovalStatus.IN_REVIEW,
        actedByUserId: johnUser.id,
        actedAt: atTime(addDays(docsBase, 3), 10, 30),
        note: "Marked as in review",
      },
      {
        status: DocumentApprovalStatus.APPROVED,
        actedByUserId: emilyUser.id,
        actedAt: atTime(addDays(docsBase, 5), 16, 0),
        note: "All terms look good. Approved.",
      },
    ],
  });

  await createSeedDocument({
    title: "Grand Ballroom Floorplan - Final Layout",
    categoryName: "Floorplans",
    status: DocumentStatus.IN_REVIEW,
    tagNames: ["Floorplans"],
    links: [
      { linkType: DocumentLinkType.MATRIX_SESSION, linkedId: matrixIdBySession.get("General Session") ?? "" },
      { linkType: DocumentLinkType.MATRIX_SESSION, linkedId: matrixIdBySession.get("Networking Lunch") ?? "" },
    ].filter((link) => link.linkedId),
    versions: [
      {
        versionNumber: 1,
        filename: "grand-ballroom-floorplan-v1.png",
        mimeType: "image/png",
        fileSizeBytes: 1_900_000,
        uploadedByUserId: johnUser.id,
        createdAt: atTime(addDays(docsBase, 2), 12, 10),
        etag: "doc-2-v1",
      },
      {
        versionNumber: 2,
        filename: "grand-ballroom-floorplan-v2.png",
        mimeType: "image/png",
        fileSizeBytes: 2_100_000,
        uploadedByUserId: johnUser.id,
        createdAt: atTime(addDays(docsBase, 4), 10, 15),
        etag: "doc-2-v2",
      },
    ],
    approvals: [
      {
        status: DocumentApprovalStatus.IN_REVIEW,
        actedByUserId: sarahUser.id,
        actedAt: atTime(addDays(docsBase, 4), 10, 30),
        note: "Layout sent for client review.",
      },
    ],
  });

  await createSeedDocument({
    title: "Event Insurance Certificate - Annual Sales Conference",
    categoryName: "Insurance",
    status: DocumentStatus.APPROVED,
    tagNames: ["Insurance"],
    links: [{ linkType: DocumentLinkType.EVENT, linkedId: event.id }],
    versions: [
      {
        versionNumber: 1,
        filename: "event-insurance-certificate.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1_700_000,
        uploadedByUserId: emilyUser.id,
        createdAt: atTime(addDays(docsBase, 4), 9, 0),
        etag: "doc-3-v1",
      },
    ],
    approvals: [
      {
        status: DocumentApprovalStatus.APPROVED,
        actedByUserId: emilyUser.id,
        actedAt: atTime(addDays(docsBase, 4), 16, 0),
        note: "Insurance coverage verified and approved.",
      },
    ],
  });

  await createSeedDocument({
    title: "Catering Menu Selection - Gourmet Catering Co",
    categoryName: "Vendor Docs",
    status: DocumentStatus.REJECTED,
    tagNames: ["Vendor Docs"],
    links: [
      { linkType: DocumentLinkType.BUDGET_ITEM, linkedId: budgetItemIdByName.get("Lunch - Day 1") ?? "" },
      { linkType: DocumentLinkType.DEADLINE, linkedId: deadlineIdByTitle.get("F&B Submission") ?? "" },
    ].filter((link) => link.linkedId),
    versions: [
      {
        versionNumber: 1,
        filename: "catering-menu-selection.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1_100_000,
        uploadedByUserId: sarahUser.id,
        createdAt: atTime(addDays(docsBase, 5), 11, 15),
        etag: "doc-4-v1",
      },
    ],
    approvals: [
      {
        status: DocumentApprovalStatus.IN_REVIEW,
        actedByUserId: johnUser.id,
        actedAt: atTime(addDays(docsBase, 5), 12, 10),
        note: "Submitted for review.",
      },
      {
        status: DocumentApprovalStatus.REJECTED,
        actedByUserId: emilyUser.id,
        actedAt: atTime(addDays(docsBase, 6), 14, 20),
        note: "The AV equipment costs seem high. Please review and provide alternative quotes before resubmitting.",
      },
    ],
  });

  await createSeedDocument({
    title: "Production Schedule - 3 Day Event",
    categoryName: "Production",
    status: DocumentStatus.DRAFT,
    tagNames: ["Production"],
    links: [{ linkType: DocumentLinkType.MATRIX_SESSION, linkedId: matrixIdBySession.get("Workshop") ?? "" }].filter(
      (link) => link.linkedId,
    ),
    versions: [
      {
        versionNumber: 1,
        filename: "production-schedule-v1.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSizeBytes: 860_000,
        uploadedByUserId: johnUser.id,
        createdAt: atTime(addDays(docsBase, 2), 15, 10),
        etag: "doc-5-v1",
      },
      {
        versionNumber: 2,
        filename: "production-schedule-v2.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileSizeBytes: 910_000,
        uploadedByUserId: johnUser.id,
        createdAt: atTime(addDays(docsBase, 4), 16, 25),
        etag: "doc-5-v2",
      },
    ],
    approvals: [],
  });

  await createSeedDocument({
    title: "Venue Contract - Grand Hotel",
    categoryName: "Contracts",
    status: DocumentStatus.APPROVED,
    tagNames: ["Contracts"],
    links: [
      { linkType: DocumentLinkType.BUDGET_ITEM, linkedId: budgetItemIdByName.get("Ballroom Rental") ?? "" },
      { linkType: DocumentLinkType.BUDGET_ITEM, linkedId: budgetItemIdByName.get("Guest Room Block") ?? "" },
    ].filter((link) => link.linkedId),
    versions: [
      {
        versionNumber: 1,
        filename: "venue-contract-grand-hotel.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 2_050_000,
        uploadedByUserId: emilyUser.id,
        createdAt: atTime(addDays(docsBase, 3), 10, 45),
        etag: "doc-6-v1",
      },
    ],
    approvals: [
      {
        status: DocumentApprovalStatus.APPROVED,
        actedByUserId: emilyUser.id,
        actedAt: atTime(addDays(docsBase, 3), 15, 30),
        note: "Venue contract terms accepted.",
      },
    ],
  });

  await prisma.seatingAssignment.deleteMany({ where: { eventId: event.id } });
  await prisma.seatingAttendee.deleteMany({ where: { eventId: event.id } });
  await prisma.seatingTable.deleteMany({ where: { eventId: event.id } });

  const tableConfigs = [
    { name: "Table 1", capacity: 10 },
    { name: "Table 2", capacity: 10 },
    { name: "Table 3", capacity: 8 },
    { name: "Table 4", capacity: 8 },
    { name: "Table 5", capacity: 12 },
    { name: "VIP Table", capacity: 6 },
  ];

  const seatingTables = await Promise.all(
    tableConfigs.map((table, index) =>
      prisma.seatingTable.create({
        data: {
          eventId: event.id,
          name: table.name,
          capacity: table.capacity,
          sortOrder: index + 1,
        },
      }),
    ),
  );

  const attendeeConfigs = [
    { firstName: "John", lastName: "Smith", company: "Acme Corp", email: "john.smith@acme.com" },
    { firstName: "Sarah", lastName: "Johnson", company: "Tech Inc", email: "sarah.johnson@techinc.com" },
    { firstName: "Michael", lastName: "Lee", company: "Enterprise Co", email: "michael.lee@enterprise.co" },
    { firstName: "Priya", lastName: "Patel", company: "Bright Labs", email: "priya.patel@brightlabs.io" },
    { firstName: "David", lastName: "Brown", company: "Summit Group", email: "david.brown@summitgroup.com" },
    { firstName: "Aisha", lastName: "Khan", company: "Northstar", email: "aisha.khan@northstar.io" },
    { firstName: "Emily", lastName: "Davis", company: "Start Up", email: "emily.davis@startup.com" },
    { firstName: "Robert", lastName: "Wilson", company: "Enterprise Co", email: "robert.wilson@enterprise.co" },
    { firstName: "Nina", lastName: "Lopez", company: "Acme Corp", email: "nina.lopez@acme.com" },
    { firstName: "Alex", lastName: "Chen", company: "Tech Inc", email: "alex.chen@techinc.com" },
    { firstName: "Grace", lastName: "Kim", company: "Bright Labs", email: "grace.kim@brightlabs.io" },
    { firstName: "Owen", lastName: "Taylor", company: "Summit Group", email: "owen.taylor@summitgroup.com" },
  ];

  const seatingAttendees = await Promise.all(
    attendeeConfigs.map((attendee) =>
      prisma.seatingAttendee.create({
        data: {
          eventId: event.id,
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          company: attendee.company,
          email: attendee.email,
        },
      }),
    ),
  );

  const tableByName = new Map(seatingTables.map((table) => [table.name, table.id]));
  const attendeeByName = new Map(
    seatingAttendees.map((attendee) => [`${attendee.firstName} ${attendee.lastName}`, attendee.id]),
  );

  const assignments = [
    { attendee: "John Smith", table: "Table 1" },
    { attendee: "Sarah Johnson", table: "Table 1" },
    { attendee: "Michael Lee", table: "Table 1" },
    { attendee: "Priya Patel", table: "Table 2" },
    { attendee: "David Brown", table: "Table 2" },
    { attendee: "Aisha Khan", table: "Table 3" },
    { attendee: "Nina Lopez", table: "VIP Table" },
    { attendee: "Alex Chen", table: "VIP Table" },
  ];

  await prisma.seatingAssignment.createMany({
    data: assignments.map((assignment) => ({
      eventId: event.id,
      tableId: tableByName.get(assignment.table)!,
      attendeeId: attendeeByName.get(assignment.attendee)!,
    })),
  });

  console.log("Seed complete:");
  console.log(`- Organization: ${organization.name}`);
  console.log(`- User: ${demoUser.email}`);
  console.log(`- Event: ${event.name}`);
  console.log(`- orgId: ${organization.id}`);
  console.log(`- userId: ${demoUser.id}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
