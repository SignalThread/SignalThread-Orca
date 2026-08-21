import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { UserRole, type User } from "@prisma/client";
import { setRequestUserId } from "@/lib/observability/request-context";
import { getPrisma } from "@/lib/prisma";
import { createServerSupabaseClient } from "@/src/lib/supabase/server";
import { shouldQuietE2ERoutineLogs } from "@/lib/logging/log-policy";
import { filterVisibleOrganizations } from "@/lib/test-fixture-orgs";
import { resolveOrganizationSelection } from "@/lib/organization-selection";
import {
  isEmailIdentityBridgeEnabled,
  resolveAppUserByPlatformIdentity,
  type PlatformIdentityLinkMode,
} from "@/lib/platform/identity";
import {
  createDevelopmentEntitlementClaims,
  isEntitlementDenialWaivableInDevelopment,
  readEntitlementClaims,
  resolveOrcaEntitlement,
  restrictOrganizationsToPlatformClaims,
  type EntitlementGrantSource,
  type PlatformEntitlementClaims,
} from "@/lib/platform/entitlements";
import { resolveAuthAuthorityPosture } from "@/src/lib/supabase/auth-authority";

type RequestUserErrorStatus = 400 | 401 | 403;

type AppUser = Pick<User, "id" | "email" | "orgId" | "role" | "platformUserId">;

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
  /** Authenticated identity id from the authentication authority. */
  supabaseUserId: string | null;
  /**
   * Canonical Platform Core user id stored on the Orca user row. Null while a row is
   * still resolved through the transitional email bridge.
   */
  platformUserId: string | null;
  /** How the Orca user row was reached for this request. */
  identityLinkMode: PlatformIdentityLinkMode | null;
  /** How Platform Core entitlement to enter Orca was satisfied, when it was. */
  entitlementSource: EntitlementGrantSource | null;
  /**
   * Organizations this session may act in: Orca product access narrowed by Platform Core
   * organization claims. Consumers must use this rather than recomputing the intersection,
   * so there is exactly one place the ceiling is applied.
   */
  authorizedOrganizationIds: string[];
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

export const ACTIVE_ORG_COOKIE_NAME = "activeOrgId";
export const ORGANIZATION_SELECTION_COOKIE_NAME = "activeOrgSelectionId";
export const ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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

/**
 * `DEFAULT_ORG_ID` is retired from authenticated identity and access resolution.
 *
 * It previously let any address with a valid OTP self-provision into a fallback
 * organization. Platform Core owns organization membership now, so implicit tenant
 * assignment is gone: a user with no Orca organization access is denied, never given one.
 *
 * The variable survives only for development fixtures and seeding (`prisma/seed.ts`), which
 * is why this helper exists — to prove, in one place, that nothing in the request path
 * reads it. See `isDevNoMembershipBypassEnabled` for the development-only escape hatch.
 */
export function isDefaultOrgIdUsedForAccessResolution(): false {
  return false;
}

/**
 * Read the organization memberships already provisioned for this user.
 *
 * Phase 2 removed the write side entirely. This used to create a `Membership` and rewrite
 * `User.orgId` as a side effect of a GET, which meant authentication granted tenancy.
 * Access must now come from Platform Core entitlements or from membership an administrator
 * explicitly provisioned; a user with none is denied.
 */
function readProvisionedMemberships(existingMemberships: MembershipSummary[]):
  | {
      memberships: MembershipSummary[];
    }
  | {
      memberships: MembershipSummary[];
      reason: string;
      hint: string;
    } {
  if (existingMemberships.length > 0) {
    return { memberships: existingMemberships };
  }

  return {
    memberships: [],
    reason: "ORCA_ACCESS_NOT_PROVISIONED",
    hint: "This account has no Orca organization access. An administrator must provision it in Platform Core.",
  };
}

/**
 * Resolve the Orca user row for an authenticated Platform Core identity.
 *
 * Identity is keyed on the canonical Platform user id. Email is only a transitional
 * bridge for linking pre-existing rows (see `lib/platform/identity.ts`); it is never
 * treated as proof of identity on its own.
 */
