import { NextRequest, NextResponse } from "next/server";
import { createFnbSourceMenu, FnbCatalogError } from "@/lib/fnb-catalog";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    const sourceMenu = await createFnbSourceMenu(eventId, body);
    return NextResponse.json(sourceMenu, { status: 201 });
  } catch (error) {
    if (error instanceof FnbCatalogError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    console.error("POST source menu failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
