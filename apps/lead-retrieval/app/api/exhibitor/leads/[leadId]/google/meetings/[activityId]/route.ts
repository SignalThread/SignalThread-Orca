import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { cancelGoogleMeeting, updateGoogleMeeting } from "@/lib/integrations/google/calendar-service";

export const runtime = "nodejs";

async function context(request: Request, params: Promise<{ leadId: string; activityId: string }>) {
  const [session, resolved] = await Promise.all([resolveApiSession(request), params]);
  return {
    userId: String(session.userId ?? ""), companyId: String(session.companyId ?? ""), role: String(session.role ?? ""),
    isBearer: /^Bearer\s/i.test(request.headers.get("authorization") ?? ""), leadId: resolved.leadId, activityId: resolved.activityId
  };
}

function response(result: { ok: boolean; outcome: string }) {
  const status = result.ok ? 200 : result.outcome === "invalid_input" ? 400 : result.outcome === "unauthorized" ? 403 : result.outcome === "lead_not_found" || result.outcome === "meeting_not_found" ? 404 : result.outcome === "missing_connection" || result.outcome === "reconnect_required" || result.outcome === "missing_capability" || result.outcome === "conflict" ? 409 : result.outcome === "unknown" ? 202 : 502;
  return NextResponse.json(result, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ leadId: string; activityId: string }> }) {
  try {
    const [base, payload] = await Promise.all([context(request, params), request.json().catch(() => null) as Promise<Record<string, unknown> | null>]);
    if (!payload) return NextResponse.json({ ok: false, outcome: "invalid_input" }, { status: 400 });
    return response(await updateGoogleMeeting({ ...base, operationKey: String(payload.operationKey ?? ""), startsAt: String(payload.startsAt ?? ""), endsAt: String(payload.endsAt ?? ""), timezone: String(payload.timezone ?? ""), title: String(payload.title ?? "") }));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[google/calendar-update]", { category: "meeting_update_failed" });
    return NextResponse.json({ ok: false, outcome: "failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ leadId: string; activityId: string }> }) {
  try {
    const [base, payload] = await Promise.all([context(request, params), request.json().catch(() => null) as Promise<Record<string, unknown> | null>]);
    if (!payload) return NextResponse.json({ ok: false, outcome: "invalid_input" }, { status: 400 });
    return response(await cancelGoogleMeeting({ ...base, operationKey: String(payload.operationKey ?? "") }));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[google/calendar-cancel]", { category: "meeting_cancel_failed" });
    return NextResponse.json({ ok: false, outcome: "failed" }, { status: 500 });
  }
}
