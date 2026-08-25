/**
 * Event Directory — canonical service layer.
 *
 * Owns all Event Directory business rules: identity normalization, deterministic
 * duplicate detection, role assignment, source tracking, explicit delete
 * semantics, merge, and module linking. Event read/write access is enforced
 * here (server-side); routes stay thin and call this service. Existing Speaker /
 * Seating / Staffing models are never mutated by this layer.
 */
import {
  Prisma,
  type EventDirectoryModuleType,
  type EventDirectoryPerson,
  type EventDirectoryPersonStatus,
  type EventDirectoryRoleType,
  type EventDirectorySourceType,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordEventActivity } from "@/src/server/services/event-activity";
import { assertEventAccessForUser, type EventAccessUser } from "@/lib/event-access";
import {
  normalizeDirectoryEmail,
  type DirectoryRowParseResult,
} from "@/lib/event-directory-import";
import { getEmailProvider, type EmailProvider } from "@/src/server/email/provider";

export { normalizeDirectoryEmail } from "@/lib/event-directory-import";

// ---------------------------------------------------------------------------
// Errors + shared types
// ---------------------------------------------------------------------------

export type DirectoryErrorCode =
  | "DIRECTORY_PERSON_NOT_FOUND"
  | "DIRECTORY_PERSON_EVENT_MISMATCH"
  | "DIRECTORY_DUPLICATE_FOUND"
  | "DIRECTORY_DELETE_BLOCKED"
  | "DIRECTORY_ROLE_INVALID"
  | "DIRECTORY_ROLE_NOT_FOUND"
  | "DIRECTORY_VALIDATION"
  | "DIRECTORY_EMAIL_VALIDATION"
  | "DIRECTORY_MERGE_INVALID"
  | "DIRECTORY_IMPORT_NOT_FOUND";

