import { EventMemberRole, Prisma, UserRole, type PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getPrisma } from "@/lib/prisma";

export type PlatformAccountAdmin = Readonly<{
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
}>;

export type PlatformAccountSummary = Readonly<{
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  userCount: number;
  memberCount: number;
  eventCount: number;
  primaryAdmin: PlatformAccountAdmin | null;
}>;

export type CreatePlatformAccountInput = Readonly<{
  name?: unknown;
  slug?: unknown;
}>;

type PlatformAdminDbClient = Pick<PrismaClient, "organization">;
type PlatformAccountUsersDbClient = Pick<PrismaClient, "organization" | "user" | "membership">;
type PlatformAccountEventsDbClient = Pick<
  PrismaClient,
  "organization" | "event" | "eventMember" | "user" | "membership"
>;
type PlatformDiscoveryDbClient = Pick<PrismaClient, "organization" | "user" | "event" | "eventMember" | "membership">;
type PlatformDeletionDbClient = Pick<
  PrismaClient,
  "organization" | "user" | "event" | "eventMember" | "membership" | "client" | "document" | "documentTag" | "task" | "fnbParserFeedback" | "copilotAuditLog" | "$transaction"
>;

type OrganizationAccountRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    users: number;
    memberships: number;
    events: number;
  };
  users: Array<{
    id: string;
    name: string | null;
    email: string;
    role: UserRole;
  }>;
};

export class PlatformAdminServiceError extends Error {
  status: number;
  reason: string;

  constructor(message: string, status = 400, reason = "PLATFORM_ADMIN_SERVICE_ERROR") {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export type PlatformAccountUserSummary = Readonly<{
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  orgId: string;
  membershipId: string;
  membershipStatus: "MEMBER";
  membershipCreatedAt: Date;
  userCreatedAt: Date;
  eventAccessCount: number;
  hasEventAccess: boolean;
  eventAccessStatus: "HAS_EVENT_ACCESS" | "NO_EVENT_ACCESS_ASSIGNED";
}>;

export type PlatformAccountUserMutationResult = Readonly<{
  action: "linked" | "updated" | "removed";
  user?: PlatformAccountUserSummary;
  userId: string;
  orgId: string;
}>;

export type PlatformAccountUserInput = Readonly<{
  email?: unknown;
  name?: unknown;
  role?: unknown;
  mode?: unknown;
}>;

export type PlatformAccountUserRoleInput = Readonly<{
  role?: unknown;
}>;

export type PlatformAccountEventSummary = Readonly<{
  id: string;
  orgId: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  eventMemberCount: number;
}>;

export type PlatformAccountEventMemberSummary = Readonly<{
  id: string;
  eventId: string;
  userId: string;
  eventRole: EventMemberRole;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: UserRole;
    orgId: string;
  };
}>;

export type PlatformEventAccessMutationInput = Readonly<{
  userId?: unknown;
  eventRole?: unknown;
}>;

export type PlatformEventAccessMutationResult = Readonly<{
  action: "granted" | "updated" | "revoked";
  orgId: string;
  eventId: string;
  userId: string;
  eventMember?: PlatformAccountEventMemberSummary;
}>;

export type PlatformOrgContext = Readonly<{
  orgId: string;
  account: PlatformAccountSummary;
}>;

export type PlatformPage = Readonly<{ page: number; pageSize: number; total: number; pageCount: number }>;
export type PlatformAccountQuery = Readonly<{
  search?: string | null;
  primaryAdmin?: "present" | "missing" | null;
  zeroUsers?: boolean;
  zeroEvents?: boolean;
  sort?: "name" | "createdAt" | "updatedAt" | "userCount" | "eventCount" | "primaryAdmin";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}>;
export type PlatformAccountPage = Readonly<{ accounts: PlatformAccountSummary[]; page: PlatformPage }>;

export type PlatformUserMembershipSummary = Readonly<{
  membershipId: string;
  orgId: string;
  accountName: string;
  accountSlug: string;
  membershipCreatedAt: Date;
  eventAccessCount: number;
  eventAccess: Array<{ eventId: string; eventName: string; eventRole: EventMemberRole }>;
}>;
export type PlatformUserSummary = Readonly<{
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  createdAt: Date;
  accountCount: number;
  totalEventAccessGrants: number;
  memberships: PlatformUserMembershipSummary[];
}>;
export type PlatformUserQuery = Readonly<{
  search?: string | null;
  role?: UserRole | null;
  accountId?: string | null;
  hasEventAccess?: boolean | null;
  sort?: "name" | "email" | "createdAt" | "role";
  direction?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}>;
export type PlatformUserPage = Readonly<{ users: PlatformUserSummary[]; page: PlatformPage }>;
export type PlatformSearchResult = Readonly<{
  accounts: PlatformAccountSummary[];
  users: PlatformUserSummary[];
  events: Array<{ id: string; name: string; orgId: string; accountName: string; accountSlug: string; startDate: Date; endDate: Date | null }>;
}>;
export type PlatformAccountDeletionPreflight = Readonly<{
  account: PlatformAccountSummary;
  counts: { users: number; memberships: number; events: number; eventAccessGrants: number; clients: number; documents: number; documentTags: number; tasks: number; parserFeedback: number; auditLogs: number };
  blockers: string[];
  activeContext: boolean;
  canDelete: boolean;
}>;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PLATFORM_CONTEXT_COOKIE_NAME = "platformActiveOrgId";
export const PLATFORM_CONTEXT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const ACCOUNT_USER_ROLES = [UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER, UserRole.VIEWER] as const;
const ACCOUNT_USER_ROLE_SET = new Set<UserRole>(ACCOUNT_USER_ROLES);
const EVENT_MEMBER_ROLES = [
  EventMemberRole.EVENT_ADMIN,
  EventMemberRole.EVENT_EDITOR,
  EventMemberRole.EVENT_VIEWER,
] as const;
const EVENT_MEMBER_ROLE_SET = new Set<EventMemberRole>(EVENT_MEMBER_ROLES);

const accountSelect = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      users: true,
      memberships: true,
      events: true,
    },
  },
  users: {
    where: {
      role: {
        in: [UserRole.OWNER, UserRole.ADMIN],
      },
    },
    orderBy: [{ createdAt: "asc" }, { email: "asc" }],
    take: 10,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  },
} satisfies Prisma.OrganizationSelect;

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
}

