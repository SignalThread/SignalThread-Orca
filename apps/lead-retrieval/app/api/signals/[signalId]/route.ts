import { NextResponse } from "next/server";
import { getCurrentSessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapSignalRow,
  sanitizeSignalMutationPayload,
  toSignalUpdatePatch
} from "@/lib/data/signals";
import { assertEventIdAccessibleForUser } from "@/lib/server/company-event-access";
import {
  ensureEventScopedStarterSignals,
  loadSignalEventContext,
  loadEventSignalCopyForSource
} from "@/lib/server/signals/event-scoped-signal-copies";
import {
  SIGNAL_SELECT_COLUMNS,
  isApprovedEventStarterSignalName
} from "@/lib/signals/event-scoped-signal-copies";
import { SignalMutationPayload } from "@/components/signals/signal-types";
import { canMutateSignalInContext, normalizeSignalScope, signalScopeRequiresEvent } from "@/lib/signals/signal-scope";
import { authorizeSignalDelete } from "@/lib/signals/signal-delete-authorization";

async function getSignal(signalId: string) {
  const supabase = createAdminClient();
  const { data, error } = (await supabase
    .from("signals")
    .select(SIGNAL_SELECT_COLUMNS)
    .eq("id", signalId)
    .maybeSingle()) as {
    data: Parameters<typeof mapSignalRow>[0] | null;
    error: { message: string; code?: string } | null;
  };

  if (error) {
    throw new Error(`${error.message} (${error.code ?? "no_code"})`);
  }

  return data;
}

