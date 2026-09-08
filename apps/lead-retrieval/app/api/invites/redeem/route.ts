import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUserEmailForRedeem } from "@/lib/server/invites/invite-redeem-auth-email";
import {
  executeInviteRedeemCore,
  loadInviteRowByCodeHash,
  sha256InviteCode
} from "@/lib/server/invites/invite-redeem-execute";

type RedeemBody = {
  code?: string;
};

export async function POST(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const userId = String(sessionUser.userId ?? "").trim();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload: RedeemBody = {};
    try {
      payload = (await request.json()) as RedeemBody;
    } catch {
      payload = {};
    }

    const code = String(payload.code ?? "").trim();
    if (!code) {
      return NextResponse.json({ error: "Code is required." }, { status: 400 });
    }

    const admin = createAdminClient();

    let userEmail = "";
    try {
      const resolved = await getAuthenticatedUserEmailForRedeem(admin, userId);
      userEmail = resolved ?? "";
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed loading authenticated user.";
      throw new Error(message);
    }

    if (!userEmail) {
      return NextResponse.json(
        { error: "Could not resolve an email for this account. Sign in again or contact support." },
        { status: 401 }
      );
    }

    const codeHash = sha256InviteCode(code);
    const inviteRow = await loadInviteRowByCodeHash(admin, codeHash);
    if (!inviteRow?.id || !String(inviteRow.event_id ?? "").trim()) {
      return NextResponse.json({ error: "Invalid or expired invite code." }, { status: 400 });
    }

    const result = await executeInviteRedeemCore(admin, { userId, userEmail, inviteRow });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.httpStatus });
    }

    return NextResponse.json({
      ok: true,
      eventId: result.eventId,
      exhibitorCompanyId: result.exhibitorCompanyId,
      permissions: result.permissions,
      eventAccessMode: result.eventAccessMode,
      grantedEventIds: result.grantedEventIds
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