function assertUuid(value: string, field: string): void {
  if (!UUID_REGEX.test(value)) {
    throw new PlatformAdminServiceError(`${field} must be a valid UUID`, 400, "INVALID_UUID");
  }
}

function normalizeEmail(value: unknown): string {
  const email = normalizeText(value)?.toLowerCase() ?? null;
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new PlatformAdminServiceError("Email must be a valid email address", 400, "INVALID_EMAIL");
  }
  return email;
}

function normalizeAccountUserRole(value: unknown): UserRole {
  if (typeof value !== "string" || !ACCOUNT_USER_ROLE_SET.has(value as UserRole)) {
    throw new PlatformAdminServiceError(
      "Role must be one of OWNER, ADMIN, MEMBER, VIEWER",
      400,
      "INVALID_ACCOUNT_USER_ROLE",
    );
  }
  return value as UserRole;
}

function normalizeEventMemberRole(value: unknown): EventMemberRole {
  if (typeof value !== "string" || !EVENT_MEMBER_ROLE_SET.has(value as EventMemberRole)) {
    throw new PlatformAdminServiceError(
      "Event role must be one of EVENT_ADMIN, EVENT_EDITOR, EVENT_VIEWER",
      400,
      "INVALID_EVENT_MEMBER_ROLE",
    );
  }
  return value as EventMemberRole;
}

