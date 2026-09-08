import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { getOrganizerScope } from "@/lib/data/organizer-scope";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  evaluateAppAccessGrant,
  normalizeEventUserPermissions,
  reconcileLicenseSeatsUsed,
  toEventUserPermissionsJson
} from "@/lib/server/event-user-access";
import type { Json } from "@/types/database";

const INVITE_REDIRECT_TO =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? "https://lr.signalthread.ai/auth/callback";

type InvitePayload = {
  eventId?: string;
  email?: string;
  fullName?: string;
  exhibitorCompanyId?: string;
  permissions?: unknown;
};

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (sessionUser.role !== "organizer_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = (await request.json().catch(() => ({}))) as InvitePayload;
    const eventId = String(payload.eventId ?? "").trim();
    const email = String(payload.email ?? "").trim().toLowerCase();
    const fullName = String(payload.fullName ?? "").trim();
    const exhibitorCompanyId = String(payload.exhibitorCompanyId ?? "").trim();
    const normalizedPermissions = normalizeEventUserPermissions(payload.permissions ?? []);
    const permissions = toEventUserPermissionsJson(normalizedPermissions) as Json;

    if (!eventId || !email || !fullName || !exhibitorCompanyId) {
      return NextResponse.json(
        { error: "eventId, email, fullName, and exhibitorCompanyId are required." },
        { status: 400 }
      );
    }

    const scope = await getOrganizerScope(sessionUser.id);
    const scopedEventIds = new Set(scope.events.map((event) => event.id));
    if (!scopedEventIds.has(eventId)) {
      return NextResponse.json({ error: "Selected event is outside organizer scope." }, { status: 403 });
    }

    const supabase = createAdminClient();

    const { data: exhibitorRow, error: exhibitorError } = await (supabase as any)
      .from("exhibitors")
      .select("id, company_id")
      .eq("event_id", eventId)
      .eq("company_id", exhibitorCompanyId)
      .maybeSingle();

    if (exhibitorError || !exhibitorRow) {
      return NextResponse.json(
        { error: exhibitorError?.message ?? "Exhibitor is not scoped to this event." },
        { status: 400 }
      );
    }

    const grant = await evaluateAppAccessGrant({
      eventId,
      exhibitorCompanyId,
      requestedAppAccess: normalizedPermissions.app
    });
    if (!grant.ok) {
      return NextResponse.json({ error: grant.error }, { status: 409 });
    }
    const canonicalLicenseId =
      grant.decision === "seats_available" ? grant.licenseId : null;

    const { data: invitedData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: INVITE_REDIRECT_TO
    });
    if (inviteError) {
      return NextResponse.json({ error: inviteError.message ?? "Failed to send invite." }, { status: 400 });
    }

    const invitedUserId = invitedData.user?.id;
    if (!invitedUserId) {
      return NextResponse.json(
        { error: "Invite succeeded but Supabase user id was not returned." },
        { status: 500 }
      );
    }

    let createdUser = false;
    const rollback = async () => {
      await (supabase as any).from("event_users").delete().eq("event_id", eventId).eq("user_id", invitedUserId);
      if (createdUser) {
        await (supabase as any).from("users").delete().eq("id", invitedUserId);
      }
      await supabase.auth.admin.deleteUser(invitedUserId);
    };

    const { data: existingUser, error: existingUserError } = await (supabase as any)
      .from("users")
      .select("id, role, company_id, license_id")
      .eq("id", invitedUserId)
      .maybeSingle();

    if (existingUserError) {
      await rollback();
      return NextResponse.json(
        { error: existingUserError.message ?? "Failed loading existing user profile." },
        { status: 400 }
      );
    }

    let userInsertError: { message?: string } | null = null;
    if (!existingUser) {
      const { error } = await (supabase as any).from("users").insert({
        id: invitedUserId,
        role: "exhibitor_admin",
        company_id: exhibitorCompanyId,
        full_name: fullName,
        email,
        license_id: canonicalLicenseId,
        created_at: new Date().toISOString()
      });
      userInsertError = error;
      if (!error) {
        createdUser = true;
      }
    }

    if (userInsertError) {
      await rollback();
      return NextResponse.json(
        { error: userInsertError.message ?? "Failed creating user profile." },
        { status: 400 }
      );
    }

    const { error: eventUserError } = await (supabase as any).from("event_users").insert({
      event_id: eventId,
      user_id: invitedUserId,
      exhibitor_company_id: exhibitorCompanyId,
      status: "invited",
      permissions,
      created_at: new Date().toISOString()
    });

    if (eventUserError) {
      await rollback();
      return NextResponse.json(
        { error: eventUserError.message ?? "Failed creating event user scope." },
        { status: 400 }
      );
    }

    if (normalizedPermissions.app) {
      await reconcileLicenseSeatsUsed({ eventId, exhibitorCompanyId }).catch((err) => {
        console.error("[organizer/invite] reconciliation failed", err);
      });
    }

    return NextResponse.json({ ok: true, userId: invitedUserId }, { status: 201 });
  } catch (error) {
    console.error("[organizer/invite]", error);
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
