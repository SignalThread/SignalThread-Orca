import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { UserRole, type User } from "@prisma/client";
import { setRequestUserId } from "@/lib/observability/request-context";
import { getPrisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";
import { shouldQuietE2ERoutineLogs } from "@/lib/logging/log-policy";
import { filterVisibleOrganizations } from "@/lib/test-fixture-orgs";
import { resolveOrganizationSelection } from "@/lib/organization-selection";

type RequestUserErrorStatus = 400 | 401 | 403;

type AppUser = Pick<User, "id" | "email" | "orgId" | "role">;

type MembershipSummary = {
  id: string;
  orgId: string;
};

type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
};

type EnsureBaseContext = {
  supabaseUserId: string | null;
  email: string | null;
  appUserId: string | null;
  role: UserRole | null;
  memberships: MembershipSummary[];
};

type EnsureContextOk = EnsureBaseContext & {
  status: "OK";
  activeOrgId: string;
  activeOrgIdCookieToSet?: string;
  organizationSelectionCookieToSet?: string;
};

type EnsureNeedsProvisioning = EnsureBaseContext & {
  status: "NEEDS_PROVISIONING";
  reason: string;
  hint: string;
  activeOrgId: null;
};

type EnsureNeedsOrgSelection = EnsureBaseContext & {
  status: "NEEDS_ORG_SELECTION";
  reason: string;
  hint: string;
  activeOrgId: null;
  organizations: OrganizationSummary[];
};

type EnsureUnauthenticated = EnsureBaseContext & {
  status: "UNAUTHENTICATED";
  reason: string;
  hint: string;
  activeOrgId: null;
};

export type EnsureProvisionedUserAndContextResult =
  | EnsureContextOk
  | EnsureNeedsProvisioning
  | EnsureNeedsOrgSelection
  | EnsureUnauthenticated;

export type RequestUserResult =
  | {
      user: {
        id: string;
        orgId: string | null;
        role: UserRole;
        activeOrgIdCookieToSet?: string;
        organizationSelectionCookieToSet?: string;
      };
    }
  | {
      error: {
        status: RequestUserErrorStatus;
        reason: string;
        hint: string;
        appUserId?: string;
        role?: UserRole;
      };
    };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const ACTIVE_ORG_COOKIE_NAME = "activeOrgId";
export const ORGANIZATION_SELECTION_COOKIE_NAME = "activeOrgSelectionId";
export const ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function deriveDisplayNameFromEmail(email: string): string | null {
  const localPart = email.split("@")[0]?.trim() ?? "";
  if (!localPart) return null;

  const words = localPart
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1));

  return words.length > 0 ? words.join(" ") : null;
}

function isDevNoMembershipBypassEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.DEV_ALLOW_NO_MEMBERSHIP === "true";
}

async function readRequestedOrgId(request?: NextRequest): Promise<string | null> {
  if (request) {
    return request.cookies.get(ACTIVE_ORG_COOKIE_NAME)?.value?.trim() || null;
  }

  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_ORG_COOKIE_NAME)?.value?.trim() || null;
}

async function readSelectedOrganizationId(request?: NextRequest): Promise<string | null> {
  if (request) {
    return request.cookies.get(ORGANIZATION_SELECTION_COOKIE_NAME)?.value?.trim() || null;
  }

  const cookieStore = await cookies();
  return cookieStore.get(ORGANIZATION_SELECTION_COOKIE_NAME)?.value?.trim() || null;
}

async function organizationExists(orgId: string): Promise<boolean> {
  const organization = await getPrisma().organization.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  return Boolean(organization);
}

async function listMemberships(userId: string): Promise<MembershipSummary[]> {
  return getPrisma().membership.findMany({
    where: { userId },
    select: { id: true, orgId: true },
    orderBy: [{ createdAt: "asc" }, { orgId: "asc" }],
  });
}

export async function listAccessibleOrganizationsForUser(input: {
  userId: string;
  role: UserRole;
}): Promise<OrganizationSummary[]> {
  if (input.role === UserRole.SUPER_ADMIN) {
    return getPrisma().organization.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  }

  const memberships = await listMemberships(input.userId);
  if (memberships.length === 0) return [];

  const organizations = await getPrisma().organization.findMany({
    where: { id: { in: memberships.map((membership) => membership.orgId) } },
    select: { id: true, name: true, slug: true },
  });
  const byId = new Map(organizations.map((organization) => [organization.id, organization]));

  return memberships
    .map((membership) => byId.get(membership.orgId))
    .filter((organization): organization is OrganizationSummary => Boolean(organization));
}

