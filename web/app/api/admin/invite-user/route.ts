import { NextRequest, NextResponse } from "next/server";
import { EventMemberRole, UserRole } from "@prisma/client";
import { withApiRequestLogging, observeHandledRouteError } from "@/lib/observability/api-route";
import { getPrisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/request-user";
import { getSupabaseAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITABLE_ROLES = new Set<UserRole>([
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.MEMBER,
  UserRole.VIEWER,
]);

type InviteBody = {
  email?: unknown;
  orgId?: unknown;
  role?: unknown;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function deriveNameFromEmail(email: string): string | null {
  const localPart = email.split("@")[0]?.trim() ?? "";
  if (!localPart) return null;

  const words = localPart
    .split(/[._-]+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1));

  return words.length > 0 ? words.join(" ") : null;
}

async function postHandler(request: NextRequest) {
  const currentUser = await resolveRequestUser(request);
  if ("error" in currentUser) {
    return NextResponse.json(
      {
        message: currentUser.error.status === 403 ? "Forbidden" : "Unauthorized",
        reason: currentUser.error.reason,
        hint: currentUser.error.hint,
      },
      { status: currentUser.error.status },
    );
  }

  let body: InviteBody;
  try {
    body = (await request.json()) as InviteBody;
  } catch {
    return NextResponse.json(
      { message: "Bad Request", reason: "INVALID_JSON", hint: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (typeof body.email !== "string" || !EMAIL_REGEX.test(body.email.trim())) {
    return NextResponse.json(
      { message: "Bad Request", reason: "INVALID_EMAIL", hint: "email must be a valid email address." },
      { status: 400 },
    );
  }

  if (typeof body.orgId !== "string" || !UUID_REGEX.test(body.orgId.trim())) {
    return NextResponse.json(
      { message: "Bad Request", reason: "INVALID_ORG_ID", hint: "orgId must be a valid UUID." },
      { status: 400 },
    );
  }

  if (typeof body.role !== "string" || !INVITABLE_ROLES.has(body.role as UserRole)) {
    return NextResponse.json(
      {
        message: "Bad Request",
        reason: "INVALID_ROLE",
        hint: "role must be one of OWNER, ADMIN, MEMBER, VIEWER.",
      },
      { status: 400 },
    );
  }

  const targetOrgId = body.orgId.trim();
  const targetRole = body.role as UserRole;
  const normalizedEmail = normalizeEmail(body.email);
  const caller = currentUser.user;

  const callerIsSuperAdmin = caller.role === UserRole.SUPER_ADMIN;
  const callerIsOrgAdmin = (caller.role === UserRole.OWNER || caller.role === UserRole.ADMIN) && caller.orgId === targetOrgId;

  if (!callerIsSuperAdmin && !callerIsOrgAdmin) {
    return NextResponse.json(
      {
        message: "Forbidden",
        reason: "FORBIDDEN_INVITE_SCOPE",
        hint: "Only SUPER_ADMIN or OWNER/ADMIN of the active organization can invite users.",
      },
      { status: 403 },
    );
  }

  const organization = await getPrisma().organization.findUnique({
    where: { id: targetOrgId },
    select: { id: true },
  });

  if (!organization) {
    return NextResponse.json(
      { message: "Bad Request", reason: "ORG_NOT_FOUND", hint: "orgId does not exist." },
      { status: 400 },
    );
  }

  const redirectTo = new URL("/auth/callback", request.nextUrl.origin).toString();
  const eventRoleForInvitee =
    targetRole === UserRole.SUPER_ADMIN || targetRole === UserRole.OWNER || targetRole === UserRole.ADMIN
      ? EventMemberRole.EVENT_ADMIN
      : EventMemberRole.EVENT_VIEWER;

  try {
    const supabaseAdmin = getSupabaseAdminClient();
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
    });

    if (inviteError) {
      return NextResponse.json(
        {
          message: "Invite failed",
          reason: "SUPABASE_INVITE_FAILED",
          hint: inviteError.message,
        },
        { status: 400 },
      );
    }

    const result = await getPrisma().$transaction(async (tx) => {
      // Invitees have no Platform Core identity until they accept, so this row is created
      // unlinked and gets its `platformUserId` from the transitional email bridge on first
      // sign-in. Invites must move to Platform Core (audit A.5) before the bridge can be
      // switched off, otherwise invited users would never link.
      const user = await tx.user.upsert({
        where: { email: normalizedEmail },
        update: {
          orgId: targetOrgId,
          role: targetRole,
        },
        create: {
          orgId: targetOrgId,
          email: normalizedEmail,
          name: deriveNameFromEmail(normalizedEmail),
          role: targetRole,
        },
        select: { id: true },
      });

      // Event visibility is driven by EventMember rows; org Membership alone does not grant event access.
      const membership = await tx.membership.upsert({
        where: {
          orgId_userId: {
            orgId: targetOrgId,
            userId: user.id,
          },
        },
        update: {},
        create: {
          orgId: targetOrgId,
          userId: user.id,
        },
        select: { id: true },
      });

      const events = await tx.event.findMany({
        where: { orgId: targetOrgId },
        select: { id: true },
      });

      let eventsProvisionedCount = 0;
      if (events.length > 0) {
        const eventMemberships = await tx.eventMember.createMany({
          data: events.map((event) => ({
            eventId: event.id,
            userId: user.id,
            eventRole: eventRoleForInvitee,
          })),
          skipDuplicates: true,
        });
        eventsProvisionedCount = eventMemberships.count;
      }

      return {
        userId: user.id,
        membershipId: membership.id,
        eventsProvisionedCount,
      };
    });

    return NextResponse.json({
      ok: true,
      invitedEmail: normalizedEmail,
      orgId: targetOrgId,
      role: targetRole,
      userId: result.userId,
      membershipId: result.membershipId,
      eventsProvisionedCount: result.eventsProvisionedCount,
    });
  } catch (error) {
    observeHandledRouteError(error);
    console.error("POST /api/admin/invite-user failed", {
      message: error instanceof Error ? error.message : String(error),
      callerUserId: caller.id,
      targetOrgId,
      normalizedEmail,
    });

    return NextResponse.json(
      {
        message: "Internal server error",
        reason: "INVITE_USER_FAILED",
        hint: "Unexpected error while inviting user.",
      },
      { status: 500 },
    );
  }
}

const postWithLogging = withApiRequestLogging("POST /api/admin/invite-user", postHandler);

export async function POST(request: NextRequest) {
  return postWithLogging(request, undefined);
}