async function ensurePlatformAccountExists(
  orgId: string,
  db: PlatformAccountUsersDbClient | PlatformAccountEventsDbClient,
): Promise<void> {
  assertUuid(orgId, "orgId");
  const account = await db.organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!account) {
    throw new PlatformAdminServiceError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeSlug(value: unknown, fallbackName: string): string {
  const explicitSlug = normalizeText(value);
  const candidate = explicitSlug ? slugify(explicitSlug) : slugify(fallbackName);

  if (!candidate) {
    throw new PlatformAdminServiceError("Account slug is required", 400, "ACCOUNT_SLUG_REQUIRED");
  }

  if (candidate.length > 80) {
    throw new PlatformAdminServiceError("Account slug must be 80 characters or fewer", 400, "ACCOUNT_SLUG_TOO_LONG");
  }

  return candidate;
}

function normalizeCreateInput(input: CreatePlatformAccountInput): { name: string; slug: string } {
  const name = normalizeText(input.name);
  if (!name) {
    throw new PlatformAdminServiceError("Account name is required", 400, "ACCOUNT_NAME_REQUIRED");
  }

  if (name.length > 160) {
    throw new PlatformAdminServiceError("Account name must be 160 characters or fewer", 400, "ACCOUNT_NAME_TOO_LONG");
  }

  return {
    name,
    slug: normalizeSlug(input.slug, name),
  };
}

function pickPrimaryAdmin(users: OrganizationAccountRow["users"]): PlatformAccountAdmin | null {
  const primary = users.find((user) => user.role === UserRole.OWNER) ?? users[0] ?? null;
  if (!primary) return null;

  return {
    id: primary.id,
    name: primary.name,
    email: primary.email,
    role: primary.role,
  };
}

function toAccountSummary(row: OrganizationAccountRow): PlatformAccountSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    userCount: row._count.users,
    memberCount: row._count.memberships,
    eventCount: row._count.events,
    primaryAdmin: pickPrimaryAdmin(row.users),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function getPlatformAccountById(
  orgId: string,
  db: PlatformAdminDbClient = getPrisma(),
): Promise<PlatformAccountSummary> {
  assertUuid(orgId, "orgId");

  const account = await db.organization.findUnique({
    where: { id: orgId },
    select: accountSelect,
  });
  if (!account) {
    throw new PlatformAdminServiceError("Account not found", 404, "ACCOUNT_NOT_FOUND");
  }

  return toAccountSummary(account as OrganizationAccountRow);
}

export function platformContextCookieOptions() {
  return {
    name: PLATFORM_CONTEXT_COOKIE_NAME,
    path: "/",
    sameSite: "lax" as const,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: PLATFORM_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  };
}

async function readPlatformContextOrgId(request?: NextRequest): Promise<string | null> {
  if (request) {
    return request.cookies.get(PLATFORM_CONTEXT_COOKIE_NAME)?.value?.trim() || null;
  }

  const cookieStore = await cookies();
  return cookieStore.get(PLATFORM_CONTEXT_COOKIE_NAME)?.value?.trim() || null;
}

export async function setActivePlatformOrgContext(
  request: NextRequest,
  orgId: string,
  db: PlatformAdminDbClient = getPrisma(),
): Promise<PlatformOrgContext> {
  void request;
  const account = await getPlatformAccountById(orgId, db);
  return {
    orgId: account.id,
    account,
  };
}

export async function getActivePlatformOrgContext(
  request?: NextRequest,
  db: PlatformAdminDbClient = getPrisma(),
): Promise<PlatformOrgContext | null> {
  const orgId = await readPlatformContextOrgId(request);
  if (!orgId || !UUID_REGEX.test(orgId)) return null;

  try {
    const account = await getPlatformAccountById(orgId, db);
    return {
      orgId: account.id,
      account,
    };
  } catch (error) {
    if (error instanceof PlatformAdminServiceError && error.reason === "ACCOUNT_NOT_FOUND") {
      return null;
    }
    throw error;
  }
}

export async function clearActivePlatformOrgContext(request?: NextRequest): Promise<{ cleared: true }> {
  void request;
  return { cleared: true };
}

export async function listPlatformAccounts(
  db: PlatformAdminDbClient = getPrisma(),
): Promise<PlatformAccountSummary[]> {
  const accounts = await db.organization.findMany({
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: accountSelect,
  });

  return (accounts as OrganizationAccountRow[]).map(toAccountSummary);
}

export async function createPlatformAccount(
  input: CreatePlatformAccountInput,
  db: PlatformAdminDbClient = getPrisma(),
): Promise<PlatformAccountSummary> {
  const data = normalizeCreateInput(input);

  const existing = await db.organization.findUnique({
    where: { slug: data.slug },
    select: { id: true },
  });
  if (existing) {
    throw new PlatformAdminServiceError("Account slug is already in use", 409, "ACCOUNT_SLUG_CONFLICT");
  }

  try {
    const account = await db.organization.create({
      data,
      select: accountSelect,
    });

    return toAccountSummary(account as OrganizationAccountRow);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new PlatformAdminServiceError("Account slug is already in use", 409, "ACCOUNT_SLUG_CONFLICT");
    }
    throw error;
  }
}

type AccountMembershipRow = {
  id: string;
  orgId: string;
  userId: string;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: UserRole;
    orgId: string;
    createdAt: Date;
    eventMemberships: Array<{ id: string }>;
  };
};

function toAccountUserSummary(row: AccountMembershipRow): PlatformAccountUserSummary {
  const eventAccessCount = row.user.eventMemberships.length;

  return {
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    role: row.user.role,
    orgId: row.user.orgId,
    membershipId: row.id,
    membershipStatus: "MEMBER",
    membershipCreatedAt: row.createdAt,
    userCreatedAt: row.user.createdAt,
    eventAccessCount,
    hasEventAccess: eventAccessCount > 0,
    eventAccessStatus: eventAccessCount > 0 ? "HAS_EVENT_ACCESS" : "NO_EVENT_ACCESS_ASSIGNED",
  };
}