async function getDefaultOrgIdResolution(): Promise<
  | {
      orgId: string;
    }
  | {
      orgId: null;
      reason: string;
      hint: string;
    }
> {
  const defaultOrgId = process.env.DEFAULT_ORG_ID?.trim();

  if (!defaultOrgId) {
    return {
      orgId: null,
      reason: "DEFAULT_ORG_ID_MISSING",
      hint: "Set DEFAULT_ORG_ID to auto-provision first-time users or invite them through admin provisioning.",
    };
  }

  if (!UUID_REGEX.test(defaultOrgId)) {
    return {
      orgId: null,
      reason: "DEFAULT_ORG_ID_INVALID",
      hint: "DEFAULT_ORG_ID must be a valid UUID.",
    };
  }

  const exists = await organizationExists(defaultOrgId);
  if (!exists) {
    return {
      orgId: null,
      reason: "DEFAULT_ORG_NOT_FOUND",
      hint: "DEFAULT_ORG_ID does not match an existing organization.",
    };
  }

  return { orgId: defaultOrgId };
}

async function createAppUserWithMembership(input: {
  email: string;
  suggestedName: string | null;
  orgId: string;
}): Promise<AppUser> {
  return getPrisma().$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: input.email,
        name: input.suggestedName?.trim() || deriveDisplayNameFromEmail(input.email),
        role: UserRole.MEMBER,
        orgId: input.orgId,
      },
      select: { id: true, email: true, orgId: true, role: true },
    });

    await tx.membership.upsert({
      where: {
        orgId_userId: {
          orgId: input.orgId,
          userId: user.id,
        },
      },
      update: {},
      create: {
        orgId: input.orgId,
        userId: user.id,
      },
    });

    return user;
  });
}

async function ensureMembershipForUser(appUser: AppUser): Promise<
  | {
      memberships: MembershipSummary[];
    }
  | {
      memberships: MembershipSummary[];
      reason: string;
      hint: string;
    }
> {
  const existingMemberships = await listMemberships(appUser.id);
  if (existingMemberships.length > 0) {
    return { memberships: existingMemberships };
  }

  const candidateOrgId =
    UUID_REGEX.test(appUser.orgId) && (await organizationExists(appUser.orgId)) ? appUser.orgId : null;

  const provisioningOrg = candidateOrgId
    ? ({ orgId: candidateOrgId } as const)
    : await getDefaultOrgIdResolution();

  if (provisioningOrg.orgId === null) {
    return {
      memberships: [],
      reason: provisioningOrg.reason,
      hint: provisioningOrg.hint,
    };
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.user.update({
      where: { id: appUser.id },
      data: { orgId: provisioningOrg.orgId },
    });

    await tx.membership.upsert({
      where: {
        orgId_userId: {
          orgId: provisioningOrg.orgId,
          userId: appUser.id,
        },
      },
      update: {},
      create: {
          orgId: provisioningOrg.orgId,
        userId: appUser.id,
      },
    });
  });

  return { memberships: await listMemberships(appUser.id) };
}

async function resolveAppUserFromSupabaseIdentity(input: {
  supabaseEmail: string;
  suggestedName: string | null;
}): Promise<
  | {
      appUser: AppUser;
    }
  | {
      reason: string;
      hint: string;
      appUserId: null;
    }
> {
  const email = normalizeEmail(input.supabaseEmail);
  if (!email) {
    return {
      reason: "SUPABASE_EMAIL_MISSING",
      hint: "Authenticated Supabase user has no email.",
      appUserId: null,
    };
  }

  const existingUser = await getPrisma().user.findUnique({
    where: { email },
    select: { id: true, email: true, orgId: true, role: true },
  });

  if (existingUser) {
    return { appUser: existingUser };
  }

  const defaultOrg = await getDefaultOrgIdResolution();
  if (defaultOrg.orgId === null) {
    return {
      reason: defaultOrg.reason,
      hint: defaultOrg.hint,
      appUserId: null,
    };
  }

  const appUser = await createAppUserWithMembership({
    email,
    suggestedName: input.suggestedName,
    orgId: defaultOrg.orgId,
  });

  return { appUser };
}

