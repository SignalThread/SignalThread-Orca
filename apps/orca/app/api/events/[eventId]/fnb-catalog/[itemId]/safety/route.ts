import { NextRequest, NextResponse } from "next/server";
import { FnbMenuSafetyError, updateFnbMenuItemSafety } from "@/lib/fnb-menu-safety";
import { requireEventRouteAccess } from "../../../_lib/event-route-auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; itemId: string }> }) {
  const { eventId, itemId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    return NextResponse.json(await updateFnbMenuItemSafety(eventId, itemId, auth.user.id, body));
  } catch (error) {
    if (error instanceof FnbMenuSafetyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    console.error("PATCH menu item safety failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
