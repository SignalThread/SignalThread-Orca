import { EventMemberRole, UserRole } from "@prisma/client";
import { canListOrganizationEvents } from "@/lib/events";
import { getPrisma } from "@/lib/prisma";

export type EventAccessType = "read" | "write";

export type EventAccessUser = Readonly<{
  id: string;
  orgId: string | null;
  role: UserRole;
}>;

export type EventAccessDecision = Readonly<{
  userId: string;
  orgId: string | null;
  appRole: UserRole;
  eventId: string | null;
  eventOrgId: string | null;
  eventRole: EventMemberRole | null;
  canView: boolean;
  canEdit: boolean;
  reason: string | null;
}>;

export class EventAccessError extends Error {
  status: number;
  reason: string;
  decision: EventAccessDecision;

  constructor(message: string, status: number, reason: string, decision: EventAccessDecision) {
    super(message);
    this.status = status;
    this.reason = reason;
    this.decision = decision;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deniedDecision(
  eventId: string | null,
  user: EventAccessUser,
  reason: string,
  eventOrgId: string | null = null,
  eventRole: EventMemberRole | null = null,
): EventAccessDecision {
  return {
    userId: user.id,
    orgId: user.orgId,
    appRole: user.role,
    eventId,
    eventOrgId,
    eventRole,
    canView: false,
    canEdit: false,
    reason,
  };
}

function allowedDecision(
  eventId: string,
  eventOrgId: string,
  user: EventAccessUser,
  eventRole: EventMemberRole | null,
  canEdit: boolean,
): EventAccessDecision {
  return {
    userId: user.id,
    orgId: user.orgId,
    appRole: user.role,
    eventId,
    eventOrgId,
    eventRole,
    canView: true,
    canEdit,
    reason: null,
  };
}

export async function resolveEventAccessForUser(
  eventId: string,
  user: EventAccessUser,
): Promise<EventAccessDecision> {
  if (!UUID_REGEX.test(eventId)) {
    return deniedDecision(null, user, "INVALID_EVENT_ID");
  }

  const event = await getPrisma().event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      orgId: true,
      eventMembers: {
        where: { userId: user.id },
        select: { eventRole: true },
        take: 1,
      },
    },
  });

  if (!event) {
    return deniedDecision(eventId, user, "EVENT_NOT_FOUND");
  }

  const eventRole = event.eventMembers[0]?.eventRole ?? null;

  if (!user.orgId || user.orgId !== event.orgId) {
    return deniedDecision(event.id, user, "EVENT_OUTSIDE_ACTIVE_ORG", event.orgId, eventRole);
  }

  if (canListOrganizationEvents(user.role)) {
    return allowedDecision(event.id, event.orgId, user, eventRole, true);
  }

  if (!eventRole) {
    return deniedDecision(event.id, user, "EVENT_MEMBERSHIP_REQUIRED", event.orgId, null);
  }

  return allowedDecision(
    event.id,
    event.orgId,
    user,
    eventRole,
    eventRole !== EventMemberRole.EVENT_VIEWER,
  );
}

export async function assertEventAccessForUser(
  eventId: string,
  user: EventAccessUser,
  accessType: EventAccessType,
): Promise<EventAccessDecision> {
  const decision = await resolveEventAccessForUser(eventId, user);

  if (decision.reason === "INVALID_EVENT_ID") {
    throw new EventAccessError("eventId must be a valid UUID", 400, decision.reason, decision);
  }
  if (decision.reason === "EVENT_NOT_FOUND") {
    throw new EventAccessError("Event not found", 404, decision.reason, decision);
  }
  if (decision.reason === "EVENT_OUTSIDE_ACTIVE_ORG") {
    throw new EventAccessError("Event is outside the active organization scope", 403, decision.reason, decision);
  }
  if (decision.reason === "EVENT_MEMBERSHIP_REQUIRED") {
    throw new EventAccessError("Event membership required", 403, decision.reason, decision);
  }
  if (!decision.canView) {
    throw new EventAccessError("Event access denied", 403, decision.reason ?? "EVENT_ACCESS_DENIED", decision);
  }
  if (accessType === "write" && !decision.canEdit) {
    throw new EventAccessError("Event editor role required", 403, "EVENT_EDITOR_ROLE_REQUIRED", decision);
  }

  return decision;
}
