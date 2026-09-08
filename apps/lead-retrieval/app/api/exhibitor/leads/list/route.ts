import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReadExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import { parseLeadTemperature } from "@/lib/leads/temperature";
import {
  EventAccessDeniedError,
  assertEventIdAccessibleForUser
} from "@/lib/server/company-event-access";
import { resolveExhibitorAppActiveEventId } from "@/lib/server/exhibitor-app-active-event";

type LeadRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
  company_text: string | null;
  temperature: "hot" | "warm" | "cold" | null;
  priority_score: number;
  rating: number;
  status: string;
  follow_up_date: string | null;
  updated_at: string;
  created_at: string;
};

function parseSearchQuery(value?: string | null) {
  const next = String(value ?? "").trim();
  if (!next) {
    return null;
  }
  return next;
}

export async function GET(request: Request) {
  let queryCount = 0;
  const routeStart = Date.now();
  const incrementQueryCount = (label: string) => {
    queryCount += 1;
    console.log(`[SUPABASE QUERY ${queryCount}] ${label}`);
  };

  try {
    const sessionUser = await resolveApiSession(request);
    const role = String(sessionUser.role ?? "").trim().toLowerCase();

    const userId = String(sessionUser.userId ?? "").trim();
    const companyId = String(sessionUser.companyId ?? "").trim();
    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing exhibitor scope." }, { status: 400 });
    }

    const isBearer = /^Bearer\s/i.test(request.headers.get("authorization") ?? "");
    if (
      !(await canReadExhibitorLeadsInContext({
        userId,
        companyId,
        role,
        isBearer,
        activePlatformAdminCompanyId: sessionUser.activeCompanyId
      }))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const searchQuery = parseSearchQuery(url.searchParams.get("q"));
    const requestedEventId = String(url.searchParams.get("eventId") ?? "").trim() || null;
    // Browser exhibitor surfaces use the same server-authoritative active-event selection as the app shell.
    // Platform-admin account context has no exhibitor cookie projection, so it must provide the event explicitly.
    const eventId =
      requestedEventId ?? (role === "platform_admin" ? null : await resolveExhibitorAppActiveEventId(userId, null));

    if (!eventId) {
      return NextResponse.json(
        { error: "An accessible event is required for lead reads." },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[event-access-check]", { userId, eventId });
    }
    await assertEventIdAccessibleForUser(userId, eventId);

    const supabase = createAdminClient();

    incrementQueryCount("leads fetch");
    let query = (supabase as any)
      .from("leads")
      .select(
        "id, full_name, email, phone, job_title, company_text, temperature, priority_score, rating, status, follow_up_date, updated_at, created_at"
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    query = query.eq("event_id", eventId);

    if (searchQuery) {
      const normalized = searchQuery.replace(/,/g, " ");
      query = query.or(`full_name.ilike.%${normalized}%,email.ilike.%${normalized}%,company_text.ilike.%${normalized}%`);
    }

    const { data: rawData, error } = (await query) as {
      data: LeadRow[] | null;
      error: { message: string; code?: string } | null;
    };

    if (error) {
      return NextResponse.json(
        { error: `Failed to load leads: ${error.message} (${error.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    const leads = ((rawData ?? []) as LeadRow[]).map((row) => ({
      ...row,
      temperature: parseLeadTemperature(row.temperature),
    }));

    return NextResponse.json({ leads });
  } catch (error) {
    if (error instanceof EventAccessDeniedError) {
      return NextResponse.json({ error: "Event access denied" }, { status: 403 });
    }
    if (error instanceof Response) {
      return error;
    }

    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    console.log(`[SUPABASE QUERY COUNT] ${queryCount}`);
    console.log(`[ROUTE DURATION] ${Date.now() - routeStart}ms`);
  }
}
