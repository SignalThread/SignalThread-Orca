import { UserRole } from "@prisma/client";
import type { NextRequest } from "next/server";
import {
  ensureProvisionedUserAndContext,
  type EnsureProvisionedUserAndContextResult,
} from "@/lib/request-user";

type PlatformAdminAuthStatus = 401 | 403;

export type PlatformAdminUser = Readonly<{
  id: string;
  orgId: string | null;
  role: UserRole;
  activeOrgIdCookieToSet?: string;
}>;

export class PlatformAdminAuthError extends Error {
  status: PlatformAdminAuthStatus;
  reason: string;
  hint: string;

  constructor(status: PlatformAdminAuthStatus, reason: string, hint: string) {
    super(status === 401 ? "Unauthorized" : "Forbidden");
    this.status = status;
    this.reason = reason;
    this.hint = hint;
  }
}

function forbidden(reason = "PLATFORM_ADMIN_REQUIRED", hint = "PlatformAdmin access is required.") {
  return new PlatformAdminAuthError(403, reason, hint);
}

export function requirePlatformAdminFromContext(
  context: EnsureProvisionedUserAndContextResult,
): PlatformAdminUser {
  if (context.status === "UNAUTHENTICATED") {
    throw new PlatformAdminAuthError(401, context.reason, context.hint);
  }

  if (context.role !== UserRole.SUPER_ADMIN || !context.appUserId) {
    throw forbidden();
  }

  if (context.status === "OK") {
    return {
      id: context.appUserId,
      orgId: context.activeOrgId,
      role: UserRole.SUPER_ADMIN,
      ...(context.activeOrgIdCookieToSet ? { activeOrgIdCookieToSet: context.activeOrgIdCookieToSet } : {}),
    };
  }

  if (context.status === "NEEDS_ORG_SELECTION") {
    return {
      id: context.appUserId,
      orgId: null,
      role: UserRole.SUPER_ADMIN,
    };
  }

  throw forbidden(context.reason, context.hint);
}

export async function requirePlatformAdmin(request: NextRequest): Promise<PlatformAdminUser> {
  const context = await ensureProvisionedUserAndContext(request);
  return requirePlatformAdminFromContext(context);
}
