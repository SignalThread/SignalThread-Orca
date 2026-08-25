/**
 * Event Directory backfill / module bridges.
 *
 * Represents existing Speaker / SeatingAttendee / EventPerson records as
 * EventDirectoryPerson records and links them via EventDirectoryModuleLink —
 * WITHOUT mutating or breaking the source modules. Every step is idempotent:
 * only an existing module link reuses a person. Similar email/name records are
 * kept distinct and marked NEEDS_REVIEW rather than silently merged.
 */
import {
  type EventDirectorySourceType,
  type EventDirectoryModuleType,
  type EventDirectoryPersonStatus,
  type EventDirectoryRoleType,
  type EventPersonRole,
} from "@prisma/client";
import { assertEventAccessForUser, type EventAccessUser } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import {
  createOrReuseEventDirectorySource,
  deriveDirectoryDisplayName,
  normalizeDirectoryEmail,
} from "./event-directory";

export type BackfillCounts = {
  scanned: number;
  created: number;
  matched: number;
  rolesAdded: number;
  linksCreated: number;
  needsReview: number;
  skipped: number;
  issues: Array<{ module: EventDirectoryModuleType; moduleRecordId: string; reason: string }>;
};

function emptyCounts(): BackfillCounts {
  return {
    scanned: 0,
    created: 0,
    matched: 0,
    rolesAdded: 0,
    linksCreated: 0,
    needsReview: 0,
    skipped: 0,
    issues: [],
  };
}

type Identity = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
  title?: string | null;
  phone?: string | null;
};

