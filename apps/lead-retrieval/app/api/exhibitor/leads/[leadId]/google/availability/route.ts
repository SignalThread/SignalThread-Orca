import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { getGoogleAvailability } from "@/lib/integrations/google/calendar-service";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    const session = await resolveApiSession(request);
    const { leadId } = await params;
    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) return NextResponse.json({ ok: false, outcome: "invalid_input" }, { status: 400 });
    const result = await getGoogleAvailability({
      userId: String(session.userId ?? ""), companyId: String(session.companyId ?? ""), role: String(session.role ?? ""),
      isBearer: /^Bearer\s/i.test(request.headers.get("authorization") ?? ""), leadId,
      windowStartLocal: String(payload.windowStartLocal ?? ""), windowEndLocal: String(payload.windowEndLocal ?? ""),
      timezone: String(payload.timezone ?? ""), durationMinutes: Number(payload.durationMinutes)
    });
    const status = result.ok ? 200 : result.outcome === "invalid_input" || result.outcome === "missing_email" ? 400 : result.outcome === "unauthorized" ? 403 : result.outcome === "lead_not_found" ? 404 : result.outcome === "missing_connection" || result.outcome === "reconnect_required" || result.outcome === "missing_capability" ? 409 : 502;
    if (!result.ok) {
      const category = "errorCategory" in result
        ? result.errorCategory
        : ["missing_capability", "missing_connection", "reconnect_required", "invalid_input"].includes(result.outcome)
          ? result.outcome
          : "provider_unavailable";
      return NextResponse.json({ ok: false, outcome: result.outcome, category }, { status });
    }
    return NextResponse.json(result, { status });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[google/calendar-availability]", { category: "availability_failed" });
    return NextResponse.json({ ok: false, outcome: "failed" }, { status: 500 });
  }
}
