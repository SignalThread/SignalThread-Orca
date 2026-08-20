/**
 * Event Attendee — canonical service layer.
 *
 * Attendee is the event PARTICIPATION layer over Event Directory:
 *   EventDirectoryPerson = who the person is (canonical identity).
 *   EventAttendee        = how this person participates in this event.
 *   EventRegistrationRecord = registration/badge/order/provider state (when real).
 *
 * This service never creates a parallel person identity — it links to / creates
 * Directory people via the Directory dedupe rules, ensures the ATTENDEE role, and
 * keeps participation, registration, role, and source as distinct layers. Event
 * access is enforced here; routes stay thin. Provider is a free string — no
 * provider-specific assumptions live in the core.
 */
import {
  Prisma,
  type EventAttendee,
  type EventAttendeeAttendanceStatus,
  type EventAttendeeRegistrationStatus,
  type EventAttendeeSource,
  type EventAttendeeSyncStatus,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { assertEventAccessForUser, type EventAccessUser } from "@/lib/event-access";
import { normalizeDirectoryEmail } from "@/lib/event-directory-import";
import {
  addEventDirectoryRole,
  createOrReuseEventDirectorySource,
  deriveDirectoryDisplayName,
  detectDirectoryDuplicate,
} from "@/src/server/services/event-directory";
// Type-only import (erased at compile) — no runtime cycle with the import lib.
import type { AttendeeRowParseResult } from "@/lib/event-attendee-import";

// ---------------------------------------------------------------------------
// Errors + types
// ---------------------------------------------------------------------------

export type AttendeeErrorCode =
  | "ATTENDEE_NOT_FOUND"
  | "ATTENDEE_EVENT_MISMATCH"
  | "ATTENDEE_VALIDATION"
  | "ATTENDEE_PERSON_NOT_FOUND";

export class AttendeeServiceError extends Error {
  status: number;
  code: AttendeeErrorCode;
  constructor(code: AttendeeErrorCode, message: string, status = 400) {
    super(message);
    this.name = "AttendeeServiceError";
    this.code = code;
    this.status = status;
  }
}

export type AttendeeUser = EventAccessUser;

export type AttendeeProfileInput = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
};

export type AttendeeParticipationInput = {
  attendanceStatus?: string | null;
  registrationStatus?: string | null;
  registrationType?: string | null;
  badgeType?: string | null;
  ticketType?: string | null;
  source?: string | null;
  notes?: string | null;
};