function splitName(name: string | null): { firstName: string | null; lastName: string | null } {
  const parts = (name ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Idempotently ensure a directory person + role + module link for one source
 * module record. An exact module link is the only automatic identity match.
 * Email/name similarities are reported for review but never merged implicitly.
 */
async function backfillModuleRecord(args: {
  eventId: string;
  orgId: string;
  clientId: string | null;
  module: EventDirectoryModuleType;
  role: EventDirectoryRoleType;
  sourceId: string;
  moduleRecordId: string;
  identity: Identity;
  counts: BackfillCounts;
}): Promise<void> {
  const prisma = getPrisma();
  const { counts } = args;
  counts.scanned += 1;

  const normalizedEmail = normalizeDirectoryEmail(args.identity.email);
  const displayName = deriveDirectoryDisplayName({
    firstName: args.identity.firstName,
    lastName: args.identity.lastName,
    email: args.identity.email,
  });

  if (displayName === "Unnamed contact") {
    counts.skipped += 1;
    counts.issues.push({
      module: args.module,
      moduleRecordId: args.moduleRecordId,
      reason: "Source record has no usable name or email.",
    });
    return;
  }

  // 1) Already linked? Reuse that person (fully idempotent).
  const existingLink = await prisma.eventDirectoryModuleLink.findUnique({
    where: {
      eventId_module_moduleRecordId: {
        eventId: args.eventId,
        module: args.module,
        moduleRecordId: args.moduleRecordId,
      },
    },
    select: { personId: true },
  });

  if (existingLink) {
    counts.matched += 1;
    const roleResult = await prisma.eventDirectoryRole.createMany({
      data: [{ eventId: args.eventId, personId: existingLink.personId, role: args.role, sourceId: args.sourceId }],
      skipDuplicates: true,
    });
    counts.rolesAdded += roleResult.count;
    return;
  }

  const possibleDuplicate = await prisma.eventDirectoryPerson.findFirst({
    where: {
      eventId: args.eventId,
      status: { notIn: ["MERGED", "REMOVED"] },
      OR: [
        ...(normalizedEmail ? [{ normalizedEmail }] : []),
        {
          displayName: { equals: displayName, mode: "insensitive" },
          company: args.identity.company
            ? { equals: args.identity.company, mode: "insensitive" }
            : null,
        },
      ],
    },
    select: { id: true, normalizedEmail: true },
  });
  const status: EventDirectoryPersonStatus = possibleDuplicate ? "NEEDS_REVIEW" : "ACTIVE";
  if (possibleDuplicate) {
    counts.needsReview += 1;
    counts.issues.push({
      module: args.module,
      moduleRecordId: args.moduleRecordId,
      reason: possibleDuplicate.normalizedEmail === normalizedEmail && normalizedEmail
        ? "A directory person has the same normalized email; records were kept distinct for review."
        : "A directory person has the same name and company; records were kept distinct for review.",
    });
  }

  await prisma.$transaction(async (tx) => {
    // Recheck inside the transaction so concurrent reruns cannot create two
    // canonical people for the same module record.
    const concurrentLink = await tx.eventDirectoryModuleLink.findUnique({
      where: {
        eventId_module_moduleRecordId: {
          eventId: args.eventId,
          module: args.module,
          moduleRecordId: args.moduleRecordId,
        },
      },
      select: { id: true },
    });
    if (concurrentLink) {
      counts.matched += 1;
      return;
    }

    const created = await tx.eventDirectoryPerson.create({
      data: {
        orgId: args.orgId,
        clientId: args.clientId,
        eventId: args.eventId,
        firstName: args.identity.firstName,
        lastName: args.identity.lastName,
        displayName,
        email: args.identity.email,
        normalizedEmail,
        phone: args.identity.phone ?? null,
        company: args.identity.company,
        title: args.identity.title ?? null,
        status,
        roles: { create: { eventId: args.eventId, role: args.role, sourceId: args.sourceId } },
        moduleLinks: { create: { eventId: args.eventId, module: args.module, moduleRecordId: args.moduleRecordId } },
      },
      select: { id: true },
    });
    if (created.id) {
      counts.created += 1;
      counts.rolesAdded += 1;
      counts.linksCreated += 1;
    }
  });
}

async function resolveEventScope(eventId: string): Promise<{ orgId: string; clientId: string | null }> {
  const event = await getPrisma().event.findUnique({ where: { id: eventId }, select: { orgId: true, clientId: true } });
  if (!event) throw new Error(`Event ${eventId} not found`);
  return event;
}

export async function backfillDirectoryFromSpeakers(eventId: string): Promise<BackfillCounts> {
  const counts = emptyCounts();
  const scope = await resolveEventScope(eventId);
  const sourceId = await backfillSourceFor(eventId, "SPEAKER_MODULE", "Speakers module");
  const speakers = await getPrisma().speaker.findMany({
    where: { eventId },
    select: { id: true, name: true, email: true, company: true, title: true, phone: true },
  });
  for (const speaker of speakers) {
    const { firstName, lastName } = splitName(speaker.name);
    await backfillModuleRecord({
      eventId,
      orgId: scope.orgId,
      clientId: scope.clientId,
      module: "SPEAKER",
      role: "SPEAKER",
      sourceId,
      moduleRecordId: speaker.id,
      identity: { firstName, lastName, email: speaker.email, company: speaker.company, title: speaker.title, phone: speaker.phone },
      counts,
    });
  }
  return counts;
}

export async function backfillDirectoryFromSeatingAttendees(eventId: string): Promise<BackfillCounts> {
  const counts = emptyCounts();
  const scope = await resolveEventScope(eventId);
  const sourceId = await backfillSourceFor(eventId, "SEATING_MODULE", "Seating module");
  const attendees = await getPrisma().seatingAttendee.findMany({
    where: { eventId },
    select: { id: true, firstName: true, lastName: true, email: true, company: true },
  });
  for (const attendee of attendees) {
    await backfillModuleRecord({
      eventId,
      orgId: scope.orgId,
      clientId: scope.clientId,
      module: "SEATING_ATTENDEE",
      role: "SEATING_GUEST",
      sourceId,
      moduleRecordId: attendee.id,
      identity: { firstName: attendee.firstName, lastName: attendee.lastName, email: attendee.email, company: attendee.company },
      counts,
    });
  }
  return counts;
}

export async function backfillDirectoryFromEventPeople(eventId: string): Promise<BackfillCounts> {
  const counts = emptyCounts();
  const scope = await resolveEventScope(eventId);
  const sourceId = await backfillSourceFor(eventId, "STAFFING_MODULE", "Staffing module");
  const people = await getPrisma().eventPerson.findMany({
    where: { eventId },
    select: { id: true, name: true, role: true, email: true, company: true },
  });
  for (const person of people) {
    const { firstName, lastName } = splitName(person.name);
    await backfillModuleRecord({
      eventId,
      orgId: scope.orgId,
      clientId: scope.clientId,
      module: "EVENT_PERSON",
      role: directoryRoleForEventPerson(person.role),
      sourceId,
      moduleRecordId: person.id,
      identity: { firstName, lastName, email: person.email, company: person.company },
      counts,
    });
  }
  return counts;
}

export function directoryRoleForEventPerson(role: EventPersonRole): EventDirectoryRoleType {
  return role as EventDirectoryRoleType;
}

async function backfillSourceFor(
  eventId: string,
  type: EventDirectorySourceType,
  label: string,
): Promise<string> {
  return createOrReuseEventDirectorySource({ eventId, type, label });
}

function addCounts(a: BackfillCounts, b: BackfillCounts): BackfillCounts {
  return {
    scanned: a.scanned + b.scanned,
    created: a.created + b.created,
    matched: a.matched + b.matched,
    rolesAdded: a.rolesAdded + b.rolesAdded,
    linksCreated: a.linksCreated + b.linksCreated,
    needsReview: a.needsReview + b.needsReview,
    skipped: a.skipped + b.skipped,
    issues: [...a.issues, ...b.issues],
  };
}

export async function backfillEventDirectoryForEvent(eventId: string): Promise<{
  speakers: BackfillCounts;
  seating: BackfillCounts;
  staff: BackfillCounts;
  total: BackfillCounts;
}> {
  const speakers = await backfillDirectoryFromSpeakers(eventId);
  const seating = await backfillDirectoryFromSeatingAttendees(eventId);
  const staff = await backfillDirectoryFromEventPeople(eventId);
  return { speakers, seating, staff, total: addCounts(addCounts(speakers, seating), staff) };
}

/** Explicit, write-authorized entry point for the event Directory UI/API. */
export async function aggregateEventDirectoryForEvent(args: {
  eventId: string;
  user: EventAccessUser;
}) {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  return backfillEventDirectoryForEvent(args.eventId);
}