async function getAccountUserOrThrow(
  orgId: string,
  userId: string,
  db: PlatformAccountUsersDbClient,
): Promise<PlatformAccountUserSummary> {
  assertUuid(orgId, "orgId");
  assertUuid(userId, "userId");

  const membership = await db.membership.findUnique({
    where: {
      orgId_userId: {
        orgId,
        userId,
      },
    },
    select: {
      id: true,
      orgId: true,
      userId: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          orgId: true,
          createdAt: true,
          eventMemberships: {
            where: {
              event: {
                orgId,
              },
            },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!membership) {
    throw new PlatformAdminServiceError("Account membership not found", 404, "ACCOUNT_USER_NOT_FOUND");
  }

  return toAccountUserSummary(membership as AccountMembershipRow);
}

export async function listPlatformAccountUsers(
  orgId: string,
  db: PlatformAccountUsersDbClient = getPrisma(),
): Promise<PlatformAccountUserSummary[]> {
  await ensurePlatformAccountExists(orgId, db);

  const memberships = await db.membership.findMany({
    where: { orgId },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    select: {
      id: true,
      orgId: true,
      userId: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          orgId: true,
          createdAt: true,
          eventMemberships: {
            where: {
              event: {
                orgId,
              },
            },
            select: { id: true },
          },
        },
      },
    },
  });

  return (memberships as AccountMembershipRow[]).map(toAccountUserSummary);
}

export async function createPlatformAccountUser(
  orgId: string,
  input: PlatformAccountUserInput,
  db: PlatformAccountUsersDbClient = getPrisma(),
): Promise<PlatformAccountUserMutationResult> {
  const mode = typeof input.mode === "string" ? input.mode : "addExisting";
  if (mode === "create") {
    throw new PlatformAdminServiceError(
      "Creating auth-capable users is deferred to the invite flow",
      400,
      "USER_CREATION_DEFERRED",
    );
  }

  return addExistingUserToAccount(orgId, input, db);
}

export async function addExistingUserToAccount(
  orgId: string,
  input: PlatformAccountUserInput,
  db: PlatformAccountUsersDbClient = getPrisma(),
): Promise<PlatformAccountUserMutationResult> {
  await ensurePlatformAccountExists(orgId, db);
  const email = normalizeEmail(input.email);
  const role = normalizeAccountUserRole(input.role);

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (!existingUser) {
    throw new PlatformAdminServiceError(
      "Existing app user not found",
      404,
      "EXISTING_USER_NOT_FOUND",
    );
  }

  const existingMembership = await db.membership.findUnique({
    where: {
      orgId_userId: {
        orgId,
        userId: existingUser.id,
      },
    },
    select: { id: true },
  });
  if (existingMembership) {
    throw new PlatformAdminServiceError(
      "User is already linked to this account",
      409,
      "ACCOUNT_MEMBERSHIP_ALREADY_EXISTS",
    );
  }

  if (existingUser.role !== UserRole.SUPER_ADMIN) {
    await db.user.update({
      where: { id: existingUser.id },
      data: {
        orgId,
        role,
        ...(normalizeText(input.name) ? { name: normalizeText(input.name) } : {}),
      },
      select: { id: true },
    });
  }

  try {
    await db.membership.create({
      data: {
        orgId,
        userId: existingUser.id,
      },
      select: { id: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new PlatformAdminServiceError(
        "User is already linked to this account",
        409,
        "ACCOUNT_MEMBERSHIP_ALREADY_EXISTS",
      );
    }
    throw error;
  }

  return {
    action: "linked",
    orgId,
    userId: existingUser.id,
    user: await getAccountUserOrThrow(orgId, existingUser.id, db),
  };
}

export async function updatePlatformAccountUserRole(
  orgId: string,
  userId: string,
  input: PlatformAccountUserRoleInput,
  db: PlatformAccountUsersDbClient = getPrisma(),
): Promise<PlatformAccountUserMutationResult> {
  await ensurePlatformAccountExists(orgId, db);
  const role = normalizeAccountUserRole(input.role);
  const current = await getAccountUserOrThrow(orgId, userId, db);
  if (current.role === UserRole.SUPER_ADMIN) {
    throw new PlatformAdminServiceError(
      "PlatformAdmin role changes are deferred to a hardening prompt",
      400,
      "PLATFORM_ADMIN_ROLE_DEFERRED",
    );
  }

  await db.user.update({
    where: { id: userId },
    data: {
      role,
      orgId,
    },
    select: { id: true },
  });

  return {
    action: "updated",
    orgId,
    userId,
    user: await getAccountUserOrThrow(orgId, userId, db),
  };
}

export async function removeUserFromAccount(
  orgId: string,
  userId: string,
  db: PlatformAccountUsersDbClient = getPrisma(),
): Promise<PlatformAccountUserMutationResult> {
  await ensurePlatformAccountExists(orgId, db);
  const current = await getAccountUserOrThrow(orgId, userId, db);
  if (current.role === UserRole.SUPER_ADMIN) {
    throw new PlatformAdminServiceError(
      "PlatformAdmin membership removal is deferred to a hardening prompt",
      400,
      "PLATFORM_ADMIN_ROLE_DEFERRED",
    );
  }

  if (current.eventAccessCount > 0) {
    throw new PlatformAdminServiceError(
      "Remove event access before removing this account membership",
      409,
      "EVENT_ACCESS_CLEANUP_REQUIRED",
    );
  }

  const alternateMembership = await db.membership.findFirst({
    where: {
      userId,
      orgId: {
        not: orgId,
      },
    },
    orderBy: [{ createdAt: "asc" }, { orgId: "asc" }],
    select: { orgId: true },
  });

  if (current.orgId === orgId && !alternateMembership) {
    throw new PlatformAdminServiceError(
      "Cannot remove the user's only account while User.orgId is required by the schema",
      409,
      "PRIMARY_ORG_REQUIRES_ALTERNATE_MEMBERSHIP",
    );
  }

  await db.membership.delete({
    where: {
      orgId_userId: {
        orgId,
        userId,
      },
    },
    select: { id: true },
  });

  if (current.orgId === orgId && alternateMembership) {
    await db.user.update({
      where: { id: userId },
      data: { orgId: alternateMembership.orgId },
      select: { id: true },
    });
  }

  const remaining = await db.membership.findUnique({
    where: {
      orgId_userId: {
        orgId,
        userId,
      },
    },
    select: { id: true },
  });
  if (remaining) {
    throw new PlatformAdminServiceError(
      "Account membership could not be removed",
      500,
      "ACCOUNT_USER_REMOVE_FAILED",
    );
  }

  return {
    action: "removed",
    orgId,
    userId,
  };
}

type AccountEventRow = {
  id: string;
  orgId: string;
  name: string;
  clientId: string | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
  client: {
    id: string;
    name: string;
  } | null;
  _count: {
    eventMembers: number;
  };
};

type AccountEventMemberRow = {
  id: string;
  eventId: string;
  userId: string;
  eventRole: EventMemberRole;
  createdAt: Date;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: UserRole;
    orgId: string;
  };
};

function toAccountEventSummary(row: AccountEventRow): PlatformAccountEventSummary {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    clientId: row.clientId,
    clientName: row.client?.name ?? null,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    eventMemberCount: row._count.eventMembers,
  };
}

function toAccountEventMemberSummary(row: AccountEventMemberRow): PlatformAccountEventMemberSummary {
  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    eventRole: row.eventRole,
    createdAt: row.createdAt,
    user: {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: row.user.role,
      orgId: row.user.orgId,
    },
  };
}

