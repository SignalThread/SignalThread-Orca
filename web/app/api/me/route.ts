import { NextRequest, NextResponse } from "next/server";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { setRequestUserId } from "@/lib/observability/request-context";
import {
  ACTIVE_ORG_COOKIE_NAME,
  ensureProvisionedUserAndContext,
  listAccessibleOrganizationsForUser,
  ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  ORGANIZATION_SELECTION_COOKIE_NAME,
} from "@/lib/request-user";
import { PLATFORM_CONTEXT_COOKIE_NAME } from "@/src/server/services/platform-admin";

function applyActiveOrgCookie(
  response: NextResponse,
  activeOrgId: string,
  options?: { httpOnly?: boolean },
) {
  response.cookies.set({
    name: ACTIVE_ORG_COOKIE_NAME,
    value: activeOrgId,
    path: "/",
    sameSite: "lax",
    httpOnly: options?.httpOnly ?? true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  });
}

function applyOrganizationSelectionCookie(response: NextResponse, activeOrgId: string) {
  response.cookies.set({
    name: ORGANIZATION_SELECTION_COOKIE_NAME,
    value: activeOrgId,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ORGANIZATION_CONTEXT_COOKIE_MAX_AGE_SECONDS,
  });
}

function clearOrganizationContextCookies(response: NextResponse) {
  for (const name of [ACTIVE_ORG_COOKIE_NAME, ORGANIZATION_SELECTION_COOKIE_NAME]) {
    response.cookies.set({
      name,
      value: "",
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    });
  }
}

