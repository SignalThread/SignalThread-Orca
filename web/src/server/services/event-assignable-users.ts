import type { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";

export type EventAssignableUser = {
  id: string;
  name: string | null;
  email: string;
  role?: string;
};

function displayName(user: EventAssignableUser): string {
  return user.name?.trim() || user.email;
}

/** Canonical owner eligibility: an explicit EventMember grant for this event. */
export function eventOwnerEligibilityWhere(eventId: string, userId?: string): Prisma.UserWhereInput {
  return {
    ...(userId ? { id: userId } : {}),
    eventMemberships: { some: { eventId } },
  };
}

export async function listEventAssignableUsers(eventId: string): Promise<EventAssignableUser[]> {
  // EventMember is the canonical persisted event-access grant used by Platform
  // Admin's Manage event access flow. A direct User.orgId or Membership grants
  // account affiliation, not eligibility to own work inside this event.
  const users = await getPrisma().user.findMany({
    where: eventOwnerEligibilityWhere(eventId),
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      eventMemberships: {
        where: { eventId },
        select: { eventRole: true },
        take: 1,
      },
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return users
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.eventMemberships[0]?.eventRole ?? user.role,
    }))
    .sort((left, right) => displayName(left).localeCompare(displayName(right)));
}

export async function isEventAssignableUser(eventId: string, userId: string): Promise<boolean> {
  const user = await getPrisma().user.findFirst({
    where: eventOwnerEligibilityWhere(eventId, userId),
    select: { id: true },
  });

  return Boolean(user);
}
