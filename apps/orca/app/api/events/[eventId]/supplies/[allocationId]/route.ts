import { NextRequest, NextResponse } from "next/server";
import { requireEventRouteAccess } from "../../_lib/event-route-auth";
import { SuppliesError, updateSupplyAllocation } from "@/lib/supplies";
import { getPrisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; allocationId: string }> }) {
  const { eventId, allocationId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as { revision?: unknown; patch?: Record<string, unknown> };
    const allocation = await getPrisma().sessionSupplyAllocation.findFirst({ where: { id: allocationId, eventId, state: "ACTIVE" }, select: { sessionId: true } });
    if (!allocation) return NextResponse.json({ error: "Supply requirement not found" }, { status: 404 });
    return NextResponse.json(await updateSupplyAllocation({ eventId, sessionId: allocation.sessionId, allocationId, actorUserId: auth.user.id, revision: body.revision, patch: body.patch ?? {} }));
  } catch (error) {
    if (error instanceof SuppliesError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Event-wide Supply update failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
