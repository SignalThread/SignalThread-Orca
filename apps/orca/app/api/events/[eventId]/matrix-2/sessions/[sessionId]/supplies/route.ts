import { NextRequest, NextResponse } from "next/server";
import { requireEventRouteAccess } from "../../../../_lib/event-route-auth";
import { addCatalogSupply, addSupplyDependency, applySupplySuggestions, createCustomSupply, getSessionSupplies, removeSupplyAllocation, resolveSupplyDependency, setSessionSuppliesNotNeeded, SuppliesError, updateSessionSupplyState, updateSupplyAllocation } from "@/lib/supplies";

export const runtime = "nodejs";
function failure(error: unknown) {
  if (error instanceof SuppliesError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("Supplies route failed", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read"); if ("response" in auth) return auth.response;
  try { return NextResponse.json(await getSessionSupplies(eventId, sessionId)); } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write"); if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "apply") return NextResponse.json(await applySupplySuggestions({ eventId, sessionId, actorUserId: auth.user.id, items: body.items as never, responsibleUserId: body.responsibleUserId, idempotencyKey: String(body.idempotencyKey ?? "") || undefined }));
    if (body.action === "custom") return NextResponse.json(await createCustomSupply({ eventId, sessionId, actorUserId: auth.user.id, supplyItemId: body.supplyItemId, name: body.name, category: body.category, unit: body.unit, quantity: body.quantity, source: body.source, responsibleUserId: body.responsibleUserId, setupDeadline: body.setupDeadline, placement: body.placement, fulfillment: body.fulfillment, notes: body.notes, showFlowCueId: body.showFlowCueId, budgetLineItemId: body.budgetLineItemId, idempotencyKey: body.idempotencyKey, confirmDuplicate: body.confirmDuplicate }), { status: 201 });
    if (body.action === "catalog") return NextResponse.json(await addCatalogSupply({ eventId, sessionId, actorUserId: auth.user.id, supplyItemId: body.supplyItemId, quantity: body.quantity }), { status: 201 });
    if (body.action === "not-needed") return NextResponse.json(await setSessionSuppliesNotNeeded({ eventId, sessionId, actorUserId: auth.user.id, notNeeded: body.notNeeded === true }));
    if (body.action === "dependency") return NextResponse.json(await addSupplyDependency({ eventId, sessionId, allocationId: String(body.allocationId), actorUserId: auth.user.id, type: body.type, label: body.label, blocking: body.blocking }), { status: 201 });
    if (body.action === "resolve-dependency") return NextResponse.json(await resolveSupplyDependency({ eventId, sessionId, allocationId: String(body.allocationId), dependencyId: String(body.dependencyId), notes: body.notes }));
    throw new SuppliesError("Unknown supplies action");
  } catch (error) { return failure(error); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write"); if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    if (body.target === "session") return NextResponse.json(await updateSessionSupplyState({ eventId, sessionId, actorUserId: auth.user.id, revision: body.revision, ...("sessionNotes" in body ? { sessionNotes: body.sessionNotes } : {}), registrationProfile: body.registrationProfile }));
    return NextResponse.json(await updateSupplyAllocation({ eventId, sessionId, allocationId: String(body.allocationId), actorUserId: auth.user.id, revision: body.revision, patch: body.patch ?? {} }));
  } catch (error) { return failure(error); }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ eventId: string; sessionId: string }> }) {
  const { eventId, sessionId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write"); if ("response" in auth) return auth.response;
  try { const allocationId = request.nextUrl.searchParams.get("allocationId"); if (!allocationId) throw new SuppliesError("Allocation is required"); return NextResponse.json(await removeSupplyAllocation({ eventId, sessionId, allocationId, actorUserId: auth.user.id })); } catch (error) { return failure(error); }
}
