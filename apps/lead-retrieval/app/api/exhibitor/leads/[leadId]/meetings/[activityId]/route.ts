import {
  handleCalendarMeetingCancel,
  handleCalendarMeetingUpdate
} from "@/lib/integrations/calendar/routes";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Params = Promise<{ leadId: string; activityId: string }>;

export async function PATCH(request: Request, { params }: { params: Params }) {
  try {
    return await handleCalendarMeetingUpdate(request, params);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[calendar/update]", { category: "meeting_update_failed" });
    return NextResponse.json({ ok: false, outcome: "failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  try {
    return await handleCalendarMeetingCancel(request, params);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[calendar/cancel]", { category: "meeting_cancel_failed" });
    return NextResponse.json({ ok: false, outcome: "failed" }, { status: 500 });
  }
}
