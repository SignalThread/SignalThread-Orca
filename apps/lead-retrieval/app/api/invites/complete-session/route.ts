import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { tryCompletePendingInvitesAfterAuth } from "@/lib/server/invites/invite-redeem-execute";
import { activateInvitedMembershipsWithSeatEnforcement } from "@/lib/server/event-user-access";
import { resolveInviteActivationScopeFromAuthMetadata } from "@/lib/server/invites/invite-auth-membership-activation";

type Body = {
  /** Same as `POST /api/invites/redeem` body `code` — not the Supabase PKCE `code` */
  invite_code?: string | null;
};

async function resolveInviteActivationScopeForAuthenticatedUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(error.message ?? "Failed loading auth invite metadata.");
  }

  return resolveInviteActivationScopeFromAuthMetadata(
    (data.user?.user_metadata ?? {}) as Record<string, unknown>
  );
}

/**
 * After the browser establishes a Supabase session (e.g. hash fragment flow),
 * run the same invite completion as the server `/auth/callback` path so
 * `public.users` + `event_users` are granted before routing.
 */
export async function POST(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const userId = String(sessionUser.userId ?? "").trim();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload: Body = {};
    try {
      payload = (await request.json()) as Body;
    } catch {
      payload = {};
    }

    const admin = createAdminClient();
    const rawInviteCode =
      typeof payload.invite_code === "string" && payload.invite_code.trim()
        ? payload.invite_code.trim()
        : null;

    const logs = await tryCompletePendingInvitesAfterAuth({ admin, userId, rawInviteCode });

    const activationScope = await resolveInviteActivationScopeForAuthenticatedUser(admin, userId);
    const activation = await activateInvitedMembershipsWithSeatEnforcement(userId, activationScope);
    if (activation.blocked.length > 0) {
      console.error("api.invites.complete_session.activate_failed", {
        userId,
        activated: activation.activated,
        blocked: activation.blocked
      });
    }

    return NextResponse.json({ ok: true, invite_completion: logs, activation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
