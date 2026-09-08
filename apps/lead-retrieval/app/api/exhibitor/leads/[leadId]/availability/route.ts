import { handleCalendarAvailability } from "@/lib/integrations/calendar/routes";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    return await handleCalendarAvailability(request, params);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[calendar/availability]", { category: "availability_failed" });
    return NextResponse.json({ ok: false, outcome: "failed" }, { status: 500 });
  }
}
