import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { getMobileAccessibleEventsForSession } from "@/lib/server/mobile-accessible-events";

export async function GET(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request, {
      enforceMobileAppAccess: false
    });
    const url = new URL(request.url);
    const preferredEventId = url.searchParams.get("preferredEventId");
    const payload = await getMobileAccessibleEventsForSession(sessionUser, {
      preferredEventId
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
