import {
  DocumentApprovalStatus,
  DocumentLinkType,
  DocumentStatus,
  DocumentVisibility,
  Prisma,
  type EventActivityAction,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getEventApprovalWorkflows } from "@/lib/event-approval-workflows";
import {
  buildDocumentObjectKey,
  createPresignedUpload,
  getDownloadUrl,
  maxUploadBytes,
  validateUploadConstraints,
} from "@/src/server/storage/documents";
import { createNotification } from "@/src/server/services/notifications";
import {
  recordEventActivity,
  type EventActivityActorInput,
  type EventActivityChange,
} from "@/src/server/services/event-activity";

/** Authenticated actor context for document audit entries, or null for system writes. */
export type DocumentAuditActor = { id: string } | null | undefined;

function documentActor(actor: DocumentAuditActor): EventActivityActorInput {
  return actor?.id ? { kind: "USER", userId: actor.id } : { kind: "SYSTEM", label: "System" };
}

export class DocumentServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type EventContext = {
  id: string;
  orgId: string;
  name: string;
};

type UserMini = {
  id: string;
  name: string | null;
  email: string;
};

type LinkInput = {
  linkType: DocumentLinkType;
  linkedId: string;
};

type ApprovalActionType =
  | "REVIEW_SUBMITTED"
  | "REVIEW_PULLED_BACK"
  | "REVIEW_APPROVED"
  | "REVIEW_REJECTED";

type CategoryShape = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
};

const REVIEW_SUBMITTED_NOTE_PREFIX = "[[REVIEW_SUBMITTED]]";
const REVIEW_PULLED_BACK_NOTE_PREFIX = "[[REVIEW_PULLED_BACK]]";
const DOCUMENT_REVIEW_REQUESTED_NOTIFICATION_TYPE = "DOCUMENT_REVIEW_REQUESTED";

const DEFAULT_DOCUMENT_CATEGORIES: Array<{ name: string; slug: string; color: string }> = [
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

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const DOCUMENT_INCLUDE = {
  // Select only portable fields so reads work if DocumentCategory is on an older schema.
  category: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
  tags: {
    include: {
      tag: true,
    },
  },
  versions: {
    orderBy: {
      versionNumber: "desc",
    },
    include: {
      uploadedByUser: {
        select: USER_SELECT,
      },
    },
  },
  approvals: {
    orderBy: {
      actedAt: "desc",
    },
    include: {
      actedByUser: {
        select: USER_SELECT,
      },
    },
  },
  links: {
    orderBy: {
      createdAt: "asc",
    },
  },
} satisfies Prisma.DocumentInclude;

function isMissingDocumentCategoryEventIdColumn(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    error.message.includes("eventId")
  );
}

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function optionalText(value: unknown): string | null {
  if (typeof value === "undefined" || value === null) return null;
  const normalized = asText(value);
  return normalized ? normalized : null;
}

function requireText(value: unknown, field: string): string {
  const normalized = asText(value);
  if (!normalized) {
    throw new DocumentServiceError(`${field} is required`, 400);
  }
  return normalized;
}

function parseEnumValue<T extends string>(value: unknown, enumValues: readonly T[], field: string): T {
  if (typeof value !== "string") {
    throw new DocumentServiceError(`${field} is required`, 400);
  }

  if (!enumValues.includes(value as T)) {
    throw new DocumentServiceError(`${field} is invalid`, 400);
  }

  return value as T;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter((item) => item.length > 0);
}

function parseLinkInputs(value: unknown): LinkInput[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const linkType = parseEnumValue(
        (entry as { linkType?: unknown }).linkType,
        ["BUDGET_ITEM", "DEADLINE", "MATRIX_SESSION", "EVENT", "SPEAKER"],
        "linkType",
      ) as DocumentLinkType;

      const linkedId = asText((entry as { linkedId?: unknown }).linkedId);
      if (!linkedId) {
        throw new DocumentServiceError("linkedId is required", 400);
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(linkedId)) {
        throw new DocumentServiceError("linkedId must be a valid UUID", 400);
      }

      return {
        linkType,
        linkedId,
      };
    })
    .filter((item): item is LinkInput => item !== null);
}

async function validateDocumentLinksForEvent(eventId: string, links: LinkInput[]): Promise<LinkInput[]> {
  if (links.length === 0) return links;

  const ids = (linkType: DocumentLinkType) =>
    links.filter((link) => link.linkType === linkType).map((link) => link.linkedId);
  const budgetItemIds = ids(DocumentLinkType.BUDGET_ITEM);
  const deadlineIds = ids(DocumentLinkType.DEADLINE);
  const matrixSessionIds = ids(DocumentLinkType.MATRIX_SESSION);
  const eventIds = ids(DocumentLinkType.EVENT);
  const speakerIds = ids(DocumentLinkType.SPEAKER);

  const [budgetItems, deadlines, matrixSessions, speakers] = await Promise.all([
    budgetItemIds.length
      ? getPrisma().budgetLineItem.findMany({
          where: { id: { in: budgetItemIds }, budget: { eventId } },
          select: { id: true },
        })
      : Promise.resolve([]),
    deadlineIds.length
      ? getPrisma().deadline.findMany({
          where: { id: { in: deadlineIds }, eventId },
          select: { id: true },
        })
      : Promise.resolve([]),
    matrixSessionIds.length
      ? getPrisma().matrixRow.findMany({
          where: { id: { in: matrixSessionIds }, eventId },
          select: { id: true },
        })
      : Promise.resolve([]),
    speakerIds.length
      ? getPrisma().speaker.findMany({
          where: { id: { in: speakerIds }, eventId },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  const validIds = new Map<DocumentLinkType, Set<string>>([
    [DocumentLinkType.BUDGET_ITEM, new Set(budgetItems.map((item) => item.id))],
    [DocumentLinkType.DEADLINE, new Set(deadlines.map((item) => item.id))],
    [DocumentLinkType.MATRIX_SESSION, new Set(matrixSessions.map((item) => item.id))],
    [DocumentLinkType.EVENT, new Set(eventIds.filter((id) => id === eventId))],
    [DocumentLinkType.SPEAKER, new Set(speakers.map((item) => item.id))],
  ]);
  const invalid = links.find((link) => !validIds.get(link.linkType)?.has(link.linkedId));
  if (invalid) {
    throw new DocumentServiceError(`${invalid.linkType} linkedId is invalid for this event`, 400);
  }
  return links;
}

function parseRecipientUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const uniqueValues = Array.from(
    new Set(
      value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean),
    ),
  );

  const invalid = uniqueValues.find((item) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item));
  if (invalid) {
    throw new DocumentServiceError(`recipientUserId is not a valid UUID: ${invalid}`, 400);
  }

  return uniqueValues;
}

function encodeReviewNote(action: "SUBMITTED" | "PULLED_BACK", note: string | null): string {
  const prefix = action === "PULLED_BACK" ? REVIEW_PULLED_BACK_NOTE_PREFIX : REVIEW_SUBMITTED_NOTE_PREFIX;
  if (!note) return prefix;
  return `${prefix} ${note}`;
}

function parseApprovalAction(status: DocumentApprovalStatus, note: string | null): {
  actionType: ApprovalActionType;
  cleanNote: string | null;
  label: string;
} {
  const normalizedNote = optionalText(note);

  if (status === DocumentApprovalStatus.APPROVED) {
    return {
      actionType: "REVIEW_APPROVED",
      cleanNote: normalizedNote,
      label: "Approved",
    };
  }

  if (status === DocumentApprovalStatus.REJECTED) {
    return {
      actionType: "REVIEW_REJECTED",
      cleanNote: normalizedNote,
      label: "Rejected",
    };
  }

  if (normalizedNote?.startsWith(REVIEW_PULLED_BACK_NOTE_PREFIX)) {
    const trimmed = normalizedNote
      .slice(REVIEW_PULLED_BACK_NOTE_PREFIX.length)
      .trim();
    return {
      actionType: "REVIEW_PULLED_BACK",
      cleanNote: trimmed || null,
      label: "Review Pulled Back",
    };
  }

  if (normalizedNote?.startsWith(REVIEW_SUBMITTED_NOTE_PREFIX)) {
    const trimmed = normalizedNote
      .slice(REVIEW_SUBMITTED_NOTE_PREFIX.length)
      .trim();
    return {
      actionType: "REVIEW_SUBMITTED",
      cleanNote: trimmed || null,
      label: "Submitted for Review",
    };
  }

  return {
    actionType: "REVIEW_SUBMITTED",
    cleanNote: normalizedNote,
    label: "Submitted for Review",
  };
}

function isMissingDocumentApprovalRecipientTable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2010" &&
    error.message.includes("DocumentApprovalRecipient")
  );
}