async function resolveAppUserFromPlatformIdentity(input: {
  platformUserId: string;
  supabaseEmail: string;
}): Promise<
  | {
      appUser: AppUser;
      linkMode: Exclude<PlatformIdentityLinkMode, "UNRESOLVED">;
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

  const resolution = await resolveAppUserByPlatformIdentity({
    platformUserId: input.platformUserId,
    email,
  });

  if (resolution.status === "CONFLICT") {
    return {
      reason: resolution.reason,
      hint: resolution.hint,
      appUserId: null,
    };
  }

  if (resolution.status === "RESOLVED") {
    return { appUser: resolution.appUser, linkMode: resolution.linkMode };
  }

  // Nothing matched the canonical id. An Orca row may still hold this address without a
  // platform link — when the email bridge is off, or if it was linked concurrently. Do not
  // try to create a second row for it: the email is unique, and a collision here would
  // surface as a 500 rather than an actionable state.
  const unlinkedByEmail = await getPrisma().user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (unlinkedByEmail) {
    return {
      reason: "PLATFORM_IDENTITY_NOT_LINKED",
      hint: isEmailIdentityBridgeEnabled()
        ? "This account exists but is not linked to your Platform Core identity. Contact an administrator."
        : "This account has not been linked to a Platform Core identity yet. Run the platform user id backfill.",
      appUserId: null,
    };
  }

  // No Orca user exists for this Platform Core identity. Phase 2 removed auto-provisioning:
  // a valid Platform session never creates an Orca account or a tenant assignment.
  return {
    reason: "ORCA_ACCESS_NOT_PROVISIONED",
    hint: "This Platform Core account has no Orca access. An administrator must provision it.",
    appUserId: null,
  };
}

async function resolveFromAuthenticatedIdentity(input: {
  requestedOrgId: string | null;
  selectedOrganizationId: string | null;
  /** Canonical Platform Core user id carried by the authenticated session. */
  supabaseUserId: string;
  email: string;
  /** Verified Platform Core entitlement claims from the session, when present. */
  entitlementClaims: PlatformEntitlementClaims;
}): Promise<EnsureProvisionedUserAndContextResult> {
  const appUserResult = await resolveAppUserFromPlatformIdentity({
    platformUserId: input.supabaseUserId,
    supabaseEmail: input.email,
  });

  if (!("appUser" in appUserResult)) {
    return {
      status: "NEEDS_PROVISIONING",
      supabaseUserId: input.supabaseUserId,
      platformUserId: null,
      identityLinkMode: "UNRESOLVED",
      entitlementSource: null,
      authorizedOrganizationIds: [],
      email: input.email,
      appUserId: appUserResult.appUserId,
      role: null,
      memberships: [],
      activeOrgId: null,
      reason: appUserResult.reason,
      hint: appUserResult.hint,
    };
  }

  return buildContextForResolvedAppUser({
    requestedOrgId: input.requestedOrgId,
    selectedOrganizationId: input.selectedOrganizationId,
    supabaseUserId: input.supabaseUserId,
    email: input.email,
    appUser: appUserResult.appUser,
    identityLinkMode: appUserResult.linkMode,
    entitlementClaims: input.entitlementClaims,
  });
}

/**
 * Build the org/membership context for an already-resolved Orca user.
 *
 * Split out so the development fallback can reuse the exact same authorization path
 * without going through platform identity resolution — the dev fallback names a local row
 * directly and must never mint or claim a Platform Core id.
 */