async function getSignalForEvent(input: {
  signalId: string;
  eventId: string | null;
  userId: string;
}) {
  const signal = await getSignal(input.signalId);
  const eventId = input.eventId?.trim();
  if (!signal || !eventId) {
    return signal;
  }

  await assertEventIdAccessibleForUser(input.userId, eventId);
  const eventContext = await loadSignalEventContext(eventId);
  const scope = normalizeSignalScope(signal.signal_scope, signal.event_id ? "event" : "default");

  if (
    scope === "company" &&
    signal.company_id === eventContext.companyId &&
    !signal.event_id
  ) {
    return signal;
  }

  if (
    scope === "event" &&
    signal.event_id === eventId &&
    signal.company_id === eventContext.companyId
  ) {
    return signal;
  }

  if (
    scope === "private" &&
    signal.event_id === eventId &&
    signal.company_id === eventContext.companyId &&
    signal.owner_user_id === input.userId
  ) {
    return signal;
  }

  if (scope !== "default" || !isApprovedEventStarterSignalName(signal.name)) {
    return null;
  }

  await ensureEventScopedStarterSignals({
    eventId,
    createdBy: input.userId
  });

  return (await loadEventSignalCopyForSource({
    eventId,
    sourceSignalId: signal.id
  })) ?? signal;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ signalId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const canReadSignals = sessionUser.role === "platform_admin" || sessionUser.role === "exhibitor_admin";
    if (!canReadSignals) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { signalId: rawSignalId } = await params;
    const signalId = rawSignalId.trim();
    if (!signalId) {
      return NextResponse.json({ error: "Missing Campaign Agent id in route" }, { status: 400 });
    }

    const eventId = new URL(request.url).searchParams.get("eventId");
    const signal = await getSignalForEvent({
      signalId,
      eventId,
      userId: sessionUser.id
    });
    if (!signal) {
      return NextResponse.json({ error: "Campaign Agent not found" }, { status: 404 });
    }

    const eventContext = eventId?.trim() ? await loadSignalEventContext(eventId.trim()) : null;
    return NextResponse.json({ signal: mapSignalRow(signal, { eventArchived: eventContext?.archived }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ signalId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const canMutateSignals =
      sessionUser.role === "platform_admin" || sessionUser.role === "exhibitor_admin";
    if (!canMutateSignals) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { signalId: rawSignalId } = await params;
    const signalId = rawSignalId.trim();
    if (!signalId) {
      return NextResponse.json({ error: "Missing Campaign Agent id in route" }, { status: 400 });
    }

    const eventId = new URL(request.url).searchParams.get("eventId");
    if (sessionUser.role === "exhibitor_admin" && !eventId?.trim()) {
      return NextResponse.json(
        { error: "Event id is required for exhibitor Campaign Agent updates." },
        { status: 400 }
      );
    }

    const existing = await getSignalForEvent({
      signalId,
      eventId,
      userId: sessionUser.id
    });
    if (!existing) {
      return NextResponse.json({ error: "Campaign Agent not found" }, { status: 404 });
    }
    const scopedEventId = eventId?.trim() || null;
    const eventContext = scopedEventId ? await loadSignalEventContext(scopedEventId) : null;
    const existingScope = normalizeSignalScope(existing.signal_scope, existing.event_id ? "event" : "default");

    let payload = {} as Partial<SignalMutationPayload>;
    try {
      payload = (await request.json()) as Partial<SignalMutationPayload>;
    } catch {
      payload = {};
    }

    const sanitizedPayload = sanitizeSignalMutationPayload(payload, sessionUser.role);
    const requestedScope = normalizeSignalScope(sanitizedPayload.signal_scope, existingScope);
    if (requestedScope === "default" || existingScope === "default") {
      return NextResponse.json(
        { error: "Default Campaign Agents are starter templates and cannot be edited directly." },
        { status: 403 }
      );
    }
    if (
      eventContext &&
      !canMutateSignalInContext(existing, {
        userId: sessionUser.id,
        companyId: eventContext.companyId,
        eventId: eventContext.eventId,
        eventArchived: eventContext.archived
      })
    ) {
      return NextResponse.json({ error: "Campaign Agent is not editable in this event scope." }, { status: 403 });
    }
    if (eventContext?.archived && signalScopeRequiresEvent(requestedScope)) {
      return NextResponse.json(
        { error: "Event-scoped and private Campaign Agents are read-only after an event ends." },
        { status: 409 }
      );
    }
    // TODO: reintroduce RBAC checks for signal update once permissions are finalized.
    const updatePatch = toSignalUpdatePatch(sanitizedPayload);
    if (eventContext) {
      updatePatch.signal_scope = requestedScope;
      updatePatch.company_id = eventContext.companyId;
      updatePatch.event_id = signalScopeRequiresEvent(requestedScope) ? eventContext.eventId : null;
      updatePatch.owner_user_id =
        requestedScope === "private"
          ? existing.owner_user_id ?? sessionUser.id
          : existing.owner_user_id ?? null;
      updatePatch.visibility = "role";
      updatePatch.role_scope = sanitizedPayload.role_scope ?? existing.role_scope ?? "exhibitor_admin";
      updatePatch.template_scope = null;
    }

    if (Object.keys(updatePatch).length === 0) {
      return NextResponse.json({ error: "No fields supplied for update" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = (await (supabase as any)
      .from("signals" as never)
      .update(updatePatch as never)
      .eq("id", existing.id)
      .select(SIGNAL_SELECT_COLUMNS)
      .single()) as {
      data: Parameters<typeof mapSignalRow>[0] | null;
      error: { message: string; code?: string } | null;
    };

    if (error || !data) {
      return NextResponse.json(
        { error: `${error?.message ?? "Failed to update Campaign Agent"} (${error?.code ?? "no_code"})` },
        { status: 500 }
      );
    }

    return NextResponse.json({ signal: mapSignalRow(data, { eventArchived: eventContext?.archived }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ signalId: string }> }
) {
  try {
    const sessionUser = await getCurrentSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const canMutateSignals =
      sessionUser.role === "platform_admin" || sessionUser.role === "exhibitor_admin";
    if (!canMutateSignals) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { signalId: rawSignalId } = await params;
    const signalId = rawSignalId.trim();
    if (!signalId) {
      return NextResponse.json({ error: "Missing Campaign Agent id in route" }, { status: 400 });
    }

    const eventId = new URL(request.url).searchParams.get("eventId");
    const existing = await getSignal(signalId);
    if (!existing) {
      return NextResponse.json({ error: "Campaign Agent not found" }, { status: 404 });
    }
    const scopedEventId = eventId?.trim() || null;
    const eventContextId = scopedEventId || existing.event_id || null;
    const eventContext = eventContextId ? await loadSignalEventContext(eventContextId) : null;

    if (eventContextId) {
      await assertEventIdAccessibleForUser(sessionUser.id, eventContextId);
    }

    const authorization = authorizeSignalDelete({
      sessionUser,
      signal: existing,
      eventContext: eventContext
        ? {
            companyId: eventContext.companyId,
            eventId: eventContext.eventId,
            eventArchived: eventContext.archived
          }
        : null
    });
    if (!authorization.ok) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }

    // TODO: reintroduce RBAC checks for signal delete once permissions are finalized.

    const supabase = createAdminClient();
    const { error } = await (supabase as any).from("signals" as never).delete().eq("id", existing.id);

    if (error) {
      return NextResponse.json({ error: `${error.message} (${error.code ?? "no_code"})` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