export class DirectoryServiceError extends Error {
  status: number;
  code: DirectoryErrorCode;
  details?: unknown;
  constructor(code: DirectoryErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "DirectoryServiceError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type DirectoryUser = EventAccessUser;

export type DirectoryPersonInput = {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
};

type DirectoryEmailRecipientCandidate = {
  id: string;
  displayName: string;
  email: string | null;
};

export type DirectoryEmailRecipient = {
  personId: string;
  displayName: string;
  email: string;
};

export type DirectoryEmailSkippedRecipient = {
  personId: string;
  displayName: string;
  email: string | null;
  reason: "missing_email" | "invalid_email";
};

export type DirectoryEmailRecipientPlan = {
  validRecipients: DirectoryEmailRecipient[];
  skippedRecipients: DirectoryEmailSkippedRecipient[];
};

export type SendDirectoryEmailResult = {
  attempted: number;
  sent: number;
  failed: number;
  skippedNoProvider: number;
  skippedNoEmail: number;
  recipients: Array<DirectoryEmailRecipient & { status: "SENT" | "FAILED" | "SKIPPED_NO_PROVIDER"; detail?: string }>;
  skippedRecipients: DirectoryEmailSkippedRecipient[];
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** Derive a stable display name from the available identity fields. */
export function deriveDirectoryDisplayName(input: DirectoryPersonInput): string {
  const explicit = input.displayName?.trim();
  if (explicit) return explicit;
  const full = [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(" ").trim();
  if (full) return full;
  const email = input.email?.trim();
  if (email) return email;
  return "Unnamed contact";
}

/** True when there is enough identity to create a person (email or any name). */
export function hasUsableIdentity(input: DirectoryPersonInput): boolean {
  return Boolean(
    normalizeDirectoryEmail(input.email) ||
      input.firstName?.trim() ||
      input.lastName?.trim() ||
      input.displayName?.trim(),
  );
}

export function buildDirectoryEmailRecipientPlan(
  people: DirectoryEmailRecipientCandidate[],
): DirectoryEmailRecipientPlan {
  const seenEmails = new Set<string>();
  const validRecipients: DirectoryEmailRecipient[] = [];
  const skippedRecipients: DirectoryEmailSkippedRecipient[] = [];

  for (const person of people) {
    const normalizedEmail = normalizeDirectoryEmail(person.email);
    if (!person.email?.trim()) {
      skippedRecipients.push({
        personId: person.id,
        displayName: person.displayName,
        email: person.email,
        reason: "missing_email",
      });
      continue;
    }
    if (!normalizedEmail) {
      skippedRecipients.push({
        personId: person.id,
        displayName: person.displayName,
        email: person.email,
        reason: "invalid_email",
      });
      continue;
    }
    if (seenEmails.has(normalizedEmail)) {
      continue;
    }
    seenEmails.add(normalizedEmail);
    validRecipients.push({
      personId: person.id,
      displayName: person.displayName,
      email: person.email.trim(),
    });
  }

  return { validRecipients, skippedRecipients };
}

export type DeleteDependency = "module_links" | "external_identities" | "import_history";
export type DeleteOutcome = "hard_deleted" | "soft_removed";

/**
 * Decide delete semantics from a person's downstream usage. Hard delete only a
 * local-only person; otherwise soft-remove to preserve module links, external
 * identities, and import history.
 */
export function decideDeleteOutcome(deps: {
  moduleLinks: number;
  externalIdentities: number;
  importRows: number;
}): { outcome: DeleteOutcome; dependencies: DeleteDependency[] } {
  const dependencies: DeleteDependency[] = [];
  if (deps.moduleLinks > 0) dependencies.push("module_links");
  if (deps.externalIdentities > 0) dependencies.push("external_identities");
  if (deps.importRows > 0) dependencies.push("import_history");
  return { outcome: dependencies.length > 0 ? "soft_removed" : "hard_deleted", dependencies };
}

const VALID_ROLES: ReadonlySet<string> = new Set([
  "ATTENDEE",
  "REGISTRANT",
  "SPEAKER",
  "EXHIBITOR_CONTACT",
  "SPONSOR_CONTACT",
  "STAFF",
  "VIP",
  "PRESS",
  "PROSPECT",
  "MARKETING_CONTACT",
  "SEATING_GUEST",
  "VENDOR",
]);

export function assertValidRole(role: string): EventDirectoryRoleType {
  if (!VALID_ROLES.has(role)) {
    throw new DirectoryServiceError("DIRECTORY_ROLE_INVALID", `Unknown directory role: ${role}`, 400);
  }
  return role as EventDirectoryRoleType;
}

export function expandDirectoryRoleFilter(role: EventDirectoryRoleType): EventDirectoryRoleType[] {
  switch (role) {
    case "PROSPECT":
    case "MARKETING_CONTACT":
      return ["PROSPECT", "MARKETING_CONTACT"];
    case "ATTENDEE":
    case "REGISTRANT":
      return ["ATTENDEE", "REGISTRANT"];
    default:
      return [role];
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Source handling
// ---------------------------------------------------------------------------

/** Create or reuse a source row by (eventId, type, label). Source ≠ role. */
export async function createOrReuseEventDirectorySource(args: {
  eventId: string;
  type: EventDirectorySourceType;
  label: string;
  provider?: string | null;
  createdByUserId?: string | null;
}): Promise<string> {
  const label = args.label.trim() || defaultSourceLabel(args.type);
  const existing = await getPrisma().eventDirectorySource.findUnique({
    where: { eventId_type_label: { eventId: args.eventId, type: args.type, label } },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const created = await getPrisma().eventDirectorySource.create({
      data: {
        eventId: args.eventId,
        type: args.type,
        label,
        provider: args.provider ?? null,
        createdByUserId: args.createdByUserId ?? null,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await getPrisma().eventDirectorySource.findUnique({
        where: { eventId_type_label: { eventId: args.eventId, type: args.type, label } },
        select: { id: true },
      });
      if (raced) return raced.id;
    }
    throw error;
  }
}

function defaultSourceLabel(type: EventDirectorySourceType): string {
  switch (type) {
    case "MANUAL":
      return "Manually added";
    case "CSV_IMPORT":
      return "CSV upload";
    case "REGISTRATION_INTEGRATION":
      return "Registration integration";
    case "SPEAKER_INTAKE":
      return "Speaker intake";
    case "SPEAKER_MODULE":
    case "SEATING_MODULE":
    case "STAFFING_MODULE":
      return "Backfilled";
    case "EXHIBITOR_PORTAL":
      return "Exhibitor portal";
    case "SPONSOR_IMPORT":
      return "Sponsor import";
    default:
      return type;
  }
}

const BACKFILL_SOURCE_TYPES = new Set<EventDirectorySourceType>(["SPEAKER_MODULE", "SEATING_MODULE", "STAFFING_MODULE"]);

export function displayEventDirectorySourceLabel(source: {
  type: EventDirectorySourceType;
  label: string | null;
} | null): string | null {
  if (!source) return null;
  if (BACKFILL_SOURCE_TYPES.has(source.type)) return "Backfilled";
  const label = trimOrNull(source.label);
  if (!label) return defaultSourceLabel(source.type);
  if (/\bmodule\b/i.test(label)) return "Backfilled";
  if (source.type === "CSV_IMPORT" && /^csv import$/i.test(label)) return "CSV upload";
  return label;
}

export function displayEventDirectoryModuleUsage(module: EventDirectoryModuleType): string {
  switch (module) {
    case "SPEAKER":
      return "Speakers";
    case "SEATING_ATTENDEE":
      return "Seating";
    case "EVENT_PERSON":
      return "Staffing";
    case "MARKETING_RECIPIENT":
      return "Marketing";
    case "EXHIBITOR_CONTACT":
      return "Exhibitors";
    case "SPONSOR_CONTACT":
      return "Sponsors";
    default:
      return module;
  }
}

// ---------------------------------------------------------------------------
// Duplicate detection
// ---------------------------------------------------------------------------

export type DuplicateMatch = {
  matchType: "external_identity" | "normalized_email" | "name_company";
  person: { id: string; displayName: string; email: string | null; company: string | null };
};

/**
 * Deterministic duplicate detection within an event. Returns the strongest match
 * found. Name+company matches are returned as weak candidates only; callers must
 * NOT auto-merge them.
 */
export async function detectDirectoryDuplicate(args: {
  eventId: string;
  normalizedEmail?: string | null;
  provider?: string | null;
  externalPersonId?: string | null;
  displayName?: string | null;
  company?: string | null;
  excludePersonId?: string | null;
}): Promise<DuplicateMatch | null> {
  const personSelect = { id: true, displayName: true, email: true, company: true };
  const notRemoved = { status: { notIn: ["REMOVED", "MERGED"] as EventDirectoryPersonStatus[] } };

  if (args.provider && args.externalPersonId) {
    const identity = await getPrisma().eventDirectoryExternalIdentity.findUnique({
      where: {
        eventId_provider_externalPersonId: {
          eventId: args.eventId,
          provider: args.provider,
          externalPersonId: args.externalPersonId,
        },
      },
      select: { person: { select: personSelect } },
    });
    if (identity?.person && identity.person.id !== args.excludePersonId) {
      return { matchType: "external_identity", person: identity.person };
    }
  }

  if (args.normalizedEmail) {
    const byEmail = await getPrisma().eventDirectoryPerson.findFirst({
      where: {
        eventId: args.eventId,
        normalizedEmail: args.normalizedEmail,
        ...notRemoved,
        ...(args.excludePersonId ? { id: { not: args.excludePersonId } } : {}),
      },
      select: personSelect,
    });
    if (byEmail) return { matchType: "normalized_email", person: byEmail };
  }

  const name = trimOrNull(args.displayName);
  const company = trimOrNull(args.company);
  if (name && company) {
    const byNameCompany = await getPrisma().eventDirectoryPerson.findFirst({
      where: {
        eventId: args.eventId,
        displayName: { equals: name, mode: "insensitive" },
        company: { equals: company, mode: "insensitive" },
        ...notRemoved,
        ...(args.excludePersonId ? { id: { not: args.excludePersonId } } : {}),
      },
      select: personSelect,
    });
    if (byNameCompany) return { matchType: "name_company", person: byNameCompany };
  }

  return null;
}

// ---------------------------------------------------------------------------
// List / detail
// ---------------------------------------------------------------------------

const PERSON_LIST_SELECT = {
  id: true,
  displayName: true,
  firstName: true,
  lastName: true,
  email: true,
  company: true,
  title: true,
  status: true,
  updatedAt: true,
  roles: { select: { id: true, role: true, sourceId: true } },
  moduleLinks: { select: { module: true } },
} satisfies Prisma.EventDirectoryPersonSelect;

export type DirectoryListFilters = {
  search?: string | null;
  role?: EventDirectoryRoleType | null;
  sourceType?: EventDirectorySourceType | null;
  sourceId?: string | null;
  status?: EventDirectoryPerson["status"] | null;
  limit?: number;
  cursor?: string | null;
};

/** Build the Prisma where filter for the list query (pure; testable). */
export function buildDirectoryListWhere(
  eventId: string,
  filters: DirectoryListFilters,
): Prisma.EventDirectoryPersonWhereInput {
  const where: Prisma.EventDirectoryPersonWhereInput = { eventId };
  const search = trimOrNull(filters.search);
  if (search) {
    where.OR = [
      { displayName: { contains: search, mode: "insensitive" } },
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { company: { contains: search, mode: "insensitive" } },
    ];
  }
  if (filters.status) {
    where.status = filters.status;
  } else {
    // Default list contains only people who still participate in the directory.
    // Removed and merged records remain available through explicit status filters.
    where.status = { notIn: ["MERGED", "REMOVED"] };
  }
  if (filters.role || filters.sourceType || filters.sourceId) {
    where.roles = {
      some: {
        ...(filters.role ? { role: { in: expandDirectoryRoleFilter(filters.role) } } : {}),
        ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
        ...(filters.sourceType ? { source: { type: filters.sourceType } } : {}),
      },
    };
  }
  return where;
}

export type DirectoryListItem = {
  id: string;
  displayName: string;
  email: string | null;
  company: string | null;
  title: string | null;
  roles: EventDirectoryRoleType[];
  sourceLabels: string[];
  usedInLabels: string[];
  status: EventDirectoryPerson["status"];
  updatedAt: Date;
};

export async function listEventDirectoryPeople(args: {
  eventId: string;
  user: DirectoryUser;
  filters?: DirectoryListFilters;
}): Promise<{ people: DirectoryListItem[]; nextCursor: string | null }> {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  const filters = args.filters ?? {};
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const where = buildDirectoryListWhere(args.eventId, filters);

  const rows = await getPrisma().eventDirectoryPerson.findMany({
    where,
    select: {
      ...PERSON_LIST_SELECT,
      roles: { select: { id: true, role: true, source: { select: { label: true, type: true } } } },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const people: DirectoryListItem[] = page.map((row) => ({
    id: row.id,
    displayName: row.displayName,
    email: row.email,
    company: row.company,
    title: row.title,
    roles: dedupeRoles(row.roles.map((r) => r.role)),
    sourceLabels: [
      ...new Set(row.roles.map((r) => displayEventDirectorySourceLabel(r.source)).filter((l): l is string => Boolean(l))),
    ],
    usedInLabels: [...new Set(row.moduleLinks.map((link) => displayEventDirectoryModuleUsage(link.module)))],
    status: row.status,
    updatedAt: row.updatedAt,
  }));
  return { people, nextCursor: hasMore ? page[page.length - 1].id : null };
}

function dedupeRoles(roles: EventDirectoryRoleType[]): EventDirectoryRoleType[] {
  return [...new Set(roles)];
}

export type DirectorySummaryCounts = {
  total: number;
  contacts: number;
  attendees: number;
  speakers: number;
  sponsorsExhibitors: number;
  vipPress: number;
  needsReview: number;
};

export async function getEventDirectorySummary(args: {
  eventId: string;
  user: DirectoryUser;
}): Promise<DirectorySummaryCounts> {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  const prisma = getPrisma();
  const activeWhere = { eventId: args.eventId, status: { notIn: ["MERGED", "REMOVED"] as EventDirectoryPersonStatus[] } };
  const roleCount = (roles: EventDirectoryRoleType[]) =>
    prisma.eventDirectoryPerson.count({ where: { ...activeWhere, roles: { some: { role: { in: roles } } } } });

  const [total, contacts, attendees, speakers, sponsorsExhibitors, vipPress, needsReview] = await Promise.all([
    prisma.eventDirectoryPerson.count({ where: activeWhere }),
    roleCount(["PROSPECT", "MARKETING_CONTACT"]),
    roleCount(["ATTENDEE", "REGISTRANT"]),
    roleCount(["SPEAKER"]),
    roleCount(["SPONSOR_CONTACT", "EXHIBITOR_CONTACT"]),
    roleCount(["VIP", "PRESS"]),
    prisma.eventDirectoryPerson.count({
      where: { eventId: args.eventId, status: { in: ["NEEDS_REVIEW", "DUPLICATE_REVIEW"] } },
    }),
  ]);
  return { total, contacts, attendees, speakers, sponsorsExhibitors, vipPress, needsReview };
}

export async function getEventDirectoryPerson(args: {
  eventId: string;
  personId: string;
  user: DirectoryUser;
}) {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  const person = await getPrisma().eventDirectoryPerson.findUnique({
    where: { id: args.personId },
    include: {
      roles: { include: { source: true }, orderBy: { createdAt: "asc" } },
      externalIdentities: true,
      moduleLinks: true,
    },
  });
  if (!person) {
    throw new DirectoryServiceError("DIRECTORY_PERSON_NOT_FOUND", "Directory person not found", 404);
  }
  assertSameEvent(person, args.eventId);
  return person;
}

function normalizeDirectoryEmailPersonIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DirectoryServiceError("DIRECTORY_EMAIL_VALIDATION", "Select at least one person to email", 400);
  }

  const ids = value
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    throw new DirectoryServiceError("DIRECTORY_EMAIL_VALIDATION", "Select at least one person to email", 400);
  }
  if (uniqueIds.length > 200) {
    throw new DirectoryServiceError("DIRECTORY_EMAIL_VALIDATION", "Email can include at most 200 selected people", 400);
  }
  return uniqueIds;
}

function requireDirectoryEmailText(value: unknown, field: "subject" | "body"): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DirectoryServiceError("DIRECTORY_EMAIL_VALIDATION", `${field} is required`, 400);
  }
  const text = value.trim();
  const maxLength = field === "subject" ? 200 : 10000;
  if (text.length > maxLength) {
    throw new DirectoryServiceError(
      "DIRECTORY_EMAIL_VALIDATION",
      `${field} must be ${maxLength} characters or fewer`,
      400,
    );
  }
  return text;
}

export async function sendEventDirectoryEmail(args: {
  eventId: string;
  user: DirectoryUser;
  personIds: unknown;
  subject: unknown;
  body: unknown;
  provider?: EmailProvider;
}): Promise<SendDirectoryEmailResult> {
  await assertEventAccessForUser(args.eventId, args.user, "write");

  const personIds = normalizeDirectoryEmailPersonIds(args.personIds);
  const subject = requireDirectoryEmailText(args.subject, "subject");
  const body = requireDirectoryEmailText(args.body, "body");

  const people = await getPrisma().eventDirectoryPerson.findMany({
    where: {
      eventId: args.eventId,
      id: { in: personIds },
      status: { notIn: ["MERGED", "REMOVED"] },
    },
    select: {
      id: true,
      displayName: true,
      email: true,
    },
  });

  const peopleById = new Map(people.map((person) => [person.id, person]));
  const orderedPeople = personIds.map((id) => peopleById.get(id)).filter((person): person is (typeof people)[number] => Boolean(person));
  const plan = buildDirectoryEmailRecipientPlan(orderedPeople);

  if (plan.validRecipients.length === 0) {
    throw new DirectoryServiceError(
      "DIRECTORY_EMAIL_VALIDATION",
      "No selected people have a valid email address",
      400,
      { skippedRecipients: plan.skippedRecipients },
    );
  }

  const provider = args.provider ?? getEmailProvider();
  const result: SendDirectoryEmailResult = {
    attempted: plan.validRecipients.length,
    sent: 0,
    failed: 0,
    skippedNoProvider: 0,
    skippedNoEmail: plan.skippedRecipients.length,
    recipients: [],
    skippedRecipients: plan.skippedRecipients,
  };

  for (const recipient of plan.validRecipients) {
    const sendResult = await provider.send({ to: recipient.email, subject, body });
    if (sendResult.status === "SENT") result.sent += 1;
    else if (sendResult.status === "FAILED") result.failed += 1;
    else result.skippedNoProvider += 1;

    result.recipients.push({
      ...recipient,
      status: sendResult.status,
      detail: sendResult.detail,
    });
  }

  // Canonical event-feed summary entry (one per bulk email, never per recipient,
  // and never the email body). Failures surface rather than being swallowed.
  await recordEventActivity(getPrisma(), {
    eventId: args.eventId,
    actor: { kind: "USER", userId: args.user.id },
    module: "EVENT_DIRECTORY",
    action: "SENT",
    entityType: "DirectoryEmail",
    entityLabel: subject,
    message:
      `Directory email "${subject}" processed: ` +
      `${result.sent} sent, ${result.failed} failed, ${result.skippedNoProvider} skipped no provider, ` +
      `${result.skippedNoEmail} skipped missing/invalid email.`,
  });

  return result;
}

function assertSameEvent(person: { eventId: string }, eventId: string): void {
  if (person.eventId !== eventId) {
    throw new DirectoryServiceError(
      "DIRECTORY_PERSON_EVENT_MISMATCH",
      "Directory person belongs to a different event",
      404,
    );
  }
}

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

export type CreatePersonResult =
  | { status: "created"; person: EventDirectoryPerson }
  | { status: "possible_duplicate"; existing: DuplicateMatch };

export async function createEventDirectoryPerson(args: {
  eventId: string;
  user: DirectoryUser;
  input: DirectoryPersonInput;
  roles?: string[];
  source?: { type: EventDirectorySourceType; label: string; provider?: string | null };
  allowDuplicate?: boolean;
}): Promise<CreatePersonResult> {
  const decision = await assertEventAccessForUser(args.eventId, args.user, "write");
  if (!hasUsableIdentity(args.input)) {
    throw new DirectoryServiceError(
      "DIRECTORY_VALIDATION",
      "A person needs at least an email or a name",
      400,
    );
  }

  const normalizedEmail = normalizeDirectoryEmail(args.input.email);
  const displayName = deriveDirectoryDisplayName(args.input);
  const roles = (args.roles ?? []).map(assertValidRole);

  if (!args.allowDuplicate && normalizedEmail) {
    const match = await detectDirectoryDuplicate({ eventId: args.eventId, normalizedEmail });
    if (match) return { status: "possible_duplicate", existing: match };
  }

  const event = await getPrisma().event.findUnique({
    where: { id: args.eventId },
    select: { orgId: true, clientId: true },
  });
  const orgId = event?.orgId ?? decision.eventOrgId;
  if (!orgId) {
    throw new DirectoryServiceError("DIRECTORY_VALIDATION", "Event organization could not be resolved", 400);
  }

  const sourceId = args.source
    ? await createOrReuseEventDirectorySource({
        eventId: args.eventId,
        type: args.source.type,
        label: args.source.label,
        provider: args.source.provider,
        createdByUserId: args.user.id,
      })
    : null;

  const person = await getPrisma().$transaction(async (tx) => {
    const created = await tx.eventDirectoryPerson.create({
      data: {
        orgId,
        clientId: event?.clientId ?? null,
        eventId: args.eventId,
        firstName: trimOrNull(args.input.firstName),
        lastName: trimOrNull(args.input.lastName),
        displayName,
        email: trimOrNull(args.input.email),
        normalizedEmail,
        phone: trimOrNull(args.input.phone),
        company: trimOrNull(args.input.company),
        title: trimOrNull(args.input.title),
        createdByUserId: args.user.id,
        updatedByUserId: args.user.id,
      },
    });
    if (roles.length > 0) {
      await tx.eventDirectoryRole.createMany({
        data: roles.map((role) => ({
          eventId: args.eventId,
          personId: created.id,
          role,
          sourceId,
          createdByUserId: args.user.id,
        })),
        skipDuplicates: true,
      });
    }
    await recordEventActivity(tx, {
      eventId: args.eventId,
      actor: { kind: "USER", userId: args.user.id },
      module: "EVENT_DIRECTORY",
      action: "CREATED",
      entityType: "DirectoryPerson",
      entityId: created.id,
      entityLabel: created.displayName,
      message: `Added directory contact "${created.displayName}"`,
    });
    return created;
  });

  return { status: "created", person };
}

export async function updateEventDirectoryPerson(args: {
  eventId: string;
  personId: string;
  user: DirectoryUser;
  input: DirectoryPersonInput;
}): Promise<EventDirectoryPerson> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const existing = await getPrisma().eventDirectoryPerson.findUnique({
    where: { id: args.personId },
    select: { id: true, eventId: true, displayName: true },
  });
  if (!existing) throw new DirectoryServiceError("DIRECTORY_PERSON_NOT_FOUND", "Directory person not found", 404);
  assertSameEvent(existing, args.eventId);

  const data: Prisma.EventDirectoryPersonUpdateInput = { updatedByUserId: args.user.id };
  if ("firstName" in args.input) data.firstName = trimOrNull(args.input.firstName);
  if ("lastName" in args.input) data.lastName = trimOrNull(args.input.lastName);
  if ("phone" in args.input) data.phone = trimOrNull(args.input.phone);
  if ("company" in args.input) data.company = trimOrNull(args.input.company);
  if ("title" in args.input) data.title = trimOrNull(args.input.title);
  if ("email" in args.input) {
    data.email = trimOrNull(args.input.email);
    data.normalizedEmail = normalizeDirectoryEmail(args.input.email);
  }
  if (args.input.displayName !== undefined || args.input.firstName !== undefined || args.input.lastName !== undefined) {
    // Recompute display name from the merged view of new + existing values.
    const current = await getPrisma().eventDirectoryPerson.findUnique({
      where: { id: args.personId },
      select: { firstName: true, lastName: true, displayName: true, email: true },
    });
    data.displayName = deriveDirectoryDisplayName({
      firstName: (data.firstName as string | null | undefined) ?? current?.firstName,
      lastName: (data.lastName as string | null | undefined) ?? current?.lastName,
      displayName: trimOrNull(args.input.displayName) ?? undefined,
      email: (data.email as string | null | undefined) ?? current?.email,
    });
  }

  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.eventDirectoryPerson.update({ where: { id: args.personId }, data });
    await recordEventActivity(tx, {
      eventId: args.eventId,
      actor: { kind: "USER", userId: args.user.id },
      module: "EVENT_DIRECTORY",
      action: "UPDATED",
      entityType: "DirectoryPerson",
      entityId: updated.id,
      entityLabel: updated.displayName,
      message: `Updated directory contact "${updated.displayName}"`,
    });
    return updated;
  });
}

// ---------------------------------------------------------------------------
// Delete / remove
// ---------------------------------------------------------------------------

export type DeletePersonResult =
  | { status: "hard_deleted" }
  | { status: "soft_removed"; dependencies: DeleteDependency[] }
  | { status: "blocked"; dependencies: DeleteDependency[] };

export async function deleteEventDirectoryPerson(args: {
  eventId: string;
  personId: string;
  user: DirectoryUser;
}): Promise<DeletePersonResult> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const person = await getPrisma().eventDirectoryPerson.findUnique({
    where: { id: args.personId },
    select: {
      id: true,
      eventId: true,
      displayName: true,
      _count: { select: { moduleLinks: true, externalIdentities: true, matchedImportRows: true } },
    },
  });
  if (!person) throw new DirectoryServiceError("DIRECTORY_PERSON_NOT_FOUND", "Directory person not found", 404);
  assertSameEvent(person, args.eventId);

  const { outcome, dependencies } = decideDeleteOutcome({
    moduleLinks: person._count.moduleLinks,
    externalIdentities: person._count.externalIdentities,
    importRows: person._count.matchedImportRows,
  });

  if (outcome === "soft_removed") {
    await getPrisma().$transaction(async (tx) => {
      await tx.eventDirectoryPerson.update({
        where: { id: args.personId },
        data: { status: "REMOVED", deletedAt: new Date(), updatedByUserId: args.user.id },
      });
      await recordEventActivity(tx, {
        eventId: args.eventId,
        actor: { kind: "USER", userId: args.user.id },
        module: "EVENT_DIRECTORY",
        action: "DELETED",
        entityType: "DirectoryPerson",
        entityId: person.id,
        entityLabel: person.displayName,
        message: `Removed directory contact "${person.displayName}"`,
      });
    });
    return { status: "soft_removed", dependencies };
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.eventDirectoryRole.deleteMany({ where: { personId: args.personId } });
    await tx.eventDirectoryPerson.delete({ where: { id: args.personId } });
    await recordEventActivity(tx, {
      eventId: args.eventId,
      actor: { kind: "USER", userId: args.user.id },
      module: "EVENT_DIRECTORY",
      action: "DELETED",
      entityType: "DirectoryPerson",
      entityId: person.id,
      entityLabel: person.displayName,
      message: `Deleted directory contact "${person.displayName}"`,
    });
  });
  return { status: "hard_deleted" };
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export async function addEventDirectoryRole(args: {
  eventId: string;
  personId: string;
  role: string;
  sourceId?: string | null;
  user: DirectoryUser;
}): Promise<{ created: boolean; roleId: string }> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const role = assertValidRole(args.role);
  const person = await getPrisma().eventDirectoryPerson.findUnique({
    where: { id: args.personId },
    select: { id: true, eventId: true },
  });
  if (!person) throw new DirectoryServiceError("DIRECTORY_PERSON_NOT_FOUND", "Directory person not found", 404);
  assertSameEvent(person, args.eventId);

  const existing = await getPrisma().eventDirectoryRole.findUnique({
    where: { eventId_personId_role: { eventId: args.eventId, personId: args.personId, role } },
    select: { id: true },
  });
  if (existing) return { created: false, roleId: existing.id };

  const created = await getPrisma().$transaction(async (tx) => {
    const row = await tx.eventDirectoryRole.create({
      data: {
        eventId: args.eventId,
        personId: args.personId,
        role,
        sourceId: args.sourceId ?? null,
        createdByUserId: args.user.id,
      },
      select: { id: true, person: { select: { displayName: true } } },
    });
    await recordEventActivity(tx, {
      eventId: args.eventId,
      actor: { kind: "USER", userId: args.user.id },
      module: "EVENT_DIRECTORY",
      action: "ASSIGNED",
      entityType: "DirectoryRole",
      entityId: args.personId,
      entityLabel: row.person?.displayName ?? "Contact",
      message: `Added ${role} role to "${row.person?.displayName ?? "contact"}"`,
    });
    return row;
  });
  return { created: true, roleId: created.id };
}

export async function removeEventDirectoryRole(args: {
  eventId: string;
  personId: string;
  roleId: string;
  user: DirectoryUser;
}): Promise<{ removed: boolean }> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const role = await getPrisma().eventDirectoryRole.findUnique({
    where: { id: args.roleId },
    select: { id: true, eventId: true, personId: true, role: true, person: { select: { displayName: true } } },
  });
  if (!role || role.personId !== args.personId) {
    throw new DirectoryServiceError("DIRECTORY_ROLE_NOT_FOUND", "Directory role not found", 404);
  }
  if (role.eventId !== args.eventId) {
    throw new DirectoryServiceError("DIRECTORY_PERSON_EVENT_MISMATCH", "Role belongs to a different event", 404);
  }
  // Removing a role never deletes the person, even if it was the last role.
  await getPrisma().$transaction(async (tx) => {
    await tx.eventDirectoryRole.delete({ where: { id: args.roleId } });
    await recordEventActivity(tx, {
      eventId: args.eventId,
      actor: { kind: "USER", userId: args.user.id },
      module: "EVENT_DIRECTORY",
      action: "UNASSIGNED",
      entityType: "DirectoryRole",
      entityId: args.personId,
      entityLabel: role.person?.displayName ?? "Contact",
      message: `Removed ${role.role} role from "${role.person?.displayName ?? "contact"}"`,
    });
  });
  return { removed: true };
}

// ---------------------------------------------------------------------------
// Module linking
// ---------------------------------------------------------------------------

export async function linkDirectoryPersonToModuleRecord(args: {
  eventId: string;
  personId: string;
  module: EventDirectoryModuleType;
  moduleRecordId: string;
  user?: DirectoryUser;
}): Promise<{ created: boolean; linkId: string }> {
  if (args.user) await assertEventAccessForUser(args.eventId, args.user, "write");
  const person = await getPrisma().eventDirectoryPerson.findUnique({
    where: { id: args.personId },
    select: { id: true, eventId: true },
  });
  if (!person) throw new DirectoryServiceError("DIRECTORY_PERSON_NOT_FOUND", "Directory person not found", 404);
  assertSameEvent(person, args.eventId);

  const existing = await getPrisma().eventDirectoryModuleLink.findUnique({
    where: {
      eventId_module_moduleRecordId: {
        eventId: args.eventId,
        module: args.module,
        moduleRecordId: args.moduleRecordId,
      },
    },
    select: { id: true },
  });
  if (existing) return { created: false, linkId: existing.id };

  const created = await getPrisma().eventDirectoryModuleLink.create({
    data: {
      eventId: args.eventId,
      personId: args.personId,
      module: args.module,
      moduleRecordId: args.moduleRecordId,
    },
    select: { id: true },
  });
  return { created: true, linkId: created.id };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export async function mergeEventDirectoryPeople(args: {
  eventId: string;
  sourcePersonId: string;
  targetPersonId: string;
  user: DirectoryUser;
}): Promise<{ targetPersonId: string }> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  if (args.sourcePersonId === args.targetPersonId) {
    throw new DirectoryServiceError("DIRECTORY_MERGE_INVALID", "Cannot merge a person into themselves", 400);
  }
  const [source, target] = await Promise.all([
    getPrisma().eventDirectoryPerson.findUnique({
      where: { id: args.sourcePersonId },
      select: { id: true, eventId: true, displayName: true },
    }),
    getPrisma().eventDirectoryPerson.findUnique({
      where: { id: args.targetPersonId },
      select: { id: true, eventId: true, displayName: true },
    }),
  ]);
  if (!source || !target) {
    throw new DirectoryServiceError("DIRECTORY_PERSON_NOT_FOUND", "Merge person not found", 404);
  }
  if (source.eventId !== args.eventId || target.eventId !== args.eventId) {
    throw new DirectoryServiceError("DIRECTORY_PERSON_EVENT_MISMATCH", "Cross-event merge is not allowed", 400);
  }

  await getPrisma().$transaction(async (tx) => {
    // Roles: move non-duplicate role types, drop duplicates.
    const [sourceRoles, targetRoles] = await Promise.all([
      tx.eventDirectoryRole.findMany({ where: { personId: source.id }, select: { id: true, role: true } }),
      tx.eventDirectoryRole.findMany({ where: { personId: target.id }, select: { role: true } }),
    ]);
    const targetRoleSet = new Set(targetRoles.map((r) => r.role));
    for (const role of sourceRoles) {
      if (targetRoleSet.has(role.role)) {
        await tx.eventDirectoryRole.delete({ where: { id: role.id } });
      } else {
        await tx.eventDirectoryRole.update({ where: { id: role.id }, data: { personId: target.id } });
        targetRoleSet.add(role.role);
      }
    }

    // External identities: move where (provider, externalPersonId) free, else drop.
    const [sourceIdentities, targetIdentities] = await Promise.all([
      tx.eventDirectoryExternalIdentity.findMany({
        where: { personId: source.id },
        select: { id: true, provider: true, externalPersonId: true },
      }),
      tx.eventDirectoryExternalIdentity.findMany({
        where: { personId: target.id },
        select: { provider: true, externalPersonId: true },
      }),
    ]);
    const targetIdentityKeys = new Set(targetIdentities.map((i) => `${i.provider}::${i.externalPersonId}`));
    for (const identity of sourceIdentities) {
      const key = `${identity.provider}::${identity.externalPersonId}`;
      if (targetIdentityKeys.has(key)) {
        await tx.eventDirectoryExternalIdentity.delete({ where: { id: identity.id } });
      } else {
        await tx.eventDirectoryExternalIdentity.update({ where: { id: identity.id }, data: { personId: target.id } });
        targetIdentityKeys.add(key);
      }
    }

    // Module links: move where (module, moduleRecordId) free, else drop.
    const [sourceLinks, targetLinks] = await Promise.all([
      tx.eventDirectoryModuleLink.findMany({
        where: { personId: source.id },
        select: { id: true, module: true, moduleRecordId: true },
      }),
      tx.eventDirectoryModuleLink.findMany({
        where: { personId: target.id },
        select: { module: true, moduleRecordId: true },
      }),
    ]);
    const targetLinkKeys = new Set(targetLinks.map((l) => `${l.module}::${l.moduleRecordId}`));
    for (const link of sourceLinks) {
      const key = `${link.module}::${link.moduleRecordId}`;
      if (targetLinkKeys.has(key)) {
        await tx.eventDirectoryModuleLink.delete({ where: { id: link.id } });
      } else {
        await tx.eventDirectoryModuleLink.update({ where: { id: link.id }, data: { personId: target.id } });
        targetLinkKeys.add(key);
      }
    }

    // Preserve import history: repoint matched rows at the surviving person.
    await tx.eventDirectoryImportRow.updateMany({
      where: { matchedPersonId: source.id },
      data: { matchedPersonId: target.id },
    });

    // Tombstone the source person (never hard-deleted to preserve audit/history).
    await tx.eventDirectoryPerson.update({
      where: { id: source.id },
      data: { status: "MERGED", deletedAt: new Date(), updatedByUserId: args.user.id },
    });

    await recordEventActivity(tx, {
      eventId: args.eventId,
      actor: { kind: "USER", userId: args.user.id },
      module: "EVENT_DIRECTORY",
      action: "MERGED",
      entityType: "DirectoryPerson",
      entityId: target.id,
      entityLabel: target.displayName,
      message: `Merged "${source.displayName}" into "${target.displayName}"`,
    });
  });

  return { targetPersonId: target.id };
}

// ---------------------------------------------------------------------------
// Import visibility (processing lives in Prompt 5)
// ---------------------------------------------------------------------------

export async function getEventDirectoryImportBatch(args: {
  eventId: string;
  batchId: string;
  user: DirectoryUser;
}) {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  const batch = await getPrisma().eventDirectoryImportBatch.findUnique({ where: { id: args.batchId } });
  if (!batch || batch.eventId !== args.eventId) {
    throw new DirectoryServiceError("DIRECTORY_IMPORT_NOT_FOUND", "Import batch not found", 404);
  }
  return batch;
}

export async function listEventDirectoryImportRows(args: {
  eventId: string;
  batchId: string;
  user: DirectoryUser;
}) {
  await assertEventAccessForUser(args.eventId, args.user, "read");
  const batch = await getPrisma().eventDirectoryImportBatch.findUnique({
    where: { id: args.batchId },
    select: { id: true, eventId: true },
  });
  if (!batch || batch.eventId !== args.eventId) {
    throw new DirectoryServiceError("DIRECTORY_IMPORT_NOT_FOUND", "Import batch not found", 404);
  }
  return getPrisma().eventDirectoryImportRow.findMany({
    where: { batchId: args.batchId },
    orderBy: { rowNumber: "asc" },
  });
}

// ---------------------------------------------------------------------------
// CSV import processing
// ---------------------------------------------------------------------------

export type DirectoryImportRowInput = {
  rowNumber: number;
  rawName: string | null;
  rawEmail: string | null;
  rawCompany: string | null;
  /** Server-side parse result from lib/event-directory-import (re-validated, not trusted from UI). */
  parse: DirectoryRowParseResult;
};

/**
 * Process a mapped CSV into the directory: match by normalized email (update),
 * create when new, flag no-email name+company collisions as DUPLICATE_REVIEW
 * (never auto-merged), add the target role idempotently, and persist the batch +
 * per-row results. Re-importing a corrected file updates by email and never
 * duplicates roles. No one is deleted during import.
 */
export async function processDirectoryCsvImport(args: {
  eventId: string;
  user: DirectoryUser;
  sourceLabel: string;
  targetRole: string;
  sourceType?: EventDirectorySourceType;
  fileName?: string | null;
  rows: DirectoryImportRowInput[];
}): Promise<{ batchId: string; counts: ImportCounts }> {
  await assertEventAccessForUser(args.eventId, args.user, "write");
  const targetRole = assertValidRole(args.targetRole);
  const sourceType = args.sourceType ?? "CSV_IMPORT";
  const sourceLabel = args.sourceLabel.trim() || "CSV import";

  const event = await getPrisma().event.findUnique({
    where: { id: args.eventId },
    select: { orgId: true, clientId: true },
  });
  if (!event) throw new DirectoryServiceError("DIRECTORY_VALIDATION", "Event not found", 404);

  const sourceId = await createOrReuseEventDirectorySource({
    eventId: args.eventId,
    type: sourceType,
    label: sourceLabel,
    createdByUserId: args.user.id,
  });

  const batch = await getPrisma().eventDirectoryImportBatch.create({
    data: {
      eventId: args.eventId,
      sourceId,
      fileName: args.fileName ?? null,
      uploadedByUserId: args.user.id,
      targetRole,
      sourceLabel,
      totalRows: args.rows.length,
      status: "PROCESSING",
    },
    select: { id: true },
  });

  const counts: ImportCounts = { created: 0, updated: 0, duplicateReview: 0, invalid: 0, skipped: 0 };

  for (const row of args.rows) {
    const outcome = await processImportRow({
      eventId: args.eventId,
      orgId: event.orgId,
      clientId: event.clientId,
      batchId: batch.id,
      userId: args.user.id,
      role: targetRole,
      sourceId,
      row,
    });
    counts[outcome] += 1;
  }

  await getPrisma().eventDirectoryImportBatch.update({
    where: { id: batch.id },
    data: {
      status: "COMPLETE",
      createdCount: counts.created,
      updatedCount: counts.updated,
      duplicateCount: counts.duplicateReview,
      invalidCount: counts.invalid,
      skippedCount: counts.skipped,
    },
  });

  // One summary entry per import batch — never one per row.
  await recordEventActivity(getPrisma(), {
    eventId: args.eventId,
    actor: { kind: "USER", userId: args.user.id },
    module: "EVENT_DIRECTORY",
    action: "IMPORTED",
    entityType: "DirectoryImportBatch",
    entityId: batch.id,
    entityLabel: sourceLabel,
    message: `Imported directory contacts (${counts.created} created, ${counts.updated} updated, ${counts.duplicateReview} for review, ${counts.invalid} invalid)`,
    source: { type: "DirectoryImportBatch", id: batch.id },
  });

  return { batchId: batch.id, counts };
}

export type ImportCounts = {
  created: number;
  updated: number;
  duplicateReview: number;
  invalid: number;
  skipped: number;
};

type ImportOutcomeKey = "created" | "updated" | "duplicateReview" | "invalid" | "skipped";

async function ensureRole(
  tx: Prisma.TransactionClient,
  eventId: string,
  personId: string,
  role: EventDirectoryRoleType,
  sourceId: string,
  userId: string,
): Promise<void> {
  await tx.eventDirectoryRole.createMany({
    data: [{ eventId, personId, role, sourceId, createdByUserId: userId }],
    skipDuplicates: true,
  });
}

async function processImportRow(ctx: {
  eventId: string;
  orgId: string;
  clientId: string | null;
  batchId: string;
  userId: string;
  role: EventDirectoryRoleType;
  sourceId: string;
  row: DirectoryImportRowInput;
}): Promise<ImportOutcomeKey> {
  const prisma = getPrisma();
  const { row } = ctx;

  if (row.parse.result === "invalid") {
    await prisma.eventDirectoryImportRow.create({
      data: {
        eventId: ctx.eventId,
        batchId: ctx.batchId,
        rowNumber: row.rowNumber,
        rawName: row.rawName,
        rawEmail: row.rawEmail,
        rawCompany: row.rawCompany,
        result: "INVALID",
        errorMessage: row.parse.reason,
      },
    });
    return "invalid";
  }

  const parsed = row.parse.parsed;

  // 1) Deterministic email match -> update existing.
  if (parsed.normalizedEmail) {
    const existing = await prisma.eventDirectoryPerson.findFirst({
      where: { eventId: ctx.eventId, normalizedEmail: parsed.normalizedEmail, status: { notIn: ["MERGED"] } },
      select: { id: true },
    });
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await tx.eventDirectoryPerson.update({
          where: { id: existing.id },
          data: {
            firstName: parsed.firstName ?? undefined,
            lastName: parsed.lastName ?? undefined,
            phone: parsed.phone ?? undefined,
            company: parsed.company ?? undefined,
            title: parsed.title ?? undefined,
            displayName: parsed.displayName,
            // Re-activate a previously removed person being re-imported.
            status: "ACTIVE",
            updatedByUserId: ctx.userId,
          },
        });
        await ensureRole(tx, ctx.eventId, existing.id, ctx.role, ctx.sourceId, ctx.userId);
      });
      await recordImportRow(ctx, row, "UPDATED", existing.id);
      return "updated";
    }
  }

  // 2) No email: a name+company collision is a possible duplicate (never auto-merged).
  let status: EventDirectoryPersonStatus = "ACTIVE";
  let matchedCandidateId: string | null = null;
  if (!parsed.normalizedEmail) {
    const dup = await detectDirectoryDuplicate({
      eventId: ctx.eventId,
      displayName: parsed.displayName,
      company: parsed.company,
    });
    if (dup && dup.matchType === "name_company") {
      status = "DUPLICATE_REVIEW";
      matchedCandidateId = dup.person.id;
    }
  }

  // 3) Create a new person and add the target role.
  const created = await prisma.$transaction(async (tx) => {
    const person = await tx.eventDirectoryPerson.create({
      data: {
        orgId: ctx.orgId,
        clientId: ctx.clientId,
        eventId: ctx.eventId,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        displayName: parsed.displayName,
        email: parsed.email,
        normalizedEmail: parsed.normalizedEmail,
        phone: parsed.phone,
        company: parsed.company,
        title: parsed.title,
        status,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      },
      select: { id: true },
    });
    await ensureRole(tx, ctx.eventId, person.id, ctx.role, ctx.sourceId, ctx.userId);
    return person;
  });

  const result = status === "DUPLICATE_REVIEW" ? "DUPLICATE_REVIEW" : "CREATED";
  await recordImportRow(ctx, row, result, matchedCandidateId ?? created.id);
  return status === "DUPLICATE_REVIEW" ? "duplicateReview" : "created";
}

async function recordImportRow(
  ctx: { eventId: string; batchId: string },
  row: DirectoryImportRowInput,
  result: "CREATED" | "UPDATED" | "DUPLICATE_REVIEW",
  matchedPersonId: string | null,
): Promise<void> {
  const parsed = row.parse.result === "ok" ? row.parse.parsed : null;
  await getPrisma().eventDirectoryImportRow.create({
    data: {
      eventId: ctx.eventId,
      batchId: ctx.batchId,
      rowNumber: row.rowNumber,
      rawName: row.rawName,
      rawEmail: row.rawEmail,
      rawCompany: row.rawCompany,
      parsedFirstName: parsed?.firstName ?? null,
      parsedLastName: parsed?.lastName ?? null,
      parsedEmail: parsed?.email ?? null,
      result,
      matchedPersonId,
    },
  });
}