async function buildContextForResolvedAppUser(input: {
  requestedOrgId: string | null;
  selectedOrganizationId: string | null;
  supabaseUserId: string;
  email: string;
  appUser: AppUser;
  identityLinkMode: Exclude<PlatformIdentityLinkMode, "UNRESOLVED">;
  entitlementClaims: PlatformEntitlementClaims;
}): Promise<EnsureProvisionedUserAndContextResult> {
  const appUser = input.appUser;
  const identityLinkMode = input.identityLinkMode;
  // Read memberships once. Auth resolution runs on every request, so it must not grow
  // extra round trips (audit: Platform Core must never become a hot-path dependency).
  const memberships = await listMemberships(appUser.id);

  // Entry gate: being authenticated is not being entitled. Platform Core claims decide,
  // and where they are absent the deployment either fails closed or requires state an
  // administrator already provisioned. Orca's own roles still decide what happens next.
  const entitlement = resolveOrcaEntitlement({
    claims: input.entitlementClaims,
    subject: {
      platformUserId: appUser.platformUserId,
      // An elevated Orca role is provisioned state in its own right: someone deliberately
      // granted it, so a platform admin without an org membership is not "unprovisioned".
      hasProvisionedOrcaAccess: memberships.length > 0 || appUser.role === UserRole.SUPER_ADMIN,
    },
  });

  const entitlementWaivedInDevelopment =
    entitlement.status === "DENIED"
    && isDevNoMembershipBypassEnabled()
    && isEntitlementDenialWaivableInDevelopment(entitlement.reason);

  if (entitlement.status === "DENIED" && !entitlementWaivedInDevelopment) {
    return {
      status: "NEEDS_PROVISIONING",
      supabaseUserId: input.supabaseUserId,
      platformUserId: appUser.platformUserId,
      identityLinkMode,
      entitlementSource: null,
      authorizedOrganizationIds: [],
      email: input.email,
      appUserId: appUser.id,
      role: appUser.role,
      memberships,
      activeOrgId: null,
      reason: entitlement.reason,
      hint: entitlement.hint,
    };
  }

  const entitlementSource = entitlement.status === "GRANTED" ? entitlement.source : null;

  let resolvedMemberships: MembershipSummary[] | undefined =
    appUser.role === UserRole.SUPER_ADMIN ? memberships : undefined;

  if (appUser.role !== UserRole.SUPER_ADMIN) {
    const membershipResult = readProvisionedMemberships(memberships);
    if ("reason" in membershipResult) {
      if (isDevNoMembershipBypassEnabled()) {
        const fallbackOrgId = appUser.orgId;
        return {
          status: "OK",
          supabaseUserId: input.supabaseUserId,
          platformUserId: appUser.platformUserId,
          identityLinkMode,
          entitlementSource,
          authorizedOrganizationIds: fallbackOrgId ? [fallbackOrgId] : [],
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
        platformUserId: appUser.platformUserId,
        identityLinkMode,
        entitlementSource,
        authorizedOrganizationIds: [],
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

  const orcaAccessibleOrganizations = await listAccessibleOrganizationsForUser({
    userId: appUser.id,
    role: appUser.role,
  });

  // Phase 3: Platform Core organization claims are a ceiling on Orca product access.
  // Orca's Organization.id IS the Platform organization_id, so the two are directly
  // comparable. The claim can only narrow the set — never add an organization Orca does
  // not already grant — and the cookie-based selection below happens strictly within it.
  const organizationRestriction = restrictOrganizationsToPlatformClaims({
    accessibleOrgIds: orcaAccessibleOrganizations.map((organization) => organization.id),
    claims: input.entitlementClaims,
  });

  if (organizationRestriction.status === "DENIED") {
    return {
      status: "NEEDS_PROVISIONING",
      supabaseUserId: input.supabaseUserId,
      platformUserId: appUser.platformUserId,
      identityLinkMode,
      entitlementSource,
      authorizedOrganizationIds: [],
      email: input.email,
      appUserId: appUser.id,
      role: appUser.role,
      memberships: resolvedMemberships ?? [],
      activeOrgId: null,
      reason: organizationRestriction.reason,
      hint: organizationRestriction.hint,
    };
  }

  const authorizedOrgIds = new Set(organizationRestriction.orgIds);
  const accessibleOrganizations = orcaAccessibleOrganizations.filter((organization) =>
    authorizedOrgIds.has(organization.id),
  );

  const selection = resolveOrganizationSelection({
    accessibleOrgIds: accessibleOrganizations.map((organization) => organization.id),
    requestedOrgId: input.requestedOrgId,
    selectedOrgId: input.selectedOrganizationId,
  });

  if (selection.status === "NO_ACCESS") {
    return {
      status: "NEEDS_PROVISIONING",
      supabaseUserId: input.supabaseUserId,
      platformUserId: appUser.platformUserId,
      identityLinkMode,
      entitlementSource,
      authorizedOrganizationIds: organizationRestriction.orgIds,
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
      platformUserId: appUser.platformUserId,
      identityLinkMode,
      entitlementSource,
      authorizedOrganizationIds: organizationRestriction.orgIds,
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
    platformUserId: appUser.platformUserId,
    identityLinkMode,
    entitlementSource,
    authorizedOrganizationIds: organizationRestriction.orgIds,
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

  const devUserSelect = {
    id: true,
    email: true,
    orgId: true,
    role: true,
    platformUserId: true,
  } as const;

  const appUser = devUserId
    ? await getPrisma().user.findUnique({
        where: { id: devUserId },
        select: devUserSelect,
      })
    : await getPrisma().user.findUnique({
        where: { email: devUserEmail },
        select: devUserSelect,
      });

  if (!appUser) {
    return {
      status: "UNAUTHENTICATED",
      supabaseUserId: null,
      platformUserId: null,
      identityLinkMode: "UNRESOLVED",
      entitlementSource: null,
      authorizedOrganizationIds: [],
      email: null,
      appUserId: null,
      role: null,
      memberships: [],
      activeOrgId: null,
      reason: "DEV_USER_NOT_FOUND",
      hint: `Set DEV_USER_EMAIL/DEV_USER_ID to an existing user and run seed. Current DEV_USER_EMAIL=${devUserEmail}.`,
    };
  }

  // The dev fallback names a local row directly. It must never fabricate a Platform Core
  // id, so it reports the row's real link state and skips identity resolution entirely.
  return buildContextForResolvedAppUser({
    requestedOrgId,
    selectedOrganizationId,
    supabaseUserId: appUser.platformUserId ?? appUser.id,
    email: appUser.email,
    appUser,
    identityLinkMode: appUser.platformUserId ? "CANONICAL" : "EMAIL_BRIDGE_UNLINKED",
    // The fallback already bypasses the authentication authority in development; it
    // carries the matching development entitlement rather than leaving entry undecided.
    // `createDevelopmentEntitlementClaims` returns null in production.
    entitlementClaims: createDevelopmentEntitlementClaims(),
  });
}

export async function ensureProvisionedUserAndContext(
  request?: NextRequest,
): Promise<EnsureProvisionedUserAndContextResult> {
  const requestedOrgId = await readRequestedOrgId(request);
  const selectedOrganizationId = await readSelectedOrganizationId(request);

  // Refuse to authenticate at all against an authority this environment must not use.
  // Without this a production deployment missing its Platform Core variables would keep
  // signing people in against the legacy Orca project.
  const authorityPosture = resolveAuthAuthorityPosture();
  if (authorityPosture.status === "BLOCKED") {
    console.error("ensureProvisionedUserAndContext: authentication authority unusable", {
      reason: authorityPosture.reason,
    });
    return {
      status: "UNAUTHENTICATED",
      supabaseUserId: null,
      platformUserId: null,
      identityLinkMode: null,
      entitlementSource: null,
      authorizedOrganizationIds: [],
      email: null,
      appUserId: null,
      role: null,
      memberships: [],
      activeOrgId: null,
      reason: authorityPosture.reason,
      hint: authorityPosture.hint,
    };
  }

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
    return resolveFromAuthenticatedIdentity({
      requestedOrgId,
      selectedOrganizationId,
      supabaseUserId: supabaseUser.id,
      email: supabaseUser.email,
      // Entitlements ride on the verified session, so no call back to Platform Core is
      // made on the request path. `app_metadata` is server-controlled; `user_metadata`
      // is user-editable and is deliberately never consulted for access.
      entitlementClaims: readEntitlementClaims(supabaseUser.app_metadata),
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
    platformUserId: null,
    identityLinkMode: null,
    entitlementSource: null,
    authorizedOrganizationIds: [],
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