async function ensureAccountEventExists(
  orgId: string,
  eventId: string,
  db: PlatformAccountEventsDbClient,
): Promise<void> {
  assertUuid(orgId, "orgId");
  assertUuid(eventId, "eventId");

  const event = await db.event.findFirst({
    where: { id: eventId, orgId },
    select: { id: true },
  });
  if (!event) {
    throw new PlatformAdminServiceError("Event not found for this account", 404, "ACCOUNT_EVENT_NOT_FOUND");
  }
}

async function ensureAccountUserBelongsToOrg(
  orgId: string,
  userId: string,
  db: PlatformAccountEventsDbClient,
): Promise<void> {
  assertUuid(orgId, "orgId");
  assertUuid(userId, "userId");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      orgId: true,
      memberships: {
        where: { orgId },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user || (user.orgId !== orgId && user.memberships.length === 0)) {
    throw new PlatformAdminServiceError("User does not belong to this account", 404, "ACCOUNT_USER_NOT_FOUND");
  }
}

async function getEventMemberOrThrow(
  orgId: string,
  eventId: string,
  userId: string,
  db: PlatformAccountEventsDbClient,
): Promise<PlatformAccountEventMemberSummary> {
  await ensureAccountEventExists(orgId, eventId, db);

  const eventMember = await db.eventMember.findUnique({
    where: {
      eventId_userId: {
        eventId,
        userId,
      },
    },
    select: {
      id: true,
      eventId: true,
      userId: true,
      eventRole: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          orgId: true,
        },
      },
    },
  });

  if (!eventMember) {
    throw new PlatformAdminServiceError("Event member access not found", 404, "EVENT_MEMBER_NOT_FOUND");
  }

  return toAccountEventMemberSummary(eventMember as AccountEventMemberRow);
}

export async function listPlatformAccountEvents(
  orgId: string,
  db: PlatformAccountEventsDbClient = getPrisma(),
): Promise<PlatformAccountEventSummary[]> {
  await ensurePlatformAccountExists(orgId, db);

  const events = await db.event.findMany({
    where: { orgId },
    orderBy: [{ startDate: "asc" }, { name: "asc" }],
    select: {
      id: true,
      orgId: true,
      name: true,
      clientId: true,
      startDate: true,
      endDate: true,
      status: true,
      client: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          eventMembers: true,
        },
      },
    },
  });

  return (events as AccountEventRow[]).map(toAccountEventSummary);
}

