import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { backfillEventUsersMissingExhibitorScope } from "@/lib/server/event-user-access";

type BackfillPayload = {
  dryRun?: boolean;
  limit?: number;
};

export async function POST(request: Request) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (sessionUser.role !== "platform_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let payload: BackfillPayload = {};
    try {
      payload = (await request.json()) as BackfillPayload;
    } catch {
      payload = {};
    }

    const dryRun = payload.dryRun ?? false;
    const limit = payload.limit;

    const result = await backfillEventUsersMissingExhibitorScope({
      dryRun,
      limit
    });

    console.info("admin.backfill_event_users_exhibitor_scope", {
      dryRun,
      scanned: result.scanned,
      updated: result.updated,
      skipped: result.skipped
    });

    return NextResponse.json({
      ok: true,
      dryRun,
      ...result
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