export type AttendeeRegistrationInput = {
  provider?: string | null;
  externalRegistrationId?: string | null;
  externalPersonId?: string | null;
  externalOrderId?: string | null;
  registrationStatus?: string | null;
  registrationType?: string | null;
  ticketType?: string | null;
  badgeType?: string | null;
  paymentStatus?: string | null;
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

const ATTENDANCE_STATUSES: ReadonlySet<string> = new Set<EventAttendeeAttendanceStatus>([
  "EXPECTED",
  "CONFIRMED",
  "ATTENDED",
  "CANCELLED",
  "NO_SHOW",
]);
const REGISTRATION_STATUSES: ReadonlySet<string> = new Set<EventAttendeeRegistrationStatus>([
  "NOT_REGISTERED",
  "INVITED",
  "REGISTERED",
  "PENDING_APPROVAL",
  "WAITLISTED",
  "CANCELLED",
  "TRANSFERRED",
  "CHECKED_IN",
  "NO_SHOW",
]);
const ATTENDEE_SOURCES: ReadonlySet<string> = new Set<EventAttendeeSource>([
  "MANUAL",
  "CSV_IMPORT",
  "REGISTRATION_INTEGRATION",
  "MARKETING_CAMPAIGN",
  "SPEAKER_INTAKE",
  "EXHIBITOR_PORTAL",
  "SPONSOR_UPLOAD",
  "BACKFILLED",
  "PORTAL_SELF_UPDATE",
]);

export function coerceAttendanceStatus(value: unknown): EventAttendeeAttendanceStatus | null {
  return typeof value === "string" && ATTENDANCE_STATUSES.has(value) ? (value as EventAttendeeAttendanceStatus) : null;
}
export function coerceRegistrationStatus(value: unknown): EventAttendeeRegistrationStatus | null {
  return typeof value === "string" && REGISTRATION_STATUSES.has(value) ? (value as EventAttendeeRegistrationStatus) : null;
}
export function coerceAttendeeSource(value: unknown): EventAttendeeSource | null {
  return typeof value === "string" && ATTENDEE_SOURCES.has(value) ? (value as EventAttendeeSource) : null;
}

/** True when a registration input carries real provider/registration data worth
 *  persisting as an EventRegistrationRecord. Manual attendees with no such data
 *  stay registration-record-free. */
export function hasRegistrationData(reg: AttendeeRegistrationInput | null | undefined): boolean {
  if (!reg) return false;
  const provider = reg.provider?.trim().toLowerCase();
  return Boolean(
    (provider && provider !== "manual") ||
      reg.externalRegistrationId?.trim() ||
      reg.externalPersonId?.trim() ||
      reg.externalOrderId?.trim() ||
      reg.registrationType?.trim() ||
      reg.ticketType?.trim() ||
      reg.badgeType?.trim(),
  );
}

/** A sync status from a provider source signals a registration was imported, not
 *  local-only. Manual/CSV-without-provider stay LOCAL_ONLY. */
export function syncStatusForSource(source: EventAttendeeSource, hasProvider: boolean): EventAttendeeSyncStatus {
  if (source === "REGISTRATION_INTEGRATION" || hasProvider) return "SYNCED";
  return "LOCAL_ONLY";
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

// ---------------------------------------------------------------------------
// Directory person resolution (link, never duplicate)
// ---------------------------------------------------------------------------

/**
 * Resolve the Directory person for an attendee: link by explicit id, then by
 * normalized email within the event, otherwise create a new Directory person.
 * Never duplicates an existing person (speaker/staff/etc. are reused). Always
 * ensures the ATTENDEE role.
 */
async function resolveDirectoryPersonForAttendee(args: {
  eventId: string;
  user: AttendeeUser;
  directoryPersonId?: string | null;
  profile?: AttendeeProfileInput;
  sourceId: string | null;
}): Promise<{ personId: string; createdPerson: boolean }> {
  const prisma = getPrisma();

  if (args.directoryPersonId) {
    const person = await prisma.eventDirectoryPerson.findUnique({
      where: { id: args.directoryPersonId },
      select: { id: true, eventId: true },
    });
    if (!person) throw new AttendeeServiceError("ATTENDEE_PERSON_NOT_FOUND", "Directory person not found", 404);
    if (person.eventId !== args.eventId) {
      throw new AttendeeServiceError("ATTENDEE_EVENT_MISMATCH", "Directory person belongs to a different event", 400);
    }
    await ensureAttendeeRole(args.eventId, person.id, args.user, args.sourceId);
    return { personId: person.id, createdPerson: false };
  }

  const profile = args.profile ?? {};
  const normalizedEmail = normalizeDirectoryEmail(profile.email);

  // Link to an existing person by normalized email (no duplicate).
  if (normalizedEmail) {
    const existing = await prisma.eventDirectoryPerson.findFirst({
      where: { eventId: args.eventId, normalizedEmail, status: { notIn: ["MERGED"] } },
      select: { id: true },
    });
    if (existing) {
      await ensureAttendeeRole(args.eventId, existing.id, args.user, args.sourceId);
      return { personId: existing.id, createdPerson: false };
    }
  }

  // Create a new Directory person.
  if (!normalizedEmail && !profile.firstName?.trim() && !profile.lastName?.trim() && !profile.displayName?.trim()) {
    throw new AttendeeServiceError("ATTENDEE_VALIDATION", "An attendee needs at least an email or a name", 400);
  }
  const event = await prisma.event.findUnique({ where: { id: args.eventId }, select: { orgId: true, clientId: true } });
  if (!event) throw new AttendeeServiceError("ATTENDEE_VALIDATION", "Event not found", 404);

  const created = await prisma.eventDirectoryPerson.create({
    data: {
      orgId: event.orgId,
      clientId: event.clientId,
      eventId: args.eventId,
      firstName: trimOrNull(profile.firstName),
      lastName: trimOrNull(profile.lastName),
      displayName: deriveDirectoryDisplayName(profile),
      email: trimOrNull(profile.email),
      normalizedEmail,
      phone: trimOrNull(profile.phone),
      company: trimOrNull(profile.company),
      title: trimOrNull(profile.title),
      createdByUserId: args.user.id,
      updatedByUserId: args.user.id,
    },
    select: { id: true },
  });
  await ensureAttendeeRole(args.eventId, created.id, args.user, args.sourceId);
  return { personId: created.id, createdPerson: true };
}

async function ensureAttendeeRole(eventId: string, personId: string, user: AttendeeUser, sourceId: string | null): Promise<void> {
  await addEventDirectoryRole({ eventId, personId, role: "ATTENDEE", sourceId, user });
}

// ---------------------------------------------------------------------------
// Create / upsert participation
// ---------------------------------------------------------------------------

export type CreateAttendeeInput = {
  directoryPersonId?: string | null;
  profile?: AttendeeProfileInput;
  participation?: AttendeeParticipationInput;
  registration?: AttendeeRegistrationInput;
  sourceLabel?: string | null;
};

export async function createEventAttendee(args: {
  eventId: string;
  user: AttendeeUser;
  input: CreateAttendeeInput;
  importedByUserId?: string | null;
}): Promise<{ attendee: EventAttendee; personId: string; createdPerson: boolean; createdAttendee: boolean }> {
  await assertEventAccessForUser(args.eventId, args.user, "write");

  const participation = args.input.participation ?? {};
  const source = coerceAttendeeSource(participation.source) ?? "MANUAL";
  const sourceType = source === "CSV_IMPORT" ? "CSV_IMPORT" : "MANUAL";
  const sourceId = await createOrReuseEventDirectorySource({
    eventId: args.eventId,
    type: sourceType,
    label: trimOrNull(args.input.sourceLabel) ?? (sourceType === "CSV_IMPORT" ? "Attendee CSV import" : "Manually added attendee"),
    createdByUserId: args.user.id,
  });

  const { personId, createdPerson } = await resolveDirectoryPersonForAttendee({
    eventId: args.eventId,
    user: args.user,
    directoryPersonId: args.input.directoryPersonId,
    profile: args.input.profile,
    sourceId,
  });

  const reg = args.input.registration ?? null;
  const hasReg = hasRegistrationData(reg);
  const registrationStatus =
    coerceRegistrationStatus(participation.registrationStatus) ??
    coerceRegistrationStatus(reg?.registrationStatus) ??
    (hasReg ? "REGISTERED" : "NOT_REGISTERED");
  const attendanceStatus = coerceAttendanceStatus(participation.attendanceStatus) ?? "EXPECTED";
  const syncStatus = syncStatusForSource(source, Boolean(reg?.provider && reg.provider.trim().toLowerCase() !== "manual"));

  const existing = await getPrisma().eventAttendee.findUnique({
    where: { directoryPersonId: personId },
    select: { id: true },
  });

  const baseData = {
    attendanceStatus,
    registrationStatus,
    registrationType: trimOrNull(participation.registrationType) ?? trimOrNull(reg?.registrationType),
    badgeType: trimOrNull(participation.badgeType) ?? trimOrNull(reg?.badgeType),
    ticketType: trimOrNull(participation.ticketType) ?? trimOrNull(reg?.ticketType),
    notes: trimOrNull(participation.notes),
    source,
    syncStatus,
    registeredAt: hasReg && registrationStatus === "REGISTERED" ? new Date() : undefined,
    lastSyncedAt: hasReg ? new Date() : undefined,
  };

  let attendee: EventAttendee;
  let createdAttendee = false;
  if (existing) {
    attendee = await getPrisma().eventAttendee.update({
      where: { id: existing.id },
      data: { ...baseData, syncedByUserId: args.user.id },
    });
  } else {
    attendee = await getPrisma().eventAttendee.create({
      data: {
        eventId: args.eventId,
        directoryPersonId: personId,
        ...baseData,
        createdByUserId: args.user.id,
        importedByUserId: args.importedByUserId ?? null,
      },
    });
    createdAttendee = true;
  }

  if (hasReg && reg) {
    await upsertRegistrationRecord({ eventId: args.eventId, attendeeId: attendee.id, directoryPersonId: personId, input: reg });
  }

  return { attendee, personId, createdPerson, createdAttendee };
}

/** Create or update the canonical registration record for an attendee. */
export async function upsertRegistrationRecord(args: {
  eventId: string;
  attendeeId: string;
  directoryPersonId: string;
  input: AttendeeRegistrationInput;
}): Promise<string> {
  const reg = args.input;
  const provider = trimOrNull(reg.provider)?.toLowerCase() ?? "manual";
  const registrationStatus = coerceRegistrationStatus(reg.registrationStatus) ?? "REGISTERED";
  const isExternal = provider !== "manual";
  const data = {
    provider,
    externalRegistrationId: trimOrNull(reg.externalRegistrationId),
    externalPersonId: trimOrNull(reg.externalPersonId),
    externalOrderId: trimOrNull(reg.externalOrderId),
    registrationStatus,
    registrationType: trimOrNull(reg.registrationType),
    ticketType: trimOrNull(reg.ticketType),
    badgeType: trimOrNull(reg.badgeType),
    paymentStatus: trimOrNull(reg.paymentStatus),
    syncStatus: (isExternal ? "SYNCED" : "LOCAL_ONLY") as EventAttendeeSyncStatus,
    lastSyncedAt: isExternal ? new Date() : null,
  };

  const existing = await getPrisma().eventRegistrationRecord.findFirst({
    where: { attendeeId: args.attendeeId },
    select: { id: true },
  });
  if (existing) {
    await getPrisma().eventRegistrationRecord.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const created = await getPrisma().eventRegistrationRecord.create({
    data: {
      eventId: args.eventId,
      attendeeId: args.attendeeId,
      directoryPersonId: args.directoryPersonId,
      ...data,
      registeredAt: registrationStatus === "REGISTERED" ? new Date() : null,
    },
    select: { id: true },
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// List / detail
// ---------------------------------------------------------------------------

export type AttendeeListFilters = {
  search?: string | null;
  registrationStatus?: EventAttendeeRegistrationStatus | null;
  attendanceStatus?: EventAttendeeAttendanceStatus | null;
  source?: EventAttendeeSource | null;
  role?: string | null;
  registrationType?: string | null;
  needsReview?: boolean;
  limit?: number;
  cursor?: string | null;
};

/** Pure Prisma where-builder for the attendee list (testable). */
export function buildAttendeeListWhere(eventId: string, filters: AttendeeListFilters): Prisma.EventAttendeeWhereInput {
  const where: Prisma.EventAttendeeWhereInput = { eventId };
  if (filters.registrationStatus) where.registrationStatus = filters.registrationStatus;
  if (filters.attendanceStatus) where.attendanceStatus = filters.attendanceStatus;
  if (filters.source) where.source = filters.source;
  if (filters.registrationType) where.registrationType = { equals: filters.registrationType, mode: "insensitive" };

  const personFilters: Prisma.EventDirectoryPersonWhereInput = {};
  const search = trimOrNull(filters.search);
  if (search) {
    personFilters.OR = [
      { displayName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
    ];
  }
  if (filters.role) personFilters.roles = { some: { role: filters.role as Prisma.EnumEventDirectoryRoleTypeFilter } as Prisma.EventDirectoryRoleWhereInput };
  if (filters.needsReview) personFilters.status = { in: ["NEEDS_REVIEW", "DUPLICATE_REVIEW"] };
  if (Object.keys(personFilters).length > 0) where.person = personFilters;
  return where;
}

export type AttendeeListItem = {
  id: string;
  directoryPersonId: string;
  displayName: string;
  email: string | null;
  company: string | null;
  title: string | null;
  roles: string[];
  registrationStatus: EventAttendeeRegistrationStatus;
  attendanceStatus: EventAttendeeAttendanceStatus;
  registrationType: string | null;
  source: EventAttendeeSource;
  syncStatus: EventAttendeeSyncStatus;
  hasRegistrationRecord: boolean;
  moduleUsageCount: number;
  updatedAt: Date;
};

export async function listEventAttendees(args: {
  eventId: string;
  user: AttendeeUser;
  filters?: AttendeeListFilters;
}): Promise<{ attendees: AttendeeListItem[]; nextCursor: string | null }> {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  const filters = args.filters ?? {};
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const where = buildAttendeeListWhere(args.eventId, filters);

  const rows = await getPrisma().eventAttendee.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      directoryPersonId: true,
      registrationStatus: true,
      attendanceStatus: true,
      registrationType: true,
      source: true,
      syncStatus: true,
      updatedAt: true,
      person: {
        select: {
          displayName: true,
          email: true,
          company: true,
          title: true,
          roles: { select: { role: true } },
          _count: { select: { moduleLinks: true } },
        },
      },
      _count: { select: { registrationRecords: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const attendees: AttendeeListItem[] = page.map((row) => ({
    id: row.id,
    directoryPersonId: row.directoryPersonId,
    displayName: row.person.displayName,
    email: row.person.email,
    company: row.person.company,
    title: row.person.title,
    roles: [...new Set(row.person.roles.map((r) => r.role))],
    registrationStatus: row.registrationStatus,
    attendanceStatus: row.attendanceStatus,
    registrationType: row.registrationType,
    source: row.source,
    syncStatus: row.syncStatus,
    hasRegistrationRecord: row._count.registrationRecords > 0,
    moduleUsageCount: row.person._count.moduleLinks,
    updatedAt: row.updatedAt,
  }));
  return { attendees, nextCursor: hasMore ? page[page.length - 1].id : null };
}

export type AttendeeSummaryCounts = {
  total: number;
  registered: number;
  pendingWaitlisted: number;
  cancelled: number;
  vipPress: number;
  missingEmail: number;
  needsReview: number;
  syncConflicts: number;
};

export async function getEventAttendeeSummary(args: { eventId: string; user: AttendeeUser }): Promise<AttendeeSummaryCounts> {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  const prisma = getPrisma();
  const e = args.eventId;
  const [total, registered, pendingWaitlisted, cancelled, vipPress, missingEmail, needsReview, syncConflicts] = await Promise.all([
    prisma.eventAttendee.count({ where: { eventId: e } }),
    prisma.eventAttendee.count({ where: { eventId: e, registrationStatus: { in: ["REGISTERED", "CHECKED_IN"] } } }),
    prisma.eventAttendee.count({ where: { eventId: e, registrationStatus: { in: ["PENDING_APPROVAL", "WAITLISTED", "INVITED"] } } }),
    prisma.eventAttendee.count({ where: { eventId: e, registrationStatus: "CANCELLED" } }),
    prisma.eventAttendee.count({ where: { eventId: e, person: { roles: { some: { role: { in: ["VIP", "PRESS"] } } } } } }),
    prisma.eventAttendee.count({ where: { eventId: e, person: { OR: [{ email: null }, { email: "" }] } } }),
    prisma.eventAttendee.count({ where: { eventId: e, person: { status: { in: ["NEEDS_REVIEW", "DUPLICATE_REVIEW"] } } } }),
    prisma.eventAttendee.count({ where: { eventId: e, syncStatus: { in: ["CONFLICT", "WRITEBACK_FAILED", "STALE"] } } }),
  ]);
  return { total, registered, pendingWaitlisted, cancelled, vipPress, missingEmail, needsReview, syncConflicts };
}

export async function getEventAttendee(args: { eventId: string; attendeeId: string; user: AttendeeUser }) {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  const attendee = await getPrisma().eventAttendee.findUnique({
    where: { id: args.attendeeId },
    include: {
      person: { include: { roles: { include: { source: true } }, moduleLinks: true } },
      registrationRecords: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!attendee) throw new AttendeeServiceError("ATTENDEE_NOT_FOUND", "Attendee not found", 404);
  if (attendee.eventId !== args.eventId) {
    throw new AttendeeServiceError("ATTENDEE_EVENT_MISMATCH", "Attendee belongs to a different event", 404);
  }
  return attendee;
}

// ---------------------------------------------------------------------------
// Update / cancel / delete
// ---------------------------------------------------------------------------

export async function updateEventAttendee(args: {
  eventId: string;
  attendeeId: string;
  user: AttendeeUser;
  participation?: AttendeeParticipationInput;
  profile?: AttendeeProfileInput;
  registration?: AttendeeRegistrationInput;
}): Promise<EventAttendee> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const existing = await getPrisma().eventAttendee.findUnique({
    where: { id: args.attendeeId },
    select: { id: true, eventId: true, directoryPersonId: true },
  });
  if (!existing) throw new AttendeeServiceError("ATTENDEE_NOT_FOUND", "Attendee not found", 404);
  if (existing.eventId !== args.eventId) {
    throw new AttendeeServiceError("ATTENDEE_EVENT_MISMATCH", "Attendee belongs to a different event", 404);
  }

  // Profile edits flow to the canonical Directory person (never the attendee row).
  if (args.profile) {
    const p = args.profile;
    const data: Prisma.EventDirectoryPersonUpdateInput = { updatedByUserId: args.user.id };
    if ("firstName" in p) data.firstName = trimOrNull(p.firstName);
    if ("lastName" in p) data.lastName = trimOrNull(p.lastName);
    if ("phone" in p) data.phone = trimOrNull(p.phone);
    if ("company" in p) data.company = trimOrNull(p.company);
    if ("title" in p) data.title = trimOrNull(p.title);
    if ("email" in p) {
      data.email = trimOrNull(p.email);
      data.normalizedEmail = normalizeDirectoryEmail(p.email);
    }
    await getPrisma().eventDirectoryPerson.update({ where: { id: existing.directoryPersonId }, data });
  }

  // Participation edits flow to the attendee row only.
  const part = args.participation ?? {};
  const data: Prisma.EventAttendeeUpdateInput = { syncedByUserId: args.user.id };
  const regStatus = coerceRegistrationStatus(part.registrationStatus);
  if (part.registrationStatus !== undefined && regStatus) {
    data.registrationStatus = regStatus;
    if (regStatus === "CANCELLED") data.cancelledAt = new Date();
    if (regStatus === "WAITLISTED") data.waitlistedAt = new Date();
  }
  const attStatus = coerceAttendanceStatus(part.attendanceStatus);
  if (part.attendanceStatus !== undefined && attStatus) data.attendanceStatus = attStatus;
  if ("registrationType" in part) data.registrationType = trimOrNull(part.registrationType);
  if ("badgeType" in part) data.badgeType = trimOrNull(part.badgeType);
  if ("ticketType" in part) data.ticketType = trimOrNull(part.ticketType);
  if ("notes" in part) data.notes = trimOrNull(part.notes);

  const attendee = await getPrisma().eventAttendee.update({ where: { id: args.attendeeId }, data });

  if (args.registration && hasRegistrationData(args.registration)) {
    await upsertRegistrationRecord({
      eventId: args.eventId,
      attendeeId: attendee.id,
      directoryPersonId: existing.directoryPersonId,
      input: args.registration,
    });
  }
  return attendee;
}

/** Cancel keeps the participation row (and Directory person) — soft lifecycle. */
export async function cancelEventAttendee(args: { eventId: string; attendeeId: string; user: AttendeeUser }): Promise<EventAttendee> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const existing = await getEventAttendee({ eventId: args.eventId, attendeeId: args.attendeeId, user: args.user });
  const now = new Date();
  await getPrisma().eventRegistrationRecord.updateMany({
    where: { attendeeId: existing.id },
    data: { registrationStatus: "CANCELLED", cancelledAt: now },
  });
  return getPrisma().eventAttendee.update({
    where: { id: existing.id },
    data: { registrationStatus: "CANCELLED", attendanceStatus: "CANCELLED", cancelledAt: now, syncedByUserId: args.user.id },
  });
}

/**
 * Remove the attendee PARTICIPATION (and its registration records) while keeping
 * the canonical Directory person. The ATTENDEE role is removed since participation
 * no longer exists; other roles (Speaker/Staff/etc.) are preserved.
 */
export async function deleteEventAttendee(args: { eventId: string; attendeeId: string; user: AttendeeUser }): Promise<{ status: "deleted" }> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const existing = await getPrisma().eventAttendee.findUnique({
    where: { id: args.attendeeId },
    select: { id: true, eventId: true, directoryPersonId: true },
  });
  if (!existing) throw new AttendeeServiceError("ATTENDEE_NOT_FOUND", "Attendee not found", 404);
  if (existing.eventId !== args.eventId) {
    throw new AttendeeServiceError("ATTENDEE_EVENT_MISMATCH", "Attendee belongs to a different event", 404);
  }
  await getPrisma().$transaction(async (tx) => {
    await tx.eventAttendee.delete({ where: { id: existing.id } }); // registration records cascade
    await tx.eventDirectoryRole.deleteMany({
      where: { eventId: args.eventId, personId: existing.directoryPersonId, role: "ATTENDEE" },
    });
  });
  return { status: "deleted" };
}

// ---------------------------------------------------------------------------
// CSV import processing
// ---------------------------------------------------------------------------

export type AttendeeImportRowInput = {
  rowNumber: number;
  rawName: string | null;
  rawEmail: string | null;
  rawCompany: string | null;
  /** Server-side parse result from lib/event-attendee-import (re-validated, not trusted from UI). */
  parse: AttendeeRowParseResult;
};

export type AttendeeImportCounts = {
  created: number;
  updated: number;
  conflicts: number;
  invalid: number;
  skipped: number;
};

export type AttendeeImportRowResult = {
  rowNumber: number;
  name: string | null;
  email: string | null;
  company: string | null;
  result: "CREATED" | "UPDATED" | "CONFLICT" | "INVALID" | "SKIPPED";
  reason?: string;
};

/**
 * Import attendees from a parsed CSV. Matches existing Directory people by
 * normalized email (reusing speakers/staff/etc. — never duplicating them), adds
 * Attendee participation, optionally writes a registration record, and flags
 * ambiguous no-email name+company collisions as CONFLICT (never auto-merged).
 * Re-import updates by email and never duplicates roles. No one is deleted.
 */
export async function processAttendeeCsvImport(args: {
  eventId: string;
  user: AttendeeUser;
  sourceLabel: string;
  rows: AttendeeImportRowInput[];
}): Promise<{ counts: AttendeeImportCounts; rows: AttendeeImportRowResult[] }> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const prisma = getPrisma();
  const event = await prisma.event.findUnique({ where: { id: args.eventId }, select: { orgId: true, clientId: true } });
  if (!event) throw new AttendeeServiceError("ATTENDEE_VALIDATION", "Event not found", 404);

  const sourceId = await createOrReuseEventDirectorySource({
    eventId: args.eventId,
    type: "CSV_IMPORT",
    label: trimOrNull(args.sourceLabel) ?? "Attendee CSV import",
    createdByUserId: args.user.id,
  });

  const counts: AttendeeImportCounts = { created: 0, updated: 0, conflicts: 0, invalid: 0, skipped: 0 };
  const results: AttendeeImportRowResult[] = [];

  for (const row of args.rows) {
    if (row.parse.result === "invalid") {
      counts.invalid += 1;
      results.push({ rowNumber: row.rowNumber, name: row.rawName, email: row.rawEmail, company: row.rawCompany, result: "INVALID", reason: row.parse.reason });
      continue;
    }
    const { identity, registration } = row.parse;

    // Resolve / link Directory person (email first; flag no-email collisions).
    let personId: string;
    let isConflict = false;
    if (identity.normalizedEmail) {
      const existing = await prisma.eventDirectoryPerson.findFirst({
        where: { eventId: args.eventId, normalizedEmail: identity.normalizedEmail, status: { notIn: ["MERGED"] } },
        select: { id: true },
      });
      personId = existing ? existing.id : await createDirectoryPersonForImport(args.eventId, event.orgId, event.clientId, identity, args.user.id, "ACTIVE");
    } else {
      const collision = identity.company
        ? await detectDirectoryDuplicate({ eventId: args.eventId, displayName: identity.displayName, company: identity.company })
        : null;
      isConflict = Boolean(collision && collision.matchType === "name_company");
      personId = await createDirectoryPersonForImport(args.eventId, event.orgId, event.clientId, identity, args.user.id, isConflict ? "NEEDS_REVIEW" : "ACTIVE");
    }

    await addEventDirectoryRole({ eventId: args.eventId, personId, role: "ATTENDEE", sourceId, user: args.user });

    // Upsert participation.
    const provider = registration.provider?.trim().toLowerCase();
    const hasReg = hasRegistrationData(registration);
    const regStatus = (registration.registrationStatus as EventAttendeeRegistrationStatus | null) ?? (hasReg ? "REGISTERED" : "NOT_REGISTERED");
    const source: EventAttendeeSource = provider && provider !== "manual" ? "REGISTRATION_INTEGRATION" : "CSV_IMPORT";
    const syncStatus = syncStatusForSource(source, Boolean(provider && provider !== "manual"));

    const existingAttendee = await prisma.eventAttendee.findUnique({ where: { directoryPersonId: personId }, select: { id: true } });
    const data = {
      registrationStatus: regStatus,
      registrationType: registration.registrationType,
      badgeType: registration.badgeType,
      ticketType: registration.ticketType,
      source,
      syncStatus,
      lastSyncedAt: hasReg ? new Date() : undefined,
    };
    let attendeeId: string;
    let created: boolean;
    if (existingAttendee) {
      await prisma.eventAttendee.update({ where: { id: existingAttendee.id }, data: { ...data, syncedByUserId: args.user.id } });
      attendeeId = existingAttendee.id;
      created = false;
    } else {
      const createdAttendee = await prisma.eventAttendee.create({
        data: { eventId: args.eventId, directoryPersonId: personId, ...data, importedByUserId: args.user.id },
        select: { id: true },
      });
      attendeeId = createdAttendee.id;
      created = true;
    }

    if (hasReg) {
      await upsertRegistrationRecord({ eventId: args.eventId, attendeeId, directoryPersonId: personId, input: registration });
    }

    const result: AttendeeImportRowResult["result"] = isConflict ? "CONFLICT" : created ? "CREATED" : "UPDATED";
    if (isConflict) counts.conflicts += 1;
    else if (created) counts.created += 1;
    else counts.updated += 1;
    results.push({ rowNumber: row.rowNumber, name: identity.displayName, email: identity.email, company: identity.company, result });
  }

  return { counts, rows: results };
}

async function createDirectoryPersonForImport(
  eventId: string,
  orgId: string,
  clientId: string | null,
  identity: { firstName: string | null; lastName: string | null; displayName: string; email: string | null; normalizedEmail: string | null; phone: string | null; company: string | null; title: string | null },
  userId: string,
  status: "ACTIVE" | "NEEDS_REVIEW",
): Promise<string> {
  const created = await getPrisma().eventDirectoryPerson.create({
    data: {
      orgId,
      clientId,
      eventId,
      firstName: identity.firstName,
      lastName: identity.lastName,
      displayName: identity.displayName,
      email: identity.email,
      normalizedEmail: identity.normalizedEmail,
      phone: identity.phone,
      company: identity.company,
      title: identity.title,
      status,
      createdByUserId: userId,
      updatedByUserId: userId,
    },
    select: { id: true },
  });
  return created.id;
}