async function resolveFromAuthenticatedIdentity(input: {
  requestedOrgId: string | null;
  selectedOrganizationId: string | null;
  supabaseUserId: string;
  email: string;
  suggestedName: string | null;
}): Promise<EnsureProvisionedUserAndContextResult> {
  const appUserResult = await resolveAppUserFromSupabaseIdentity({
    supabaseEmail: input.email,
    suggestedName: input.suggestedName,
  });

  if (!("appUser" in appUserResult)) {
    return {
      status: "NEEDS_PROVISIONING",
      supabaseUserId: input.supabaseUserId,
      email: input.email,
      appUserId: appUserResult.appUserId,
      role: null,
      memberships: [],
      activeOrgId: null,
      reason: appUserResult.reason,
      hint: appUserResult.hint,
    };
  }

  const appUser = appUserResult.appUser;
  const memberships =
    appUser.role === UserRole.SUPER_ADMIN ? await listMemberships(appUser.id) : undefined;

  let resolvedMemberships = memberships;
  if (appUser.role !== UserRole.SUPER_ADMIN) {
    const membershipResult = await ensureMembershipForUser(appUser);
    if ("reason" in membershipResult) {
      if (isDevNoMembershipBypassEnabled()) {
        const fallbackOrgId = appUser.orgId;
        return {
          status: "OK",
          supabaseUserId: input.supabaseUserId,
          email: input.email,
          appUserId: appUser.id,
          role: appUser.role,
          memberships: [],
          activeOrgId: fallbackOrgId,
          ...(input.requestedOrgId !== fallbackOrgId ? { activeOrgIdCookieToSet: fallbackOrgId } : {}),
          ...(input.selectedOrganizationId !== fallbackOrgId
            ? { organizationSelectionCookieToSet: fallbackOrgId }
            : {}),
        };
      }

      return {
        status: "NEEDS_PROVISIONING",
        supabaseUserId: input.supabaseUserId,
        email: input.email,
        appUserId: appUser.id,
        role: appUser.role,
        memberships: [],
        activeOrgId: null,
        reason: membershipResult.reason,
        hint: membershipResult.hint,
      };
    }

    resolvedMemberships = membershipResult.memberships;
  }

  const accessibleOrganizations = await listAccessibleOrganizationsForUser({
    userId: appUser.id,
    role: appUser.role,
  });
  const selection = resolveOrganizationSelection({
    accessibleOrgIds: accessibleOrganizations.map((organization) => organization.id),
    requestedOrgId: input.requestedOrgId,
    selectedOrgId: input.selectedOrganizationId,
  });

  if (selection.status === "NO_ACCESS") {
    return {
      status: "NEEDS_PROVISIONING",
      supabaseUserId: input.supabaseUserId,
      email: input.email,
      appUserId: appUser.id,
      role: appUser.role,
      memberships: resolvedMemberships ?? [],
      activeOrgId: null,
      reason: "NO_ACCESSIBLE_ORGANIZATION",
      hint: "Authenticated user has no accessible organization.",
    };
  }

  if (selection.status === "NEEDS_ORG_SELECTION") {
    return {
      status: "NEEDS_ORG_SELECTION",
      supabaseUserId: input.supabaseUserId,
      email: input.email,
      appUserId: appUser.id,
      role: appUser.role,
      memberships: resolvedMemberships ?? [],
      activeOrgId: null,
      reason: "NEEDS_ORG_SELECTION",
      hint: "Choose an organization for this signed-in session.",
      organizations: filterVisibleOrganizations(accessibleOrganizations),
    };
  }

  return {
    status: "OK",
    supabaseUserId: input.supabaseUserId,
    email: input.email,
    appUserId: appUser.id,
    role: appUser.role,
    memberships: resolvedMemberships ?? [],
    activeOrgId: selection.activeOrgId,
    ...(selection.shouldPersistSelection
      ? {
          activeOrgIdCookieToSet: selection.activeOrgId,
          organizationSelectionCookieToSet: selection.activeOrgId,
        }
      : {}),
  };
}