async function getEventContextOrThrow(eventId: string): Promise<EventContext> {
  const event = await getPrisma().event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      orgId: true,
      name: true,
    },
  });

  if (!event) {
    throw new DocumentServiceError("Event not found", 404);
  }

  return event;
}

async function listEventReviewRecipients(eventId: string, orgId?: string): Promise<UserMini[]> {
  const eventOrgId = orgId ?? (await getEventContextOrThrow(eventId)).orgId;

  const [orgUsers, eventMembers] = await getPrisma().$transaction([
    getPrisma().user.findMany({
      where: { orgId: eventOrgId },
      select: USER_SELECT,
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
    getPrisma().eventMember.findMany({
      where: { eventId },
      select: {
        user: {
          select: USER_SELECT,
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
  ]);

  const map = new Map<string, UserMini>();
  for (const user of orgUsers) {
    map.set(user.id, user);
  }
  for (const member of eventMembers) {
    map.set(member.user.id, member.user);
  }

  return Array.from(map.values()).sort((a, b) => {
    const aName = (a.name?.trim() || a.email).toLowerCase();
    const bName = (b.name?.trim() || b.email).toLowerCase();
    return aName.localeCompare(bName);
  });
}

async function resolveValidReviewRecipientIds(eventId: string, orgId: string, recipientUserIds: string[]): Promise<string[]> {
  if (recipientUserIds.length === 0) {
    throw new DocumentServiceError("recipientUserIds must include at least one user", 400);
  }

  const validRecipients = await listEventReviewRecipients(eventId, orgId);
  const validIds = new Set(validRecipients.map((user) => user.id));
  const filtered = recipientUserIds.filter((id) => validIds.has(id));

  if (filtered.length !== recipientUserIds.length) {
    throw new DocumentServiceError("One or more recipientUserIds are invalid for this event", 400);
  }

  return filtered;
}

async function listApprovalRecipientsByApprovalId(approvalIds: string[]): Promise<Map<string, UserMini[]>> {
  const map = new Map<string, UserMini[]>();
  if (approvalIds.length === 0) return map;

  try {
    const rows = await getPrisma().$queryRaw<Array<{
      approvalId: string;
      userId: string;
      name: string | null;
      email: string;
    }>>(
      Prisma.sql`
        SELECT dar."approvalId", u."id" as "userId", u."name", u."email"
        FROM "DocumentApprovalRecipient" dar
        INNER JOIN "User" u ON u."id" = dar."userId"
        WHERE dar."approvalId" IN (${Prisma.join(approvalIds.map((id) => Prisma.sql`${id}::uuid`))})
        ORDER BY u."name" ASC NULLS LAST, u."email" ASC
      `,
    );

    for (const row of rows) {
      const current = map.get(row.approvalId) ?? [];
      current.push({
        id: row.userId,
        name: row.name,
        email: row.email,
      });
      map.set(row.approvalId, current);
    }
  } catch (error) {
    if (!isMissingDocumentApprovalRecipientTable(error)) {
      throw error;
    }
  }

  return map;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function ensureDefaultDocumentCategories(eventId: string) {
  const existingCount = await getPrisma().documentCategory.count({
    where: { eventId },
  });

  if (existingCount > 0) {
    return;
  }

  await getPrisma().documentCategory.createMany({
    data: DEFAULT_DOCUMENT_CATEGORIES.map((category) => ({
      eventId,
      name: category.name,
      slug: category.slug,
      color: category.color,
    })),
    skipDuplicates: true,
  });
}

async function ensureLegacyDefaultDocumentCategories(orgId: string) {
  for (const category of DEFAULT_DOCUMENT_CATEGORIES) {
    await getPrisma().$queryRaw`
      INSERT INTO "DocumentCategory" ("id", "orgId", "name", "color", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${orgId}::uuid, ${category.name}, ${category.color}, now(), now())
      ON CONFLICT ("orgId", "name")
      DO UPDATE SET "color" = EXCLUDED."color", "updatedAt" = now()
    `;
  }
}

async function ensureDefaultDocumentCategoriesCompat(event: EventContext) {
  try {
    await ensureDefaultDocumentCategories(event.id);
  } catch (error) {
    if (!isMissingDocumentCategoryEventIdColumn(error)) {
      throw error;
    }
    await ensureLegacyDefaultDocumentCategories(event.orgId);
  }
}

async function listLegacyCategoriesForOrg(orgId: string): Promise<CategoryShape[]> {
  const rows = await getPrisma().$queryRaw<Array<{ id: string; name: string; color: string | null }>>`
    SELECT "id", "name", "color"
    FROM "DocumentCategory"
    WHERE "orgId" = ${orgId}::uuid
    ORDER BY "name" ASC
  `;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: toSlug(row.name),
    color: row.color,
  }));
}

async function ensureDocumentForEvent(eventId: string, documentId: string) {
  const document = await getPrisma().document.findFirst({
    where: { id: documentId, eventId },
    include: DOCUMENT_INCLUDE,
  });

  if (!document) {
    throw new DocumentServiceError("Document not found", 404);
  }

  return document;
}

async function ensureCategoryForEvent(eventId: string, categoryId: string) {
  let category: { id: string } | null = null;
  try {
    category = await getPrisma().documentCategory.findFirst({
      where: {
        id: categoryId,
        eventId,
      },
      select: { id: true },
    });
  } catch (error) {
    if (!isMissingDocumentCategoryEventIdColumn(error)) {
      throw error;
    }
    category = await getPrisma().documentCategory.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
  }

  if (!category) {
    throw new DocumentServiceError("categoryId is invalid for this event", 400);
  }
}

async function resolveTagIds(orgId: string, input: { tagIds?: unknown; tagNames?: unknown }): Promise<string[]> {
  const tagIds = parseStringArray(input.tagIds);
  const tagNames = parseStringArray(input.tagNames)
    .map((tagName) => tagName.trim())
    .filter(Boolean);

  const uniqueNames = Array.from(new Set(tagNames));

  const createdByName = await Promise.all(
    uniqueNames.map((name) =>
      getPrisma().documentTag.upsert({
        where: {
          orgId_name: {
            orgId,
            name,
          },
        },
        update: {},
        create: {
          orgId,
          name,
        },
        select: {
          id: true,
        },
      }),
    ),
  );

  const explicitTags =
    tagIds.length > 0
      ? await getPrisma().documentTag.findMany({
          where: {
            id: { in: tagIds },
            orgId,
          },
          select: {
            id: true,
          },
        })
      : [];

  const allTagIds = new Set<string>([
    ...createdByName.map((tag) => tag.id),
    ...explicitTags.map((tag) => tag.id),
  ]);

  if (tagIds.length > 0 && explicitTags.length !== tagIds.length) {
    throw new DocumentServiceError("One or more tagIds are invalid for this organization", 400);
  }

  return Array.from(allTagIds);
}

async function replaceDocumentTags(tx: Prisma.TransactionClient, documentId: string, tagIds: string[]): Promise<void> {
  await tx.documentTagOnDocument.deleteMany({ where: { documentId } });
  if (tagIds.length === 0) return;

  await tx.documentTagOnDocument.createMany({
    data: tagIds.map((tagId) => ({ documentId, tagId })),
    skipDuplicates: true,
  });
}

async function replaceDocumentLinks(tx: Prisma.TransactionClient, documentId: string, links: LinkInput[]): Promise<void> {
  await tx.documentLink.deleteMany({ where: { documentId } });
  if (links.length === 0) return;

  await tx.documentLink.createMany({
    data: links.map((link) => ({
      documentId,
      linkType: link.linkType,
      linkedId: link.linkedId,
    })),
    skipDuplicates: true,
  });
}

async function createSubmitReviewNotifications(input: {
  recipientUserIds: string[];
  orgId: string;
  eventId: string;
  documentId: string;
  documentTitle: string;
  actorUserId: string;
}) {
  const uniqueRecipientUserIds = Array.from(
    new Set(
      input.recipientUserIds
        .map((userId) => userId.trim())
        .filter(Boolean),
    ),
  );

  if (uniqueRecipientUserIds.length === 0) {
    return;
  }

  const existingUnreadByUser = await getPrisma().notification.findMany({
    where: {
      userId: { in: uniqueRecipientUserIds },
      type: DOCUMENT_REVIEW_REQUESTED_NOTIFICATION_TYPE,
      documentId: input.documentId,
      isRead: false,
    },
    select: {
      userId: true,
    },
  });

  const existingUnreadSet = new Set(existingUnreadByUser.map((row) => row.userId));
  const linkUrl = `/events/${encodeURIComponent(input.eventId)}/docs?docId=${encodeURIComponent(input.documentId)}`;
  const body = `${input.documentTitle} was submitted for your review.`;

  await Promise.all(
    uniqueRecipientUserIds
      .filter((userId) => !existingUnreadSet.has(userId))
      .map((userId) =>
        createNotification({
          userId,
          orgId: input.orgId,
          type: DOCUMENT_REVIEW_REQUESTED_NOTIFICATION_TYPE,
          title: "Document submitted for review",
          body,
          linkUrl,
          actorUserId: input.actorUserId,
          eventId: input.eventId,
          documentId: input.documentId,
        }),
      ),
  );
}

async function resolveLinkTargets(eventId: string, links: Array<{ linkType: DocumentLinkType; linkedId: string }>) {
  const budgetItemIds = links
    .filter((link) => link.linkType === "BUDGET_ITEM")
    .map((link) => link.linkedId);
  const deadlineIds = links
    .filter((link) => link.linkType === "DEADLINE")
    .map((link) => link.linkedId);
  const matrixIds = links
    .filter((link) => link.linkType === "MATRIX_SESSION")
    .map((link) => link.linkedId);
  const eventIds = links
    .filter((link) => link.linkType === "EVENT")
    .map((link) => link.linkedId);
  const speakerIds = links
    .filter((link) => link.linkType === "SPEAKER")
    .map((link) => link.linkedId);

  const [budgetItems, deadlines, matrixRows, events, speakers] = await Promise.all([
    budgetItemIds.length
      ? getPrisma().budgetLineItem.findMany({
          where: { id: { in: budgetItemIds }, budget: { eventId } },
          select: { id: true, lineItem: true },
        })
      : Promise.resolve([]),
    deadlineIds.length
      ? getPrisma().deadline.findMany({
          where: { id: { in: deadlineIds }, eventId },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    matrixIds.length
      ? getPrisma().matrixRow.findMany({
          where: { id: { in: matrixIds }, eventId },
          select: { id: true, sessionName: true, roomName: true, dayDate: true },
        })
      : Promise.resolve([]),
    eventIds.length
      ? getPrisma().event.findMany({
          where: { id: eventId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    speakerIds.length
      ? getPrisma().speaker.findMany({
          where: { id: { in: speakerIds }, eventId },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const budgetMap = new Map(budgetItems.map((item) => [item.id, item]));
  const deadlineMap = new Map(deadlines.map((item) => [item.id, item]));
  const matrixMap = new Map(matrixRows.map((item) => [item.id, item]));
  const eventMap = new Map(events.map((item) => [item.id, item]));
  const speakerMap = new Map(speakers.map((item) => [item.id, item]));

  return links.flatMap((link) => {
    if (link.linkType === "BUDGET_ITEM") {
      const item = budgetMap.get(link.linkedId);
      return item ? [{
        ...link,
        label: `Budget: ${item.lineItem}`,
        href: `/events/${encodeURIComponent(eventId)}/budget?lineItemId=${encodeURIComponent(link.linkedId)}`,
      }] : [];
    }

    if (link.linkType === "DEADLINE") {
      const item = deadlineMap.get(link.linkedId);
      return item ? [{
        ...link,
        label: `Deadline: ${item.title}`,
        href: `/events/${encodeURIComponent(eventId)}/timeline?deadlineId=${encodeURIComponent(link.linkedId)}`,
      }] : [];
    }

    if (link.linkType === "MATRIX_SESSION") {
      const item = matrixMap.get(link.linkedId);
      if (!item) return [];
      const fallback = item.sessionName || item.roomName || "Session";
      return [{
        ...link,
        label: `Matrix: ${fallback}`,
        href: `/events/${encodeURIComponent(eventId)}/matrix?sessionId=${encodeURIComponent(link.linkedId)}`,
      }];
    }

    if (link.linkType === "SPEAKER") {
      const item = speakerMap.get(link.linkedId);
      return item ? [{
        ...link,
        label: `Speaker: ${item.name}`,
        href: `/events/${encodeURIComponent(eventId)}/speakers?speakerId=${encodeURIComponent(link.linkedId)}`,
      }] : [];
    }

    const item = eventMap.get(link.linkedId);
    return item && link.linkedId === eventId ? [{
      ...link,
      label: `Event: ${item.name}`,
      href: `/events/${link.linkedId}`,
    }] : [];
  });
}

function buildDocumentWhere(eventId: string, filters: {
  search?: string | null;
  status?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  budgetItemId?: string | null;
}): Prisma.DocumentWhereInput {
  const where: Prisma.DocumentWhereInput = {
    eventId,
  };

  if (filters.status) {
    where.status = parseEnumValue(
      filters.status,
      ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"],
      "status",
    ) as DocumentStatus;
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.tagIds && filters.tagIds.length > 0) {
    where.tags = {
      some: {
        tagId: {
          in: filters.tagIds,
        },
      },
    };
  }

  if (filters.budgetItemId) {
    where.links = {
      some: {
        linkType: DocumentLinkType.BUDGET_ITEM,
        linkedId: filters.budgetItemId,
      },
    };
  }

  if (filters.search && filters.search.trim()) {
    const search = filters.search.trim();
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { category: { name: { contains: search, mode: "insensitive" } } },
      { tags: { some: { tag: { name: { contains: search, mode: "insensitive" } } } } },
      { versions: { some: { originalFilename: { contains: search, mode: "insensitive" } } } },
    ];
  }

  return where;
}

function buildActivity(
  approvals: Array<{
    id: string;
    status: DocumentApprovalStatus;
    actedAt: Date;
    actedByUser: UserMini | null;
    note: string | null;
  }>,
  versions: Array<{ id: string; versionNumber: number; createdAt: Date; uploadedByUser: UserMini | null }>,
) {
  const approvalActivity = approvals.map((entry) => {
    const parsed = parseApprovalAction(entry.status, entry.note);

    return {
      id: `approval-${entry.id}`,
      type: parsed.actionType,
      label: parsed.label,
      at: entry.actedAt,
      actor: entry.actedByUser,
      note: parsed.cleanNote,
    };
  });

  const uploadActivity = versions.map((entry) => ({
    id: `version-${entry.id}`,
    type: "UPLOAD" as const,
    label: `Uploaded v${entry.versionNumber}`,
    at: entry.createdAt,
    actor: entry.uploadedByUser,
    note: null,
  }));

  return [...approvalActivity, ...uploadActivity].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export async function listDocumentsForEvent(eventId: string, filters: {
  search?: string | null;
  status?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  budgetItemId?: string | null;
}, pagination?: {
  // D2: bound the Docs Hub list. When provided, the query loads one page and the
  // response reports an accurate filtered total + hasMore so the UI can load more
  // without ever pretending all documents are loaded. Omitted (e.g. in tests) =
  // unbounded, preserving the prior behavior.
  limit: number;
  offset?: number;
}) {
  const event = await getEventContextOrThrow(eventId);
  const reviewRecipients = await listEventReviewRecipients(eventId, event.orgId);

  const where = buildDocumentWhere(eventId, filters);
  const take = pagination ? Math.max(1, Math.floor(pagination.limit)) : undefined;
  const skip = pagination ? Math.max(0, Math.floor(pagination.offset ?? 0)) : 0;

  const [documents, allCount, needsReviewCount, approvedCount, categoryRows, filteredTotal] = await getPrisma().$transaction([
    getPrisma().document.findMany({
      where,
      orderBy: {
        updatedAt: "desc",
      },
      ...(take !== undefined ? { take, skip } : {}),
      include: {
        category: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        tags: { include: { tag: true } },
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            uploadedByUser: { select: USER_SELECT },
          },
        },
        approvals: {
          orderBy: { actedAt: "desc" },
          take: 1,
          include: {
            actedByUser: { select: USER_SELECT },
          },
        },
        links: {
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    getPrisma().document.count({ where: { eventId } }),
    getPrisma().document.count({ where: { eventId, status: DocumentStatus.IN_REVIEW } }),
    getPrisma().document.count({ where: { eventId, status: DocumentStatus.APPROVED } }),
    getPrisma().document.findMany({
      where: { eventId },
      select: { categoryId: true },
    }),
    // Accurate total for the CURRENT filter, so a bounded page never misrepresents
    // how many documents match. Independent of the status-tab counts above.
    getPrisma().document.count({ where }),
  ]);

  const categoryCountMap = new Map<string, number>();
  for (const row of categoryRows) {
    categoryCountMap.set(row.categoryId, (categoryCountMap.get(row.categoryId) ?? 0) + 1);
  }
  const categoryIds = Array.from(categoryCountMap.keys());
  const categories =
    categoryIds.length > 0
      ? await getPrisma().documentCategory.findMany({
          where: { id: { in: categoryIds } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, color: true },
        })
      : [];

  // Resolve every document's link targets in one batched pass instead of calling
  // resolveLinkTargets per document (which issued up to 5 queries per document).
  // Links are deduped by (linkType, linkedId) so each target type is queried once.
  const linkKey = (link: { linkType: DocumentLinkType; linkedId: string }) => `${link.linkType}:${link.linkedId}`;
  const dedupedLinks = Array.from(
    new Map(
      documents
        .flatMap((document) => document.links)
        .map((link) => [linkKey(link), { linkType: link.linkType, linkedId: link.linkedId }]),
    ).values(),
  );
  const resolvedLinkList = await resolveLinkTargets(eventId, dedupedLinks);
  const resolvedLinkByKey = new Map(resolvedLinkList.map((link) => [linkKey(link), link]));

  const documentCards = documents.map((document) => {
    const latestVersion = document.versions[0] ?? null;
    const latestApproval = document.approvals[0] ?? null;
    const parsedLatestApproval = (() => {
      if (!latestApproval) return null;
      const parsed = parseApprovalAction(latestApproval.status, latestApproval.note);
      return {
        ...latestApproval,
        reviewAction: parsed.actionType,
        note: parsed.cleanNote,
      };
    })();
    const resolvedLinks = document.links.flatMap((link) => {
      const resolved = resolvedLinkByKey.get(linkKey(link));
      return resolved ? [resolved] : [];
    });

    return {
      id: document.id,
      title: document.title,
      status: document.status,
      visibility: document.visibility,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      category: document.category,
      tags: document.tags.map((tag) => tag.tag),
      latestVersion,
      latestApproval: parsedLatestApproval,
      links: resolvedLinks,
    };
  });

  return {
    event,
    documents: documentCards,
    counts: {
      all: allCount,
      needsReview: needsReviewCount,
      approved: approvedCount,
      categories: categories.map((category) => ({
        ...category,
        slug: toSlug(category.name),
        count: categoryCountMap.get(category.id) ?? 0,
      })),
    },
    reviewRecipients,
    pagination: {
      limit: take ?? filteredTotal,
      offset: skip,
      total: filteredTotal,
      hasMore: skip + documentCards.length < filteredTotal,
    },
  };
}

export async function getDocumentDetails(eventId: string, documentId: string) {
  const event = await getEventContextOrThrow(eventId);
  const document = await ensureDocumentForEvent(eventId, documentId);
  const latestVersion = document.versions[0] ?? null;
  const approvalRecipients = await listApprovalRecipientsByApprovalId(document.approvals.map((approval) => approval.id));
  const reviewRecipients = await listEventReviewRecipients(eventId, event.orgId);

  const approvals = document.approvals.map((approval) => {
    const parsed = parseApprovalAction(approval.status, approval.note);
    return {
      ...approval,
      note: parsed.cleanNote,
      reviewAction: parsed.actionType,
      recipients: approvalRecipients.get(approval.id) ?? [],
    };
  });

  const latestApproval = approvals[0] ?? null;

  const resolvedLinks = await resolveLinkTargets(
    eventId,
    document.links.map((link) => ({ linkType: link.linkType, linkedId: link.linkedId })),
  );

  return {
    ...document,
    latestVersion,
    latestApproval,
    approvals,
    tags: document.tags.map((tag) => tag.tag),
    links: resolvedLinks,
    activity: buildActivity(document.approvals, document.versions),
    reviewRecipients,
  };
}

export async function createDocumentDraft(eventId: string, input: {
  title?: unknown;
  categoryId?: unknown;
  visibility?: unknown;
  tagIds?: unknown;
  tagNames?: unknown;
  links?: unknown;
}, actor?: DocumentAuditActor) {
  const event = await getEventContextOrThrow(eventId);
  await ensureDefaultDocumentCategoriesCompat(event);

  const title = requireText(input.title, "title");
  const categoryId = requireText(input.categoryId, "categoryId");
  await ensureCategoryForEvent(eventId, categoryId);

  const visibility = input.visibility
    ? (parseEnumValue(input.visibility, ["INTERNAL_ONLY", "CLIENT_VISIBLE"], "visibility") as DocumentVisibility)
    : DocumentVisibility.INTERNAL_ONLY;

  const tagIds = await resolveTagIds(event.orgId, {
    tagIds: input.tagIds,
    tagNames: input.tagNames,
  });

  const links = await validateDocumentLinksForEvent(eventId, parseLinkInputs(input.links));

  const document = await getPrisma().$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        orgId: event.orgId,
        eventId,
        title,
        categoryId,
        visibility,
        status: DocumentStatus.DRAFT,
      },
    });

    if (tagIds.length > 0) {
      await tx.documentTagOnDocument.createMany({
        data: tagIds.map((tagId) => ({ documentId: created.id, tagId })),
        skipDuplicates: true,
      });
    }

    if (links.length > 0) {
      await tx.documentLink.createMany({
        data: links.map((link) => ({
          documentId: created.id,
          linkType: link.linkType,
          linkedId: link.linkedId,
        })),
        skipDuplicates: true,
      });
    }

    await recordEventActivity(tx, {
      eventId,
      actor: documentActor(actor),
      module: "DOCUMENTS",
      action: "CREATED",
      entityType: "Document",
      entityId: created.id,
      entityLabel: created.title,
      message: `Created document draft "${created.title}"`,
    });

    return created;
  });

  return document;
}

export async function createDocumentUploadPresign(eventId: string, input: {
  documentId?: unknown;
  filename?: unknown;
  contentType?: unknown;
  fileSizeBytes?: unknown;
}) {
  const documentId = requireText(input.documentId, "documentId");
  const filename = requireText(input.filename, "filename");
  const contentType = requireText(input.contentType, "contentType").toLowerCase();
  const fileSizeBytes = Number(input.fileSizeBytes);

  if (!Number.isFinite(fileSizeBytes)) {
    throw new DocumentServiceError("fileSizeBytes must be a number", 400);
  }

  validateUploadConstraints(contentType, fileSizeBytes);

  const document = await getPrisma().document.findFirst({
    where: {
      id: documentId,
      eventId,
    },
    select: {
      id: true,
    },
  });

  if (!document) {
    throw new DocumentServiceError("Document not found", 404);
  }

  const latestVersion = await getPrisma().documentVersion.aggregate({
    where: { documentId },
    _max: { versionNumber: true },
  });

  const versionNumber = (latestVersion._max.versionNumber ?? 0) + 1;
  const objectKey = buildDocumentObjectKey({
    eventId,
    documentId,
    originalFilename: filename,
  });

  let presigned;
  try {
    presigned = await createPresignedUpload({
      objectKey,
      contentType,
      fileSizeBytes,
    });
  } catch (error) {
    console.error("Document upload presign failed", error);
    throw new DocumentServiceError("Unable to prepare the file upload. Please try again.", 500);
  }

  return {
    ...presigned,
    versionNumber,
    maxFileSizeBytes: maxUploadBytes(),
  };
}

export async function finalizeDocumentUpload(eventId: string, documentId: string, input: {
  objectKey?: unknown;
  objectEtag?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
  originalFilename?: unknown;
  title?: unknown;
  categoryId?: unknown;
  visibility?: unknown;
  submitForReview?: unknown;
  tagIds?: unknown;
  tagNames?: unknown;
  links?: unknown;
}, uploadedByUserId: string) {
  const document = await getPrisma().document.findFirst({
    where: {
      id: documentId,
      eventId,
    },
    select: {
      id: true,
      orgId: true,
      title: true,
    },
  });

  if (!document) {
    throw new DocumentServiceError("Document not found", 404);
  }
  const existingTitle = document.title;

  const objectKey = requireText(input.objectKey, "objectKey");
  // The presign step builds the key server-side and returns it; the client only
  // echoes it back. Re-scope it here so a caller with write access to this event
  // cannot finalize a version pointing at another event/document's stored object
  // (which the download route would later re-sign). Mirrors the speaker-file guard.
  const expectedKeyPrefix = `events/${eventId}/documents/${documentId}/`;
  if (!objectKey.startsWith(expectedKeyPrefix) || objectKey.includes("..")) {
    throw new DocumentServiceError("objectKey is outside this document's storage scope", 400);
  }
  const objectEtag = optionalText(input.objectEtag);
  const mimeType = requireText(input.mimeType, "mimeType").toLowerCase();
  const originalFilename = requireText(input.originalFilename, "originalFilename");
  const submitForReview = Boolean(input.submitForReview);

  const fileSizeBytes = Number(input.fileSizeBytes);
  if (!Number.isFinite(fileSizeBytes)) {
    throw new DocumentServiceError("fileSizeBytes must be a number", 400);
  }

  validateUploadConstraints(mimeType, fileSizeBytes);

  const uploader = await getPrisma().user.findUnique({ where: { id: uploadedByUserId }, select: { id: true } });
  if (!uploader) {
    throw new DocumentServiceError("uploadedByUserId is invalid", 400);
  }

  const tagIds = await resolveTagIds(document.orgId, {
    tagIds: input.tagIds,
    tagNames: input.tagNames,
  });

  const links = await validateDocumentLinksForEvent(eventId, parseLinkInputs(input.links));

  if (typeof input.categoryId !== "undefined" && input.categoryId !== null) {
    await ensureCategoryForEvent(eventId, requireText(input.categoryId, "categoryId"));
  }

  const latestVersion = await getPrisma().documentVersion.aggregate({
    where: { documentId },
    _max: { versionNumber: true },
  });

  const created = await getPrisma().$transaction(async (tx) => {
    const version = await tx.documentVersion.create({
      data: {
        documentId,
        versionNumber: (latestVersion._max.versionNumber ?? 0) + 1,
        objectKey,
        objectEtag,
        mimeType,
        fileSizeBytes,
        originalFilename,
        uploadedByUserId,
      },
    });

    const updateData: Prisma.DocumentUpdateInput = {};

    if (typeof input.title !== "undefined") {
      updateData.title = requireText(input.title, "title");
    }

    if (typeof input.categoryId !== "undefined") {
      const categoryId = requireText(input.categoryId, "categoryId");
      updateData.category = { connect: { id: categoryId } };
    }

    if (typeof input.visibility !== "undefined") {
      updateData.visibility = parseEnumValue(
        input.visibility,
        ["INTERNAL_ONLY", "CLIENT_VISIBLE"],
        "visibility",
      ) as DocumentVisibility;
    }

    updateData.status = submitForReview ? DocumentStatus.IN_REVIEW : DocumentStatus.DRAFT;

    if (Object.keys(updateData).length > 0) {
      await tx.document.update({ where: { id: documentId }, data: updateData });
    }

    if (typeof input.tagIds !== "undefined" || typeof input.tagNames !== "undefined") {
      await replaceDocumentTags(tx, documentId, tagIds);
    }

    if (typeof input.links !== "undefined") {
      await replaceDocumentLinks(tx, documentId, links);
    }

    if (submitForReview) {
      await tx.documentApproval.create({
        data: {
          documentId,
          status: DocumentApprovalStatus.IN_REVIEW,
          actedByUserId: uploadedByUserId,
          actedAt: new Date(),
          note: encodeReviewNote("SUBMITTED", "Sent for review after upload"),
        },
      });
    }

    const documentTitle = (updateData.title as string | undefined) ?? existingTitle;
    // Canonical entry for the upload. Storage keys / etags are never recorded.
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: uploadedByUserId },
      module: "DOCUMENTS",
      action: "UPLOADED",
      entityType: "Document",
      entityId: documentId,
      entityLabel: documentTitle,
      message:
        version.versionNumber > 1
          ? `Uploaded a new file version (v${version.versionNumber}) to "${documentTitle}"${submitForReview ? " and submitted for review" : ""}`
          : `Uploaded a file to "${documentTitle}"${submitForReview ? " and submitted for review" : ""}`,
    });

    return version;
  });

  return created;
}

export async function updateDocumentMetadata(eventId: string, documentId: string, input: {
  title?: unknown;
  categoryId?: unknown;
  visibility?: unknown;
  tagIds?: unknown;
  tagNames?: unknown;
  links?: unknown;
}, actor?: DocumentAuditActor) {
  const document = await getPrisma().document.findFirst({
    where: {
      id: documentId,
      eventId,
    },
    select: {
      id: true,
      orgId: true,
      title: true,
      visibility: true,
      category: { select: { name: true } },
    },
  });

  if (!document) {
    throw new DocumentServiceError("Document not found", 404);
  }

  const updateData: Prisma.DocumentUpdateInput = {};
  const changes: EventActivityChange[] = [];

  if (typeof input.title !== "undefined") {
    const nextTitle = requireText(input.title, "title");
    updateData.title = nextTitle;
    if (nextTitle !== document.title) {
      changes.push({ field: "title", label: "Title", from: document.title, to: nextTitle });
    }
  }

  if (typeof input.categoryId !== "undefined") {
    const categoryId = requireText(input.categoryId, "categoryId");
    await ensureCategoryForEvent(eventId, categoryId);
    updateData.category = { connect: { id: categoryId } };
    const nextCategory = await getPrisma().documentCategory.findUnique({
      where: { id: categoryId },
      select: { name: true },
    });
    if (nextCategory?.name && nextCategory.name !== document.category?.name) {
      changes.push({ field: "category", label: "Category", from: document.category?.name ?? null, to: nextCategory.name });
    }
  }

  if (typeof input.visibility !== "undefined") {
    const nextVisibility = parseEnumValue(
      input.visibility,
      ["INTERNAL_ONLY", "CLIENT_VISIBLE"],
      "visibility",
    ) as DocumentVisibility;
    updateData.visibility = nextVisibility;
    if (nextVisibility !== document.visibility) {
      changes.push({ field: "visibility", label: "Visibility", from: document.visibility, to: nextVisibility });
    }
  }

  const tagIds =
    typeof input.tagIds !== "undefined" || typeof input.tagNames !== "undefined"
      ? await resolveTagIds(document.orgId, {
          tagIds: input.tagIds,
          tagNames: input.tagNames,
        })
      : null;

  const links = typeof input.links !== "undefined"
    ? await validateDocumentLinksForEvent(eventId, parseLinkInputs(input.links))
    : null;

  await getPrisma().$transaction(async (tx) => {
    if (Object.keys(updateData).length > 0) {
      await tx.document.update({ where: { id: documentId }, data: updateData });
    }

    if (tagIds) {
      await replaceDocumentTags(tx, documentId, tagIds);
      changes.push({ field: "tags", label: "Tags", from: "previous tags", to: `${tagIds.length} tag${tagIds.length === 1 ? "" : "s"}` });
    }

    if (links) {
      await replaceDocumentLinks(tx, documentId, links);
      changes.push({ field: "links", label: "Links", from: "previous links", to: `${links.length} link${links.length === 1 ? "" : "s"}` });
    }

    // Only record when something meaningful changed (not an unchanged save).
    if (changes.length > 0) {
      await recordEventActivity(tx, {
        eventId,
        actor: documentActor(actor),
        module: "DOCUMENTS",
        action: "UPDATED",
        entityType: "Document",
        entityId: documentId,
        entityLabel: (updateData.title as string | undefined) ?? document.title,
        message: `Updated document "${(updateData.title as string | undefined) ?? document.title}"`,
        changes,
      });
    }
  });

  return getDocumentDetails(eventId, documentId);
}

async function updateDocumentStatus(
  eventId: string,
  documentId: string,
  status: DocumentStatus,
  approvalStatus: DocumentApprovalStatus,
  allowedFrom: DocumentStatus[],
  reviewAction: "SUBMITTED" | "PULLED_BACK" | "APPROVED" | "REJECTED",
  input: {
    actedByUserId: string;
    recipientUserIds?: unknown;
    note?: unknown;
  },
) {
  const actorUserId = requireText(input.actedByUserId, "actedByUserId");
  const note = optionalText(input.note);

  const actor = await getPrisma().user.findUnique({ where: { id: actorUserId }, select: { id: true } });
  if (!actor) {
    throw new DocumentServiceError("actedByUserId is invalid", 400);
  }

  const event = await getEventContextOrThrow(eventId);
  const existing = await ensureDocumentForEvent(eventId, documentId);

  if (!allowedFrom.includes(existing.status)) {
    throw new DocumentServiceError(`Invalid transition from ${existing.status} to ${status}`, 409);
  }

  const recipientUserIds = reviewAction === "SUBMITTED"
    ? await resolveValidReviewRecipientIds(eventId, event.orgId, parseRecipientUserIds(input.recipientUserIds))
    : [];

  const approvalNote = reviewAction === "SUBMITTED"
    ? encodeReviewNote("SUBMITTED", note)
    : reviewAction === "PULLED_BACK"
      ? encodeReviewNote("PULLED_BACK", note)
      : note;

  const reviewActionToAudit: Record<typeof reviewAction, EventActivityAction> = {
    SUBMITTED: "SUBMITTED",
    PULLED_BACK: "CANCELED",
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
  };
  const reviewActionMessage: Record<typeof reviewAction, string> = {
    SUBMITTED: `Submitted "${existing.title}" for review`,
    PULLED_BACK: `Pulled back "${existing.title}" from review`,
    APPROVED: `Approved "${existing.title}"`,
    REJECTED: `Rejected "${existing.title}"`,
  };

  const approval = await getPrisma().$transaction(async (tx) => {
    await tx.document.update({
      where: { id: documentId },
      data: {
        status,
      },
    });

    const created = await tx.documentApproval.create({
      data: {
        documentId,
        status: approvalStatus,
        actedByUserId: actor.id,
        actedAt: new Date(),
        note: approvalNote,
      },
    });

    // Canonical event-feed entry, atomic with the status transition. The review
    // note is intentionally not copied verbatim into the audit feed.
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: actor.id },
      module: "DOCUMENTS",
      action: reviewActionToAudit[reviewAction],
      entityType: "Document",
      entityId: documentId,
      entityLabel: existing.title,
      message: reviewActionMessage[reviewAction],
      source: { type: "DocumentApproval", id: created.id },
    });

    return created;
  });

  if (recipientUserIds.length > 0) {
    try {
      await getPrisma().$executeRaw(
        Prisma.sql`
          INSERT INTO "DocumentApprovalRecipient" ("approvalId", "userId", "createdAt")
          VALUES ${Prisma.join(
            recipientUserIds.map((userId) => Prisma.sql`(${approval.id}::uuid, ${userId}::uuid, now())`),
          )}
          ON CONFLICT ("approvalId", "userId") DO NOTHING
        `,
      );
    } catch (error) {
      if (!isMissingDocumentApprovalRecipientTable(error)) {
        throw error;
      }

      console.warn("DocumentApprovalRecipient table missing; skipping recipient persistence for review action.");
    }
  }

  if (reviewAction === "SUBMITTED" && recipientUserIds.length > 0) {
    await createSubmitReviewNotifications({
      recipientUserIds,
      orgId: event.orgId,
      eventId,
      documentId,
      documentTitle: existing.title,
      actorUserId: actor.id,
    });
  }

  return getDocumentDetails(eventId, documentId);
}

export async function submitDocumentForReview(
  eventId: string,
  documentId: string,
  input: { actedByUserId: string; recipientUserIds?: unknown; note?: unknown },
) {
  const workflows = await getEventApprovalWorkflows(eventId);
  if (workflows && !workflows.documentApprovalsEnabled) {
    throw new DocumentServiceError("Document approvals are disabled for this event", 409);
  }
  return updateDocumentStatus(
    eventId,
    documentId,
    DocumentStatus.IN_REVIEW,
    DocumentApprovalStatus.IN_REVIEW,
    [DocumentStatus.DRAFT],
    "SUBMITTED",
    input,
  );
}

export async function pullBackDocumentReview(
  eventId: string,
  documentId: string,
  input: { actedByUserId: string; note?: unknown },
) {
  return updateDocumentStatus(
    eventId,
    documentId,
    DocumentStatus.DRAFT,
    DocumentApprovalStatus.IN_REVIEW,
    [DocumentStatus.IN_REVIEW],
    "PULLED_BACK",
    input,
  );
}

export async function approveDocument(eventId: string, documentId: string, input: { actedByUserId: string; note?: unknown }) {
  return updateDocumentStatus(
    eventId,
    documentId,
    DocumentStatus.APPROVED,
    DocumentApprovalStatus.APPROVED,
    [DocumentStatus.IN_REVIEW],
    "APPROVED",
    input,
  );
}

export async function rejectDocument(eventId: string, documentId: string, input: { actedByUserId: string; note?: unknown }) {
  const note = optionalText(input.note);
  if (!note) {
    throw new DocumentServiceError("reason is required", 400);
  }

  return updateDocumentStatus(
    eventId,
    documentId,
    DocumentStatus.REJECTED,
    DocumentApprovalStatus.REJECTED,
    [DocumentStatus.IN_REVIEW],
    "REJECTED",
    {
      actedByUserId: input.actedByUserId,
      note,
    },
  );
}

export async function reopenDocument(eventId: string, documentId: string, input: { actedByUserId: string; note?: unknown }) {
  const actorUserId = requireText(input.actedByUserId, "actedByUserId");
  const actor = await getPrisma().user.findUnique({ where: { id: actorUserId }, select: { id: true } });
  if (!actor) {
    throw new DocumentServiceError("actedByUserId is invalid", 400);
  }

  const existing = await ensureDocumentForEvent(eventId, documentId);
  if (existing.status === DocumentStatus.DRAFT) {
    return getPrisma().document.findUniqueOrThrow({ where: { id: documentId } });
  }

  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.document.update({
      where: { id: documentId },
      data: {
        status: DocumentStatus.DRAFT,
      },
    });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: actor.id },
      module: "DOCUMENTS",
      action: "REOPENED",
      entityType: "Document",
      entityId: documentId,
      entityLabel: existing.title,
      message: `Reopened "${existing.title}" for editing`,
    });
    return updated;
  });
}