export async function listPlatformAccountEventMembers(
  orgId: string,
  eventId: string,
  db: PlatformAccountEventsDbClient = getPrisma(),
): Promise<PlatformAccountEventMemberSummary[]> {
  await ensureAccountEventExists(orgId, eventId, db);

  const eventMembers = await db.eventMember.findMany({
    where: {
      eventId,
      event: {
        orgId,
      },
      user: {
        OR: [
          { orgId },
          {
            memberships: {
              some: { orgId },
            },
          },
        ],
      },
    },
    orderBy: [{ createdAt: "asc" }, { userId: "asc" }],
    select: {
      id: true,
      eventId: true,
      userId: true,
      eventRole: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          orgId: true,
        },
      },
    },
  });

  return (eventMembers as AccountEventMemberRow[]).map(toAccountEventMemberSummary);
}

export async function grantUserEventAccess(
  orgId: string,
  eventId: string,
  userId: string,
  input: PlatformEventAccessMutationInput,
  db: PlatformAccountEventsDbClient = getPrisma(),
): Promise<PlatformEventAccessMutationResult> {
  await ensureAccountEventExists(orgId, eventId, db);
  await ensureAccountUserBelongsToOrg(orgId, userId, db);

  const eventRole = normalizeEventMemberRole(input.eventRole);
  const existing = await db.eventMember.findUnique({
    where: {
      eventId_userId: {
        eventId,
        userId,
      },
    },
    select: { id: true, eventRole: true },
  });

  await db.eventMember.upsert({
    where: {
      eventId_userId: {
        eventId,
        userId,
      },
    },
    update: { eventRole },
    create: {
      eventId,
      userId,
      eventRole,
    },
    select: { id: true },
  });

  const eventMember = await getEventMemberOrThrow(orgId, eventId, userId, db);
  if (eventMember.eventRole !== eventRole) {
    throw new PlatformAdminServiceError(
      "Event access could not be granted",
      500,
      "EVENT_ACCESS_GRANT_FAILED",
    );
  }

  return {
    action: existing ? "updated" : "granted",
    orgId,
    eventId,
    userId,
    eventMember,
  };
}

export async function revokeUserEventAccess(
  orgId: string,
  eventId: string,
  userId: string,
  db: PlatformAccountEventsDbClient = getPrisma(),
): Promise<PlatformEventAccessMutationResult> {
  await ensureAccountEventExists(orgId, eventId, db);
  await ensureAccountUserBelongsToOrg(orgId, userId, db);

  await db.eventMember.deleteMany({
    where: {
      eventId,
      userId,
      event: {
        orgId,
      },
    },
  });

  const remaining = await db.eventMember.findUnique({
    where: {
      eventId_userId: {
        eventId,
        userId,
      },
    },
    select: { id: true },
  });
  if (remaining) {
    throw new PlatformAdminServiceError(
      "Event access could not be revoked",
      500,
      "EVENT_ACCESS_REVOKE_FAILED",
    );
  }

  return {
    action: "revoked",
    orgId,
    eventId,
    userId,
  };
}

function boundedPage(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isInteger(value) || !value || value < 1) return fallback;
  return Math.min(value, maximum);
}

function platformPage(total: number, input: { page?: number; pageSize?: number }): PlatformPage {
  const pageSize = boundedPage(input.pageSize, 25, 100);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  return { page: Math.min(boundedPage(input.page, 1, 100_000), pageCount), pageSize, total, pageCount };
}

function normalizedSearch(value: string | null | undefined): string | null {
  return normalizeText(value)?.slice(0, 160) ?? null;
}

function toPlatformUserSummary(row: {
  id: string; name: string | null; email: string; role: UserRole; createdAt: Date;
  memberships: Array<{ id: string; orgId: string; createdAt: Date; organization: { name: string; slug: string }; }>;
  eventMemberships: Array<{ eventId: string; eventRole: EventMemberRole; event: { orgId: string; name: string } }>;
}): PlatformUserSummary {
  const grantsByOrg = new Map<string, Array<{ eventId: string; eventName: string; eventRole: EventMemberRole }>>();
  for (const grant of row.eventMemberships) {
    const grants = grantsByOrg.get(grant.event.orgId) ?? [];
    grants.push({ eventId: grant.eventId, eventName: grant.event.name, eventRole: grant.eventRole });
    grantsByOrg.set(grant.event.orgId, grants);
  }
  const memberships = row.memberships.map((membership) => {
    const eventAccess = grantsByOrg.get(membership.orgId) ?? [];
    return {
      membershipId: membership.id,
      orgId: membership.orgId,
      accountName: membership.organization.name,
      accountSlug: membership.organization.slug,
      membershipCreatedAt: membership.createdAt,
      eventAccessCount: eventAccess.length,
      eventAccess,
    };
  });
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt,
    accountCount: memberships.length,
    totalEventAccessGrants: row.eventMemberships.length,
    memberships,
  };
}

