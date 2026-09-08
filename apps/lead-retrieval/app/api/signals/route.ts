import { NextResponse } from "next/server";
import { normalizeSessionRole, type SessionUser } from "@/lib/auth/session";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSignalsForUser,
  mapSignalRow,
  toSignalInsertPatch
} from "@/lib/data/signals";
import { assertEventIdAccessibleForUser } from "@/lib/server/company-event-access";
import { SIGNAL_SELECT_COLUMNS } from "@/lib/signals/event-scoped-signal-copies";
import { SignalMutationPayload } from "@/components/signals/signal-types";
import { loadSignalEventContext } from "@/lib/server/signals/event-scoped-signal-copies";
import { normalizeSignalScope, signalScopeRequiresEvent } from "@/lib/signals/signal-scope";

export async function GET(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const normalizedSessionUser: SessionUser = {
      id: sessionUser.userId,
      role: normalizeSessionRole(sessionUser.role),
      company_id: sessionUser.companyId || null,
      full_name: null,
      fullName: null
    };

    const canReadSignals =
      normalizedSessionUser.role === "platform_admin" || normalizedSessionUser.role === "exhibitor_admin";
    if (!canReadSignals) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search") ?? undefined;
    const status = (url.searchParams.get("status") ?? "all") as "all" | "active" | "disabled";
    const category = (url.searchParams.get("category") ?? "all") as
      | "all"
      | "AI-Powered"
      | "Contextual"
      | "Custom"
      | "Call-to-Action";
    const template = url.searchParams.get("template");
    const patternModeOnly = url.searchParams.get("patternMode") === "1";
    const activeOnly = url.searchParams.get("activeOnly") === "1";
    const includeDefaults = url.searchParams.get("includeDefaults") === "1";
    const eventId = url.searchParams.get("eventId");

    const signals = await getSignalsForUser(normalizedSessionUser, {
      search,
      status,
      category,
      template,
      patternModeOnly,
      activeOnly,
      includeDefaults,
      eventId
    });

    return NextResponse.json({ signals });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessionUser = await resolveApiSession(request);
    const normalizedSessionUser: SessionUser = {
      id: sessionUser.userId,
      role: normalizeSessionRole(sessionUser.role),
      company_id: sessionUser.companyId || null,
      full_name: null,
      fullName: null
    };

    const canCreateSignals =
      normalizedSessionUser.role === "platform_admin" || normalizedSessionUser.role === "exhibitor_admin";
    if (!canCreateSignals) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let payload = {} as SignalMutationPayload;
    try {
      payload = (await request.json()) as SignalMutationPayload;
    } catch {
      payload = {} as SignalMutationPayload;
    }

    if (!payload?.name?.trim()) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
    }

    if (!payload?.default_prompt?.trim()) {
      return NextResponse.json({ error: "Default prompt text is required" }, { status: 400 });
    }

    if (!payload?.category) {
      return NextResponse.json({ error: "Category is required" }, { status: 400 });
    }

    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId")?.trim() || null;
    if (normalizedSessionUser.role === "exhibitor_admin" && !eventId) {
      return NextResponse.json(
        { error: "Event id is required for exhibitor Campaign Agent creation." },
        { status: 400 }
      );
    }

    const requestedScope = normalizeSignalScope(payload.signal_scope, eventId ? "event" : "company");
    if (requestedScope === "default") {
      return NextResponse.json(
        { error: "Default Campaign Agents are starter templates and cannot be created here." },
        { status: 400 }
      );
    }

    let companyId = normalizedSessionUser.company_id ?? null;
    if (eventId) {
      await assertEventIdAccessibleForUser(normalizedSessionUser.id, eventId);
      const eventContext = await loadSignalEventContext(eventId);
      companyId = eventContext.companyId;
      if (eventContext.archived && signalScopeRequiresEvent(requestedScope)) {
        return NextResponse.json(
          { error: "Event-scoped and private Campaign Agents are read-only after an event ends." },
          { status: 409 }
        );
      }
    }

    if (!companyId) {
      return NextResponse.json(
        { error: "A company or event scope is required to create a Campaign Agent." },
        { status: 400 }
      );
    }

    // TODO: reintroduce RBAC checks for signal create once permissions are finalized.
    const insertPatch = toSignalInsertPatch(
      { ...payload, signal_scope: requestedScope },
      normalizedSessionUser.id,
      {
        eventId,
        companyId,
        ownerUserId: normalizedSessionUser.id
      }
    );

    const supabase = createAdminClient();
    const { data, error } = (await (supabase as any)
      .from("signals" as never)
      .insert(insertPatch as never)
      .select(SIGNAL_SELECT_COLUMNS)
      .single()) as {
      data: Parameters<typeof mapSignalRow>[0] | null;
      error: { message: string; code?: string } | null;
    };

    if (error || !data) {
      return NextResponse.json(
        { error: `${error?.message ?? "Failed to create Campaign Agent"} (${error?.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ signal: mapSignalRow(data) }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