export async function getDownloadForDocument(eventId: string, documentId: string) {
  const document = await ensureDocumentForEvent(eventId, documentId);
  const latestVersion = document.versions[0];
  if (!latestVersion) {
    throw new DocumentServiceError("Document has no uploaded version", 404);
  }

  let url: string;
  try {
    url = await getDownloadUrl(latestVersion.objectKey);
  } catch (error) {
    console.error("Document download signing failed", error);
    throw new DocumentServiceError("Unable to prepare the download. Please try again.", 500);
  }

  return {
    document,
    latestVersion,
    url,
  };
}

export async function getDocumentCountsByBudgetLineItem(eventId: string, lineItemIds: string[]) {
  if (lineItemIds.length === 0) return new Map<string, { count: number; firstDocumentId: string | null }>();

  const links = await getPrisma().documentLink.findMany({
    where: {
      linkType: DocumentLinkType.BUDGET_ITEM,
      linkedId: { in: lineItemIds },
      document: {
        eventId,
      },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      linkedId: true,
      documentId: true,
    },
  });

  const map = new Map<string, { count: number; firstDocumentId: string | null }>();
  for (const id of lineItemIds) {
    map.set(id, { count: 0, firstDocumentId: null });
  }

  for (const link of links) {
    const entry = map.get(link.linkedId) ?? { count: 0, firstDocumentId: null };
    const updated = {
      count: entry.count + 1,
      firstDocumentId: entry.firstDocumentId ?? link.documentId,
    };
    map.set(link.linkedId, updated);
  }

  return map;
}

