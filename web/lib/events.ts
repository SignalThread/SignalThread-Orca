import { EventMemberRole, Prisma, TimelinePriority, TimelineStatus, UserRole, type Event } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { ensureEventSessionRequirementTemplateTx } from "@/lib/session-requirements";
import { recordEventActivity, type EventActivityChange } from "@/src/server/services/event-activity";

/** Authenticated actor context for event-settings audit entries. */
export type EventAuditActor = { id: string } | null | undefined;

const listSelect = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  status: true,
  venueName: true,
  city: true,
  state: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EventSelect;

export type ListEvent = Prisma.EventGetPayload<{ select: typeof listSelect }>;
export type EventVisibilityMode = "ORG_WIDE" | "EVENT_MEMBER_SCOPED";
export type EventVisibilityContext = {
  userId: string;
  role: UserRole;
  orgId: string | null;
};
export type EventVisibilityResolution = {
  mode: EventVisibilityMode;
  where: Prisma.EventWhereInput;
};

export type CreateEventInput = {
  name: string;
  startDate: Date;
  endDate?: Date | null;
  status: Event["status"];
  timezone?: string;
  venueName?: string | null;
  city?: string | null;
  state?: string | null;
};

export type UpdateEventInput = {
  name?: string;
  startDate?: Date;
  endDate?: Date | null;
  status?: Event["status"];
  timezone?: string;
  budgetApprovalsEnabled?: boolean;
  documentApprovalsEnabled?: boolean;
  venueName?: string | null;
  city?: string | null;
  state?: string | null;
  clientId?: string | null;
};

export type EventSettingsRecord = Prisma.EventGetPayload<{
  select: {
    id: true;
    orgId: true;
    name: true;
    startDate: true;
    endDate: true;
    timezone: true;
    budgetApprovalsEnabled: true;
    documentApprovalsEnabled: true;
    venueName: true;
    status: true;
    clientId: true;
    client: { select: { id: true; name: true } };
  };
}>;

export class EventUpdateValidationError extends Error {}

export function canListOrganizationEvents(role: UserRole): boolean {
  return role === UserRole.SUPER_ADMIN || role === UserRole.OWNER || role === UserRole.ADMIN;
}

export function resolveEventVisibility(input: EventVisibilityContext): EventVisibilityResolution {
  if (input.orgId && canListOrganizationEvents(input.role)) {
    return {
      mode: "ORG_WIDE",
      where: {
        orgId: input.orgId,
      },
    };
  }

  return {
    mode: "EVENT_MEMBER_SCOPED",
    where: {
      ...(input.orgId ? { orgId: input.orgId } : {}),
      eventMembers: {
        some: {
          userId: input.userId,
        },
      },
    },
  };
}

export function resolveActiveEventVisibilityWhere(
  input: EventVisibilityContext,
): EventVisibilityResolution {
  const visibility = resolveEventVisibility(input);
  return {
    mode: visibility.mode,
    where: {
      ...visibility.where,
      status: { not: "CANCELED" },
    },
  };
}

export async function listEventsForUser(input: EventVisibilityContext): Promise<ListEvent[]> {
  const visibility = resolveEventVisibility(input);

  return getPrisma().event.findMany({
    where: visibility.where,
    orderBy: { startDate: "desc" },
    select: listSelect,
  });
}

/**
 * Canonical event-creation behavior, runnable inside an existing transaction so
 * larger orchestrations (e.g. the Event Import Builder) can create the event and
 * its module records atomically. Creates the Event, the creator's EVENT_ADMIN
 * membership, the root timeline item, and the session-requirement template.
 */
