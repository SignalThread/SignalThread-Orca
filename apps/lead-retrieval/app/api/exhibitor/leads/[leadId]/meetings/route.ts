import { handleCalendarMeetingCreate } from "@/lib/integrations/calendar/routes";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    return await handleCalendarMeetingCreate(request, params);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[calendar/create]", { category: "meeting_create_failed" });
    return NextResponse.json({ ok: false, outcome: "failed" }, { status: 500 });
  }
}
