import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createGoogleMeeting } from "@/lib/integrations/google/calendar-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const session = await resolveApiSession(request);
    const { leadId } = await params;
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return NextResponse.json({ ok: false, outcome: "invalid_input" }, { status: 400 });
    const result = await createGoogleMeeting({
      userId: String(session.userId ?? ""), companyId: String(session.companyId ?? ""), role: String(session.role ?? ""),
      isBearer: /^Bearer\s/i.test(request.headers.get("authorization") ?? ""), leadId,
      idempotencyKey: String(payload.idempotencyKey ?? ""), startsAt: String(payload.startsAt ?? ""),
      endsAt: String(payload.endsAt ?? ""), timezone: String(payload.timezone ?? ""), title: String(payload.title ?? ""),
      includeMeet: payload.includeMeet === true
    });
    const status = result.ok ? 200 : result.outcome === "invalid_input" || result.outcome === "missing_email" ? 400 : result.outcome === "unauthorized" ? 403 : result.outcome === "lead_not_found" ? 404 : result.outcome === "missing_connection" || result.outcome === "reconnect_required" || result.outcome === "missing_capability" ? 409 : result.outcome === "unknown" ? 202 : 502;
    return NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[google/calendar-create]", { category: "meeting_create_failed" });
    return NextResponse.json({ ok: false, outcome: "failed" }, { status: 500 });
  }
}