async function resolveFromDevFallback(
  requestedOrgId: string | null,
  selectedOrganizationId: string | null,
): Promise<EnsureProvisionedUserAndContextResult> {
  const devUserId = process.env.DEV_USER_ID?.trim() || null;
  const devUserEmail = normalizeEmail(process.env.DEV_USER_EMAIL?.trim() || "demo@planneros.com");

  const appUser = devUserId
    ? await getPrisma().user.findUnique({
        where: { id: devUserId },
        select: { id: true, email: true, orgId: true, role: true },
      })
    : await getPrisma().user.findUnique({
        where: { email: devUserEmail },
        select: { id: true, email: true, orgId: true, role: true },
      });

  if (!appUser) {
    return {
      status: "UNAUTHENTICATED",
      supabaseUserId: null,
      email: null,
      appUserId: null,
      role: null,
      memberships: [],
      activeOrgId: null,
      reason: "DEV_USER_NOT_FOUND",
      hint: `Set DEV_USER_EMAIL/DEV_USER_ID to an existing user and run seed. Current DEV_USER_EMAIL=${devUserEmail}.`,
    };
  }

  return resolveFromAuthenticatedIdentity({
    requestedOrgId,
    selectedOrganizationId,
    supabaseUserId: appUser.id,
    email: appUser.email,
    suggestedName: null,
  });
}

export async function ensureProvisionedUserAndContext(
  request?: NextRequest,
): Promise<EnsureProvisionedUserAndContextResult> {
  const requestedOrgId = await readRequestedOrgId(request);
  const selectedOrganizationId = await readSelectedOrganizationId(request);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user: supabaseUser },
    error: supabaseError,
  } = await supabase.auth.getUser();

  let loggedSupabaseError = false;
  const quietRoutineLogs = shouldQuietE2ERoutineLogs();
  const isExpectedQuietDevAuthFallback =
    quietRoutineLogs &&
    process.env.NODE_ENV === "development" &&
    Boolean(supabaseError?.message && /auth session missing/i.test(supabaseError.message));

  if (supabaseError && !isExpectedQuietDevAuthFallback) {
    console.warn("ensureProvisionedUserAndContext: supabase.auth.getUser failed", {
      message: supabaseError.message,
      status: supabaseError.status,
      code: supabaseError.code,
    });
    loggedSupabaseError = true;
  }

  if (supabaseUser?.email) {
    const suggestedName =
      (typeof supabaseUser.user_metadata?.full_name === "string" ? supabaseUser.user_metadata.full_name : null) ||
      (typeof supabaseUser.user_metadata?.name === "string" ? supabaseUser.user_metadata.name : null) ||
      null;

    return resolveFromAuthenticatedIdentity({
      requestedOrgId,
      selectedOrganizationId,
      supabaseUserId: supabaseUser.id,
      email: supabaseUser.email,
      suggestedName,
    });
  }

  if (process.env.NODE_ENV === "development") {
    const devFallback = await resolveFromDevFallback(requestedOrgId, selectedOrganizationId);
    if (supabaseError && devFallback.status !== "OK" && !loggedSupabaseError && !quietRoutineLogs) {
      console.warn("ensureProvisionedUserAndContext: supabase.auth.getUser failed", {
        message: supabaseError.message,
        status: supabaseError.status,
        code: supabaseError.code,
        fallbackStatus: devFallback.status,
        fallbackReason: devFallback.reason,
      });
    }
    return devFallback;
  }

  return {
    status: "UNAUTHENTICATED",
    supabaseUserId: null,
    email: null,
    appUserId: null,
    role: null,
    memberships: [],
    activeOrgId: null,
    reason: "MISSING_SUPABASE_SESSION",
    hint: "Sign in first. In local development you can set DEV_USER_EMAIL for fallback access.",
  };
}

function toRequestUserError(input: EnsureProvisionedUserAndContextResult["status"]): RequestUserErrorStatus {
  if (input === "UNAUTHENTICATED") return 401;
  if (input === "NEEDS_ORG_SELECTION") return 400;
  return 403;
}

export async function resolveRequestUser(request: NextRequest): Promise<RequestUserResult> {
  const context = await ensureProvisionedUserAndContext(request);

  if (context.status === "OK") {
    setRequestUserId(context.appUserId!);
    return {
      user: {
        id: context.appUserId!,
        orgId: context.activeOrgId,
        role: context.role!,
        ...(context.activeOrgIdCookieToSet ? { activeOrgIdCookieToSet: context.activeOrgIdCookieToSet } : {}),
        ...(context.organizationSelectionCookieToSet
          ? { organizationSelectionCookieToSet: context.organizationSelectionCookieToSet }
          : {}),
      },
    };
  }

  return {
    error: {
      status: toRequestUserError(context.status),
      reason: context.reason,
      hint: context.hint,
      ...(context.appUserId ? { appUserId: context.appUserId } : {}),
      ...(context.role ? { role: context.role } : {}),
    },
  };
}