function clearPlatformContextCookie(response: NextResponse) {
  response.cookies.set({
    name: PLATFORM_CONTEXT_COOKIE_NAME,
    value: "",
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

function unauthorized(reason: string, hint: string, status = 401) {
  return NextResponse.json(
    {
      message: status === 403 ? "Forbidden" : "Unauthorized",
      reason,
      hint,
      status: "UNAUTHENTICATED",
      supabaseUserId: null,
      platformUserId: null,
      identityLinkMode: null,
      entitlementSource: null,
      email: null,
      appUserId: null,
      activeOrgId: null,
      role: null,
      memberships: [],
    },
    { status },
  );
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getHandler(request: NextRequest) {
  try {
    const context = await ensureProvisionedUserAndContext(request);
    setRequestUserId(context.appUserId ?? null);
    if (context.status === "UNAUTHENTICATED") {
      return unauthorized(context.reason, context.hint, 401);
    }

    const response = NextResponse.json({
      status: context.status,
      reason: context.status === "OK" ? null : context.reason,
      hint: context.status === "OK" ? null : context.hint,
      supabaseUserId: context.supabaseUserId,
      // Canonical Platform Core identity, plus how this row was reached. `identityLinkMode`
      // exposes whether the request still depended on the transitional email bridge.
      platformUserId: context.platformUserId,
      identityLinkMode: context.identityLinkMode,
      // How Platform Core entitlement to enter Orca was satisfied, when it was.
      entitlementSource: context.entitlementSource,
      email: context.email,
      appUserId: context.appUserId,
      activeOrgId: context.activeOrgId,
      orgId: context.activeOrgId,
      role: context.role,
      memberships: context.memberships,
      userId: context.appUserId,
      organizations: context.status === "NEEDS_ORG_SELECTION" ? context.organizations : undefined,
    });

    if (context.status === "OK" && context.activeOrgIdCookieToSet) {
      applyActiveOrgCookie(response, context.activeOrgIdCookieToSet, { httpOnly: true });
    }
    if (context.status === "OK" && context.organizationSelectionCookieToSet) {
      applyOrganizationSelectionCookie(response, context.organizationSelectionCookieToSet);
    }

    return response;
  } catch (error) {
    observeHandledRouteError(error);
    throw error;
  }
}

async function parseSetOrgPayload(request: NextRequest): Promise<{
  activeOrgId: string | null;
  redirectTo: string | null;
}> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json()) as {
      activeOrgId?: unknown;
      redirectTo?: unknown;
    };
    return {
      activeOrgId: typeof body.activeOrgId === "string" ? body.activeOrgId.trim() : null,
      redirectTo: typeof body.redirectTo === "string" ? body.redirectTo.trim() : null,
    };
  }

  const formData = await request.formData();
  const activeOrgValue = formData.get("activeOrgId");
  const redirectValue = formData.get("redirectTo");

  return {
    activeOrgId: typeof activeOrgValue === "string" ? activeOrgValue.trim() : null,
    redirectTo: typeof redirectValue === "string" ? redirectValue.trim() : null,
  };
}

function sanitizeRedirectTo(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  return value;
}

async function postHandler(request: NextRequest) {
  try {
    const context = await ensureProvisionedUserAndContext(request);
    setRequestUserId(context.appUserId ?? null);
    if (context.status === "UNAUTHENTICATED") {
      return unauthorized(context.reason, context.hint, 401);
    }

    if (context.status === "NEEDS_PROVISIONING") {
      return unauthorized(context.reason, context.hint, 403);
    }

    let payload: { activeOrgId: string | null; redirectTo: string | null };
    try {
      payload = await parseSetOrgPayload(request);
    } catch {
      return NextResponse.json(
        { message: "Bad Request", reason: "INVALID_BODY", hint: "Request payload must be JSON or form data." },
        { status: 400 },
      );
    }

    if (!payload.activeOrgId || !UUID_REGEX.test(payload.activeOrgId)) {
      return NextResponse.json(
        {
          message: "Bad Request",
          reason: "INVALID_ACTIVE_ORG_ID",
          hint: "activeOrgId must be a valid UUID.",
        },
        { status: 400 },
      );
    }

    const activeOrgId = payload.activeOrgId;

    const accessibleOrganizations = await listAccessibleOrganizationsForUser({
      userId: context.appUserId!,
      role: context.role!,
    });
    if (!accessibleOrganizations.some((organization) => organization.id === activeOrgId)) {
      return NextResponse.json(
        {
          message: "Forbidden",
          reason: "ORG_CONTEXT_FORBIDDEN",
          hint: "You do not have access to the selected organization.",
        },
        { status: 403 },
      );
    }

    const redirectTo = sanitizeRedirectTo(payload.redirectTo);

    if (redirectTo) {
      const response = NextResponse.redirect(new URL(redirectTo, request.nextUrl.origin));
      applyActiveOrgCookie(response, activeOrgId, { httpOnly: true });
      applyOrganizationSelectionCookie(response, activeOrgId);
      clearPlatformContextCookie(response);
      return response;
    }

    const response = NextResponse.json({ ok: true, activeOrgId });
    applyActiveOrgCookie(response, activeOrgId, { httpOnly: true });
    applyOrganizationSelectionCookie(response, activeOrgId);
    clearPlatformContextCookie(response);
    return response;
  } catch (error) {
    observeHandledRouteError(error);
    throw error;
  }
}

async function deleteHandler(request: NextRequest) {
  try {
    const context = await ensureProvisionedUserAndContext(request);
    setRequestUserId(context.appUserId ?? null);
    if (context.status === "UNAUTHENTICATED") {
      return unauthorized(context.reason, context.hint, 401);
    }

    if (context.status === "NEEDS_PROVISIONING" || !context.appUserId) {
      return unauthorized(
        context.status === "NEEDS_PROVISIONING" ? context.reason : "APP_USER_NOT_RESOLVED",
        context.status === "NEEDS_PROVISIONING"
          ? context.hint
          : "An authenticated Planner account is required to clear organization context.",
        403,
      );
    }

    const response = NextResponse.json({ ok: true, userId: context.appUserId });
    clearOrganizationContextCookies(response);
    clearPlatformContextCookie(response);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    observeHandledRouteError(error);
    throw error;
  }
}

const getWithLogging = withApiRequestLogging("GET /api/me", getHandler);
const postWithLogging = withApiRequestLogging("POST /api/me", postHandler);
const deleteWithLogging = withApiRequestLogging("DELETE /api/me", deleteHandler);

export async function GET(request: NextRequest) {
  return getWithLogging(request, undefined);
}

export async function POST(request: NextRequest) {
  return postWithLogging(request, undefined);
}

export async function DELETE(request: NextRequest) {
  return deleteWithLogging(request, undefined);
}
