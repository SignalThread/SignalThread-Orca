import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  EventAccessDeniedError,
  resolveValidatedActiveEventIdForUser
} from "@/lib/server/company-event-access";
import {
  loadEventBriefingStrategy,
  parseEventBriefingStrategyPatch,
  saveEventBriefingStrategy,
  type EventBriefingStrategyV1,
} from "@/lib/server/import-wizard/event-briefing-strategy-service";

export async function GET(request: Request) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const userId = String(session.userId ?? "").trim();
    const companyId = String(session.companyId ?? "").trim();
    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const preferredEventId = String(new URL(request.url).searchParams.get("eventId") ?? "").trim() || null;
    const { eventId } = await resolveValidatedActiveEventIdForUser(userId, preferredEventId);

    if (process.env.NODE_ENV === "development") {
      console.log("[event-access-check]", { userId, eventId });
    }

    if (!eventId) {
      return NextResponse.json({
        strategy: {} as EventBriefingStrategyV1,
        eventId: null,
        eventName: null,
        message: "No event is linked to this exhibitor account yet. Briefing strategy requires an event scope.",
      });
    }

    const strategy = await loadEventBriefingStrategy(eventId);
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("events")
      .select("name")
      .eq("id", eventId)
      .maybeSingle();
    const eventName = (data as { name?: string } | null)?.name ?? null;

    return NextResponse.json({ strategy, eventId, eventName });
  } catch (e) {
    if (e instanceof EventAccessDeniedError) {
      return NextResponse.json({ error: "Event access denied" }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await resolveApiSession(request);
    if (String(session.role ?? "").toLowerCase() !== "exhibitor_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const userId = String(session.userId ?? "").trim();
    const companyId = String(session.companyId ?? "").trim();
    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { strategy?: unknown; eventId?: string } | null;
    if (!body?.strategy || typeof body.strategy !== "object") {
      return NextResponse.json({ error: "strategy object required." }, { status: 400 });
    }

    const preferredEventId = body.eventId != null ? String(body.eventId).trim() || null : null;
    const { eventId } = await resolveValidatedActiveEventIdForUser(userId, preferredEventId);

    if (process.env.NODE_ENV === "development") {
      console.log("[event-access-check]", { userId, eventId });
    }

    if (!eventId) {
      return NextResponse.json(
        { error: "No event linked to this account. Briefing strategy requires an exhibitor event." },
        { status: 400 }
      );
    }

    const patch = parseEventBriefingStrategyPatch(body.strategy);
    const strategy = await saveEventBriefingStrategy(eventId, patch);
    return NextResponse.json({ ok: true, strategy });
  } catch (e) {
    if (e instanceof EventAccessDeniedError) {
      return NextResponse.json({ error: "Event access denied" }, { status: 403 });
    }
    const msg = e instanceof Error ? e.message : "";
    if (msg === "no_event") {
      return NextResponse.json(
        { error: "No event linked to this account. Briefing strategy requires an exhibitor event." },
        { status: 400 }
      );
    }
    if (msg === "invalid_strategy_patch" || msg === "empty_strategy_patch") {
      return NextResponse.json({ error: "Strategy updates must contain valid changed fields." }, { status: 400 });
    }
    return NextResponse.json({ error: msg || "Internal error" }, { status: 500 });
  }
}