export async function createEventWithinTransaction(
  tx: Prisma.TransactionClient,
  input: CreateEventInput,
  context: { orgId: string; createdByUserId: string },
): Promise<Event> {
  const event = await tx.event.create({
    data: {
      orgId: context.orgId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      timezone: input.timezone ?? "America/New_York",
      venueName: input.venueName ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      status: input.status,
      createdByUserId: context.createdByUserId,
    },
  });

  await tx.eventMember.upsert({
    where: {
      eventId_userId: {
        eventId: event.id,
        userId: context.createdByUserId,
      },
    },
    update: {
      eventRole: EventMemberRole.EVENT_ADMIN,
    },
    create: {
      eventId: event.id,
      userId: context.createdByUserId,
      eventRole: EventMemberRole.EVENT_ADMIN,
    },
  });

  await tx.timelineItem.create({
    data: {
      eventId: event.id,
      title: "Event Timeline",
      department: "General",
      status: TimelineStatus.IN_PROGRESS,
      priority: TimelinePriority.MEDIUM,
      parentId: null,
      startDate: event.startDate,
      endDate: event.endDate ?? event.startDate,
      sortOrder: 0,
    },
  });

  await ensureEventSessionRequirementTemplateTx(tx, event.id);

  // Canonical audit entry for event creation, atomic with the event + membership.
  await recordEventActivity(tx, {
    eventId: event.id,
    actor: { kind: "USER", userId: context.createdByUserId },
    module: "EVENT_SETTINGS",
    action: "CREATED",
    entityType: "Event",
    entityId: event.id,
    entityLabel: event.name,
    message: `Created event "${event.name}"`,
  });

  return event;
}

export async function createEvent(
  input: CreateEventInput,
  context: { orgId: string; createdByUserId: string },
): Promise<Event> {
  return getPrisma().$transaction((tx) => createEventWithinTransaction(tx, input, context));
}

export async function getEventById(id: string): Promise<Event | null> {
  return getPrisma().event.findUnique({ where: { id } });
}

export async function getEventSettingsById(id: string): Promise<EventSettingsRecord | null> {
  return getPrisma().event.findUnique({
    where: { id },
    select: {
      id: true,
      orgId: true,
      name: true,
      startDate: true,
      endDate: true,
      timezone: true,
      budgetApprovalsEnabled: true,
      documentApprovalsEnabled: true,
      venueName: true,
      status: true,
      clientId: true,
      client: { select: { id: true, name: true } },
    },
  });
}

export async function listClientsForEventOrganization(orgId: string): Promise<Array<{ id: string; name: string }>> {
  return getPrisma().client.findMany({
    where: { orgId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

const EVENT_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  status: "Status",
  startDate: "Start date",
  endDate: "End date",
  venueName: "Venue",
  city: "City",
  state: "State",
  timezone: "Time zone",
  budgetApprovalsEnabled: "Budget approvals",
  documentApprovalsEnabled: "Document approvals",
  clientId: "Client",
};

function eventFieldValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (field === "startDate" || field === "endDate") {
    const d = value as Date;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(value);
  }
  return String(value);
}

export async function updateEvent(id: string, data: UpdateEventInput, actor?: EventAuditActor): Promise<Event> {
  const before = await getPrisma().event.findUnique({
    where: { id },
    select: { orgId: true, name: true, status: true, startDate: true, endDate: true, venueName: true, city: true, state: true, timezone: true, clientId: true, budgetApprovalsEnabled: true, documentApprovalsEnabled: true },
  });

  if (!before) throw new EventUpdateValidationError("Event not found");

  const nextStartDate = data.startDate ?? before.startDate;
  const nextEndDate = typeof data.endDate === "undefined" ? before.endDate : data.endDate;
  if (nextEndDate && nextStartDate.getTime() > nextEndDate.getTime()) {
    throw new EventUpdateValidationError("Start date cannot be after end date");
  }

  if (typeof data.name !== "undefined" && !data.name.trim()) {
    throw new EventUpdateValidationError("Event name is required");
  }

  if (data.clientId) {
    const client = await getPrisma().client.findFirst({
      where: { id: data.clientId, orgId: before.orgId },
      select: { id: true },
    });
    if (!client) throw new EventUpdateValidationError("Client must belong to this event's organization");
  }

  const changes: EventActivityChange[] = [];
  if (before) {
    for (const field of Object.keys(EVENT_FIELD_LABELS)) {
      const key = field as keyof UpdateEventInput;
      if (typeof data[key] === "undefined") continue;
      const from = eventFieldValue(field, (before as Record<string, unknown>)[field]);
      const to = eventFieldValue(field, data[key]);
      if (from === to) continue;
      changes.push({ field, label: EVENT_FIELD_LABELS[field], from, to });
    }
  }

  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.event.update({ where: { id }, data });

    if (changes.length > 0) {
      const statusOnly = changes.every((c) => c.field === "status");
      await recordEventActivity(tx, {
        eventId: id,
        actor: actor?.id ? { kind: "USER", userId: actor.id } : { kind: "SYSTEM", label: "System" },
        module: "EVENT_SETTINGS",
        action: statusOnly ? "STATUS_CHANGED" : "UPDATED",
        entityType: "Event",
        entityId: id,
        entityLabel: updated.name,
        message: statusOnly ? `Changed event status to ${updated.status}` : `Updated event "${updated.name}" settings`,
        changes,
      });
    }

    return updated;
  });
}

