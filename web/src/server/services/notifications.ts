import { getPrisma } from "@/lib/prisma";
import { shouldLogNotificationDebug } from "@/lib/logging/log-policy";
import type { Prisma } from "@prisma/client";

export class NotificationServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type CreateNotificationInput = {
  userId: string;
  orgId?: string | null;
  type: string;
  title: string;
  body: string;
  linkUrl?: string | null;
  actorUserId?: string | null;
  eventId?: string | null;
  documentId?: string | null;
};

type NotificationClient = Pick<Prisma.TransactionClient, "notification">;

export type AssignmentNotification = {
  userId: string;
  orgId?: string | null;
  eventId?: string | null;
  actorUserId?: string | null;
  type: string;
  title: string;
  body: string;
  linkUrl: string;
};

type ListNotificationsForUserInput = {
  userId: string;
  limit?: number;
  unreadOnly?: boolean;
};

type MarkReadInput = {
  notificationId: string;
  userId: string;
};

function requireText(value: string | null | undefined, field: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new NotificationServiceError(`${field} is required`, 400);
  }
  return normalized;
}

function optionalText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 20;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

const NOTIFICATION_SELECT = {
  id: true,
  userId: true,
  orgId: true,
  type: true,
  title: true,
  body: true,
  linkUrl: true,
  isRead: true,
  createdAt: true,
  readAt: true,
  actorUserId: true,
  eventId: true,
  documentId: true,
} as const;

export async function createNotification(input: CreateNotificationInput, prisma: NotificationClient = getPrisma()) {
  const userId = requireText(input.userId, "userId");
  const type = requireText(input.type, "type");
  const title = requireText(input.title, "title");
  const body = requireText(input.body, "body");

  return prisma.notification.create({
    data: {
      userId,
      orgId: optionalText(input.orgId),
      type,
      title,
      body,
      linkUrl: optionalText(input.linkUrl),
      actorUserId: optionalText(input.actorUserId),
      eventId: optionalText(input.eventId),
      documentId: optionalText(input.documentId),
    },
    select: NOTIFICATION_SELECT,
  });
}

/**
 * Persist assignment notifications with the mutation that made the assignment.
 * Callers pass one entry per recipient; bulk callers intentionally pass one
 * grouped entry per recipient rather than one entry per affected record.
 */
export async function createAssignmentNotifications(
  assignments: readonly AssignmentNotification[],
  prisma: NotificationClient = getPrisma(),
) {
  const notifications = [];
  for (const assignment of assignments) {
    notifications.push(await createNotification(assignment, prisma));
  }
  return notifications;
}

export async function listNotificationsForUser(input: ListNotificationsForUserInput) {
  const userId = requireText(input.userId, "userId");
  const limit = normalizeLimit(input.limit);

  return getPrisma().notification.findMany({
    where: {
      userId,
      isRead: input.unreadOnly ? false : undefined,
    },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: NOTIFICATION_SELECT,
  });
}

export async function getUnreadCount(userId: string) {
  const normalizedUserId = requireText(userId, "userId");
  if (shouldLogNotificationDebug()) {
    console.info("DEBUG NOTIFICATIONS service:getUnreadCount:start", {
      userId: normalizedUserId,
    });
  }
  const unreadCount = await getPrisma().notification.count({
    where: {
      userId: normalizedUserId,
      isRead: false,
    },
  });
  if (shouldLogNotificationDebug()) {
    console.info("DEBUG NOTIFICATIONS service:getUnreadCount:end", {
      userId: normalizedUserId,
      unreadCount,
    });
  }
  return unreadCount;
}

export async function markRead(input: MarkReadInput) {
  const notificationId = requireText(input.notificationId, "notificationId");
  const userId = requireText(input.userId, "userId");

  const existing = await getPrisma().notification.findFirst({
    where: {
      id: notificationId,
      userId,
    },
    select: NOTIFICATION_SELECT,
  });

  if (!existing) {
    throw new NotificationServiceError("Notification not found", 404);
  }

  if (existing.isRead) {
    return existing;
  }

  return getPrisma().notification.update({
    where: { id: notificationId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
    select: NOTIFICATION_SELECT,
  });
}