export async function listDocumentCategoriesForEvent(eventId: string) {
  const event = await getEventContextOrThrow(eventId);

  try {
    return await getPrisma().documentCategory.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
      },
    });
  } catch (error) {
    if (!isMissingDocumentCategoryEventIdColumn(error)) {
      throw error;
    }
    return listLegacyCategoriesForOrg(event.orgId);
  }
}

export async function createDocumentCategoryForEvent(
  eventId: string,
  input: { name?: unknown; color?: unknown },
  actor?: DocumentAuditActor,
) {
  const event = await getEventContextOrThrow(eventId);

  const name = requireText(input.name, "name");
  const slug = toSlug(name);
  if (!slug) {
    throw new DocumentServiceError("name is invalid", 400);
  }
  const color = optionalText(input.color);

  try {
    const created = await getPrisma().$transaction(async (tx) => {
      const category = await tx.documentCategory.create({
        data: {
          eventId,
          name,
          slug,
          color,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          color: true,
        },
      });
      await recordEventActivity(tx, {
        eventId,
        actor: documentActor(actor),
        module: "DOCUMENTS",
        action: "CREATED",
        entityType: "DocumentCategory",
        entityId: category.id,
        entityLabel: category.name,
        message: `Created document category "${category.name}"`,
      });
      return category;
    });
    return created;
  } catch (error) {
    if (isMissingDocumentCategoryEventIdColumn(error)) {
      const rows = await getPrisma().$queryRaw<Array<{ id: string; name: string; color: string | null }>>`
        INSERT INTO "DocumentCategory" ("id", "orgId", "name", "color", "createdAt", "updatedAt")
        VALUES (gen_random_uuid(), ${event.orgId}::uuid, ${name}, ${color}, now(), now())
        ON CONFLICT ("orgId", "name")
        DO UPDATE SET "color" = EXCLUDED."color", "updatedAt" = now()
        RETURNING "id", "name", "color"
      `;
      const created = rows[0];
      return {
        id: created.id,
        name: created.name,
        slug: toSlug(created.name),
        color: created.color,
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DocumentServiceError("Category already exists for this event", 409);
    }
    throw error;
  }
}

async function ensureDocumentCategoryBySlug(eventId: string, input: { name: string; slug: string; color: string }) {
  const event = await getEventContextOrThrow(eventId);
  await ensureDefaultDocumentCategoriesCompat(event);

  const existing = await getPrisma().documentCategory.findFirst({
    where: { eventId, slug: input.slug },
    select: { id: true, name: true, slug: true, color: true },
  });
  if (existing) return existing;

  return getPrisma().documentCategory.create({
    data: {
      eventId,
      name: input.name,
      slug: input.slug,
      color: input.color,
    },
    select: { id: true, name: true, slug: true, color: true },
  });
}

function ensureEventScopedObjectKey(eventId: string, objectKey: string): void {
  const expectedPrefix = `events/${eventId}/`;
  if (!objectKey.startsWith(expectedPrefix) || objectKey.includes("..")) {
    throw new DocumentServiceError("objectKey is outside this event's storage scope", 400);
  }
}

export async function createDocumentVersionFromEventObject(eventId: string, input: {
  title?: unknown;
  categoryName?: unknown;
  categorySlug?: unknown;
  categoryColor?: unknown;
  objectKey?: unknown;
  objectEtag?: unknown;
  mimeType?: unknown;
  fileSizeBytes?: unknown;
  originalFilename?: unknown;
  links?: unknown;
}, uploadedByUserId: string) {
  const event = await getEventContextOrThrow(eventId);
  const title = requireText(input.title, "title");
  const objectKey = requireText(input.objectKey, "objectKey");
  const mimeType = requireText(input.mimeType, "mimeType").toLowerCase();
  const originalFilename = requireText(input.originalFilename, "originalFilename");
  const fileSizeBytes = Number(input.fileSizeBytes);
  if (!Number.isFinite(fileSizeBytes)) {
    throw new DocumentServiceError("fileSizeBytes must be a number", 400);
  }
  validateUploadConstraints(mimeType, fileSizeBytes);
  ensureEventScopedObjectKey(eventId, objectKey);

  const existingVersion = await getPrisma().documentVersion.findFirst({
    where: {
      objectKey,
      document: { eventId },
    },
    select: {
      id: true,
      documentId: true,
      versionNumber: true,
    },
  });
  if (existingVersion) {
    return existingVersion;
  }

  const uploader = await getPrisma().user.findUnique({ where: { id: uploadedByUserId }, select: { id: true } });
  if (!uploader) {
    throw new DocumentServiceError("uploadedByUserId is invalid", 400);
  }

  const categoryName = optionalText(input.categoryName) ?? "Catering";
  const categorySlug = optionalText(input.categorySlug) ?? toSlug(categoryName);
  const categoryColor = optionalText(input.categoryColor) ?? "#ca8a04";
  const category = await ensureDocumentCategoryBySlug(eventId, {
    name: categoryName,
    slug: categorySlug,
    color: categoryColor,
  });
  const links = await validateDocumentLinksForEvent(eventId, parseLinkInputs(input.links));
  const objectEtag = optionalText(input.objectEtag);

  return getPrisma().$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        orgId: event.orgId,
        eventId,
        title,
        categoryId: category.id,
        visibility: DocumentVisibility.INTERNAL_ONLY,
        status: DocumentStatus.DRAFT,
      },
    });

    const version = await tx.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: 1,
        objectKey,
        objectEtag,
        mimeType,
        fileSizeBytes,
        originalFilename,
        uploadedByUserId: uploader.id,
      },
      select: {
        id: true,
        documentId: true,
        versionNumber: true,
      },
    });

    await tx.documentLink.createMany({
      data: [
        { documentId: document.id, linkType: DocumentLinkType.EVENT, linkedId: eventId },
        ...links.map((link) => ({ documentId: document.id, linkType: link.linkType, linkedId: link.linkedId })),
      ],
      skipDuplicates: true,
    });

    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: uploader.id },
      module: "DOCUMENTS",
      action: "UPLOADED",
      entityType: "Document",
      entityId: document.id,
      entityLabel: title,
      message: `Saved "${title}" to Docs Hub`,
    });

    return version;
  });
}