const platformUserSelect = {
  id: true, name: true, email: true, role: true, createdAt: true,
  memberships: {
    orderBy: [{ createdAt: "asc" as const }, { orgId: "asc" as const }],
    select: { id: true, orgId: true, createdAt: true, organization: { select: { name: true, slug: true } } },
  },
  eventMemberships: {
    select: { eventId: true, eventRole: true, event: { select: { orgId: true, name: true } } },
  },
} satisfies Prisma.UserSelect;

export async function listPlatformUsers(
  input: PlatformUserQuery = {},
  db: PlatformDiscoveryDbClient = getPrisma(),
): Promise<PlatformUserPage> {
  const search = normalizedSearch(input.search);
  const where: Prisma.UserWhereInput = {
    ...(input.role ? { role: input.role } : {}),
    ...(input.accountId ? { memberships: { some: { orgId: input.accountId } } } : {}),
    ...(input.hasEventAccess === true ? { eventMemberships: { some: {} } } : {}),
    ...(input.hasEventAccess === false ? { eventMemberships: { none: {} } } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { memberships: { some: { organization: { OR: [
          { name: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
        ] } } } },
      ],
    } : {}),
  };
  const pageSeed = platformPage(0, input);
  const sort = input.sort ?? "createdAt";
  const direction = input.direction ?? "desc";
  const orderBy: Prisma.UserOrderByWithRelationInput[] = sort === "name"
    ? [{ name: direction }, { id: "asc" }]
    : sort === "email"
      ? [{ email: direction }, { id: "asc" }]
      : sort === "role"
        ? [{ role: direction }, { id: "asc" }]
        : [{ createdAt: direction }, { id: "asc" }];
  const total = await db.user.count({ where });
  const page = platformPage(total, input);
  const rows = await db.user.findMany({
    where, orderBy, skip: (page.page - 1) * page.pageSize, take: page.pageSize, select: platformUserSelect,
  });
  void pageSeed;
  return { users: rows.map((row) => toPlatformUserSummary(row)), page };
}

export async function getPlatformUserDetail(userId: string, db: PlatformDiscoveryDbClient = getPrisma()): Promise<PlatformUserSummary> {
  assertUuid(userId, "userId");
  const row = await db.user.findUnique({ where: { id: userId }, select: platformUserSelect });
  if (!row) throw new PlatformAdminServiceError("User not found", 404, "USER_NOT_FOUND");
  return toPlatformUserSummary(row);
}

export async function updatePlatformUserRole(
  actorUserId: string,
  userId: string,
  input: { role?: unknown; confirmCurrentOperator?: unknown },
  db: PlatformDiscoveryDbClient = getPrisma(),
): Promise<PlatformUserSummary> {
  assertUuid(actorUserId, "actorUserId");
  assertUuid(userId, "userId");
  if (typeof input.role !== "string" || !Object.values(UserRole).includes(input.role as UserRole)) {
    throw new PlatformAdminServiceError("Invalid current user role", 400, "INVALID_USER_ROLE");
  }
  if (actorUserId === userId && input.confirmCurrentOperator !== true) {
    throw new PlatformAdminServiceError("Confirm changing your own current user role", 409, "SELF_ROLE_CONFIRMATION_REQUIRED");
  }
  const current = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!current) throw new PlatformAdminServiceError("User not found", 404, "USER_NOT_FOUND");
  if (current.role === UserRole.SUPER_ADMIN && input.role !== UserRole.SUPER_ADMIN) {
    const superAdminCount = await db.user.count({ where: { role: UserRole.SUPER_ADMIN } });
    if (superAdminCount <= 1) {
      throw new PlatformAdminServiceError("At least one SUPER_ADMIN is required", 409, "LAST_SUPER_ADMIN_BLOCKED");
    }
  }
  await db.user.update({ where: { id: userId }, data: { role: input.role as UserRole }, select: { id: true } });
  return getPlatformUserDetail(userId, db);
}

