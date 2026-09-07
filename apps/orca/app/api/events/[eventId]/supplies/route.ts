import { NextRequest, NextResponse } from "next/server";
import { requireEventRouteAccess } from "../_lib/event-route-auth";
import { getEventSupplyRegister, SuppliesError } from "@/lib/supplies";

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read"); if ("response" in auth) return auth.response;
  try { return NextResponse.json(await getEventSupplyRegister(eventId)); }
  catch (error) { if (error instanceof SuppliesError) return NextResponse.json({ error: error.message }, { status: error.status }); console.error("Supply register failed", error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
