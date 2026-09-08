import { NextResponse } from "next/server";
import { getCurrentSessionUser, isCompanyAccountAdminSession } from "@/lib/auth/session";
import {
  disconnectHubSpotIntegrationForAccount,
  HubSpotDisconnectError,
} from "@/lib/integrations/hubspot/disconnect";

export async function POST() {
  const sessionUser = await getCurrentSessionUser();
  if (!sessionUser?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCompanyAccountAdminSession(sessionUser)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!sessionUser.company_id) {
    return NextResponse.json({ error: "Missing exhibitor account." }, { status: 400 });
  }

  try {
    await disconnectHubSpotIntegrationForAccount(sessionUser.company_id);
    return NextResponse.json({ success: true, disconnected: true });
  } catch (error) {
    console.error("[hubspot/disconnect]", {
      accountId: sessionUser.company_id,
      code: error instanceof HubSpotDisconnectError ? error.code : "UNKNOWN",
      status: error instanceof HubSpotDisconnectError ? error.status : undefined,
      message: error instanceof Error ? error.message : "Unknown HubSpot disconnect error",
    });

    if (error instanceof HubSpotDisconnectError && error.code === "MISSING_ENV") {
      return NextResponse.json(
        { error: "HubSpot disconnect is not configured. Try again later." },
        { status: 500 }
      );
    }

    if (error instanceof HubSpotDisconnectError && error.code === "REVOKE_FAILED") {
      return NextResponse.json(
        { error: "HubSpot is temporarily unavailable. Try disconnecting again in a moment." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Unable to disconnect HubSpot. Try again in a moment." },
      { status: 500 }
    );
  }
}