export async function listPlatformAccountsPage(
  input: PlatformAccountQuery = {},
  db: PlatformDiscoveryDbClient = getPrisma(),
): Promise<PlatformAccountPage> {
  const search = normalizedSearch(input.search);
  const searchFilter: Prisma.OrganizationWhereInput | null = search ? { OR: [
    { name: { contains: search, mode: "insensitive" } },
    { slug: { contains: search, mode: "insensitive" } },
    { users: { some: { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } } },
    { memberships: { some: { user: { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }] } } } },
  ] } : null;
  const filters: Prisma.OrganizationWhereInput[] = [
    ...(input.zeroUsers ? [{ users: { none: {} } }] : []),
    ...(input.zeroEvents ? [{ events: { none: {} } }] : []),
    ...(input.primaryAdmin === "present" ? [{ users: { some: { role: { in: [UserRole.OWNER, UserRole.ADMIN] } } } }] : []),
    ...(input.primaryAdmin === "missing" ? [{ users: { none: { role: { in: [UserRole.OWNER, UserRole.ADMIN] } } } }] : []),
    ...(searchFilter ? [searchFilter] : []),
  ];
  const where: Prisma.OrganizationWhereInput = filters.length ? { AND: filters } : {};
  const total = await db.organization.count({ where });
  const page = platformPage(total, input);
  const direction = input.direction ?? "asc";
  const sort = input.sort ?? "name";
  const orderBy: Prisma.OrganizationOrderByWithRelationInput[] = sort === "createdAt"
    ? [{ createdAt: direction }, { id: "asc" }]
    : sort === "updatedAt"
      ? [{ updatedAt: direction }, { id: "asc" }]
      : sort === "userCount"
        ? [{ users: { _count: direction } }, { id: "asc" }]
        : sort === "eventCount"
          ? [{ events: { _count: direction } }, { id: "asc" }]
      : [{ name: direction }, { id: "asc" }];
  const accounts = (await db.organization.findMany({ where, orderBy, skip: (page.page - 1) * page.pageSize, take: page.pageSize, select: accountSelect }) as OrganizationAccountRow[])
    .map(toAccountSummary);
  return { accounts, page };
}

export async function searchPlatformAdmin(
  query: string | null | undefined,
  db: PlatformDiscoveryDbClient = getPrisma(),
): Promise<PlatformSearchResult> {
  const search = normalizedSearch(query);
  if (!search) return { accounts: [], users: [], events: [] };
  const [accountPage, userPage, events] = await Promise.all([
    listPlatformAccountsPage({ search, pageSize: 6 }, db),
    listPlatformUsers({ search, pageSize: 6 }, db),
    db.event.findMany({
      where: { OR: [{ name: { contains: search, mode: "insensitive" } }, { organization: { name: { contains: search, mode: "insensitive" } } }, { organization: { slug: { contains: search, mode: "insensitive" } } }] },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 6,
      select: { id: true, name: true, orgId: true, startDate: true, endDate: true, organization: { select: { name: true, slug: true } } },
    }),
  ]);
  return {
    accounts: accountPage.accounts,
    users: userPage.users,
    events: events.map((event) => ({ id: event.id, name: event.name, orgId: event.orgId, accountName: event.organization.name, accountSlug: event.organization.slug, startDate: event.startDate, endDate: event.endDate })),
  };
}

export async function getPlatformAccountDeletionPreflight(
  orgId: string,
  activeOrgId: string | null,
  db: PlatformDeletionDbClient = getPrisma(),
): Promise<PlatformAccountDeletionPreflight> {
  const account = await getPlatformAccountById(orgId, db);
  const [users, memberships, events, eventAccessGrants, clients, documents, documentTags, tasks, parserFeedback, auditLogs] = await Promise.all([
    db.user.count({ where: { orgId } }), db.membership.count({ where: { orgId } }), db.event.count({ where: { orgId } }),
    db.eventMember.count({ where: { event: { orgId } } }), db.client.count({ where: { orgId } }), db.document.count({ where: { event: { orgId } } }),
    db.documentTag.count({ where: { orgId } }), db.task.count({ where: { orgId } }), db.fnbParserFeedback.count({ where: { orgId } }), db.copilotAuditLog.count({ where: { orgId } }),
  ]);
  const counts = { users, memberships, events, eventAccessGrants, clients, documents, documentTags, tasks, parserFeedback, auditLogs };
  const blockers = Object.entries(counts).filter(([, count]) => count > 0).map(([key, count]) => `${count} ${key}`);
  const activeContext = activeOrgId === orgId;
  if (activeContext) blockers.unshift("This account is the current Platform Admin context");
  return { account, counts, blockers, activeContext, canDelete: blockers.length === 0 };
}

export async function deletePlatformAccount(
  orgId: string,
  confirmation: unknown,
  activeOrgId: string | null,
  db: PlatformDeletionDbClient = getPrisma(),
): Promise<{ deleted: true; orgId: string }> {
  const preflight = await getPlatformAccountDeletionPreflight(orgId, activeOrgId, db);
  if (confirmation !== preflight.account.name && confirmation !== preflight.account.slug) {
    throw new PlatformAdminServiceError("Type the account name or slug to confirm deletion", 400, "DELETE_CONFIRMATION_MISMATCH");
  }
  if (!preflight.canDelete) {
    throw new PlatformAdminServiceError("Account deletion is blocked by remaining dependencies", 409, "ACCOUNT_DELETE_BLOCKED");
  }
  await db.$transaction(async (tx) => {
    await tx.organization.delete({ where: { id: orgId }, select: { id: true } });
    const remaining = await tx.organization.findUnique({ where: { id: orgId }, select: { id: true } });
    if (remaining) throw new PlatformAdminServiceError("Account deletion could not be verified", 500, "ACCOUNT_DELETE_VERIFY_FAILED");
  });
  return { deleted: true, orgId };
}