export async function deleteEvent(id: string): Promise<Event> {
  return getPrisma().$transaction(async (tx) => {
    const budget = await tx.budget.findUnique({
      where: { eventId: id },
      select: { id: true },
    });

    if (budget) {
      await tx.budgetSubmissionLineItem.deleteMany({
        where: {
          submission: {
            budgetId: budget.id,
          },
        },
      });
      await tx.budgetSubmissionRecipient.deleteMany({
        where: {
          submission: {
            budgetId: budget.id,
          },
        },
      });
      await tx.budgetSubmission.deleteMany({
        where: { budgetId: budget.id },
      });
      await tx.budgetApproval.deleteMany({
        where: {
          budgetVersion: {
            budgetId: budget.id,
          },
        },
      });
      await tx.budgetItem.deleteMany({
        where: {
          budgetVersion: {
            budgetId: budget.id,
          },
        },
      });
      await tx.budgetActivity.deleteMany({
        where: { budgetId: budget.id },
      });
      await tx.budgetLineItem.deleteMany({
        where: { budgetId: budget.id },
      });
      await tx.budget.update({
        where: { id: budget.id },
        data: { currentVersionId: null },
      });
      await tx.budgetVersion.deleteMany({
        where: { budgetId: budget.id },
      });
      await tx.budget.delete({
        where: { id: budget.id },
      });
    }

    await tx.documentApprovalRecipient.deleteMany({
      where: {
        approval: {
          document: {
            eventId: id,
          },
        },
      },
    });
    await tx.documentApproval.deleteMany({
      where: {
        document: {
          eventId: id,
        },
      },
    });
    await tx.documentVersion.deleteMany({
      where: {
        document: {
          eventId: id,
        },
      },
    });
    await tx.documentTagOnDocument.deleteMany({
      where: {
        document: {
          eventId: id,
        },
      },
    });
    await tx.documentLink.deleteMany({
      where: {
        document: {
          eventId: id,
        },
      },
    });
    await tx.document.deleteMany({
      where: { eventId: id },
    });
    await tx.documentCategory.deleteMany({
      where: { eventId: id },
    });

    await tx.seatingAssignment.deleteMany({
      where: { eventId: id },
    });
    await tx.seatingTable.deleteMany({
      where: { eventId: id },
    });
    await tx.seatingAttendee.deleteMany({
      where: { eventId: id },
    });

    await tx.matrixRow.deleteMany({
      where: { eventId: id },
    });
    await tx.room.deleteMany({
      where: { eventId: id },
    });

    await tx.eventActivity.deleteMany({
      where: { eventId: id },
    });
    await tx.eventIntegrationMetric.deleteMany({
      where: { eventId: id },
    });
    await tx.deadline.deleteMany({
      where: { eventId: id },
    });
    await tx.eventMember.deleteMany({
      where: { eventId: id },
    });

    await tx.timelineDependency.deleteMany({
      where: { eventId: id },
    });
    await tx.timelineItem.deleteMany({
      where: { eventId: id },
    });

    return tx.event.delete({
      where: { id },
    });
  });
}
