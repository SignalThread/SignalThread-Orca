import { NextRequest, NextResponse } from "next/server";
import { observeHandledRouteError } from "@/lib/observability/api-route";
import { createSecurityComplianceRecord, listSecurityComplianceRecords, SecurityComplianceError, summarizeSecurityComplianceReadiness, updateSecurityComplianceRecord } from "@/lib/security-compliance";
import { requireEventRouteAccess } from "../_lib/event-route-auth";

export const runtime = "nodejs";

function fail(error: unknown, operation: string) {
  observeHandledRouteError(error);
  console.error("security-compliance.request.failed", { operation, error: error instanceof Error ? error.message : String(error) });
  if (error instanceof SecurityComplianceError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "read");
  if ("response" in auth) return auth.response;
  try {
    const records = await listSecurityComplianceRecords(eventId, request.nextUrl.searchParams.get("area"));
    return NextResponse.json({ records, canEdit: auth.canEdit, readiness: summarizeSecurityComplianceReadiness(records) });
  } catch (error) { return fail(error, "list"); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try { return NextResponse.json(await createSecurityComplianceRecord(eventId, auth.user.id, await request.json()), { status: 201 }); }
  catch (error) { return fail(error, "create"); }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const auth = await requireEventRouteAccess(request, eventId, "write");
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    return NextResponse.json(await updateSecurityComplianceRecord(eventId, auth.user.id, String(body.id ?? ""), body));
  } catch (error) { return fail(error, "update"); }
}