export async function listDocumentTagsForEvent(eventId: string) {
  const event = await getEventContextOrThrow(eventId);

  return getPrisma().documentTag.findMany({
    where: { orgId: event.orgId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
    },
  });
}

export async function listDocumentLinkOptions(eventId: string) {
  const [budgetItems, deadlines, matrixSessions] = await Promise.all([
    getPrisma().budget.findUnique({
      where: { eventId },
      select: {
        lineItems: {
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            lineItem: true,
          },
        },
      },
    }),
    getPrisma().deadline.findMany({
      where: { eventId },
      orderBy: { dueAt: "asc" },
      select: {
        id: true,
        title: true,
      },
    }),
    getPrisma().matrixRow.findMany({
      where: { eventId },
      orderBy: [{ dayDate: "asc" }, { startTime: "asc" }],
      select: {
        id: true,
        sessionName: true,
        roomName: true,
      },
    }),
  ]);

  return {
    budgetItems: (budgetItems?.lineItems ?? []).map((item) => ({
      id: item.id,
      label: item.lineItem,
    })),
    deadlines: deadlines.map((deadline) => ({
      id: deadline.id,
      label: deadline.title,
    })),
    matrixSessions: matrixSessions.map((row) => ({
      id: row.id,
      label: row.sessionName || row.roomName || "Session",
    })),
  };
}
