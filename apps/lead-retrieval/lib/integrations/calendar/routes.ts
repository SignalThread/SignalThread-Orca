import "server-only";

import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import {
  cancelCalendarMeeting,
  createCalendarMeeting,
  getCalendarAvailability,
  updateCalendarMeeting
} from "@/lib/integrations/calendar/service";
import { parseCalendarProviderOverride } from "@/lib/integrations/calendar/types";

function responseForCalendarResult(result: { ok: boolean; outcome?: string }) {
  const status = result.ok
    ? 200
    : result.outcome === "invalid_input" || result.outcome === "missing_email"
      ? 400
      : result.outcome === "unauthorized"
        ? 403
        : result.outcome === "lead_not_found" || result.outcome === "meeting_not_found"
          ? 404
          : result.outcome === "missing_connection" ||
              result.outcome === "reconnect_required" ||
              result.outcome === "permission_required" ||
              result.outcome === "provider_selection_required" ||
              result.outcome === "conflict"
            ? 409
            : result.outcome === "unknown"
              ? 202
              : 502;
  return NextResponse.json(result, { status });
}

async function routeContext(request: Request, leadId: string) {
  const session = await resolveApiSession(request);
  return {
    userId: String(session.userId ?? ""),
    companyId: String(session.companyId ?? ""),
    role: String(session.role ?? ""),
    isBearer: /^Bearer\s/i.test(request.headers.get("authorization") ?? ""),
    leadId
  };
}

function providerOverride(payload: Record<string, unknown>) {
  return parseCalendarProviderOverride(payload.providerOverride);
}

export async function handleCalendarAvailability(
  request: Request,
  params: Promise<{ leadId: string }>
) {
  const [resolved, payload] = await Promise.all([
    params,
    request.json().catch(() => null) as Promise<Record<string, unknown> | null>
  ]);
  if (!payload) return responseForCalendarResult({ ok: false, outcome: "invalid_input" });
  const parsedProvider = providerOverride(payload);
  if (!parsedProvider.valid) {
    return responseForCalendarResult({ ok: false, outcome: "invalid_input" });
  }
  const context = await routeContext(request, resolved.leadId);
  return responseForCalendarResult(
    await getCalendarAvailability({
      ...context,
      providerOverride: parsedProvider.provider,
      windowStartLocal: String(payload.windowStartLocal ?? ""),
      windowEndLocal: String(payload.windowEndLocal ?? ""),
      timezone: String(payload.timezone ?? ""),
      durationMinutes: Number(payload.durationMinutes)
    })
  );
}

export async function handleCalendarMeetingCreate(
  request: Request,
  params: Promise<{ leadId: string }>
) {
  const [resolved, payload] = await Promise.all([
    params,
    request.json().catch(() => null) as Promise<Record<string, unknown> | null>
  ]);
  if (!payload) return responseForCalendarResult({ ok: false, outcome: "invalid_input" });
  const parsedProvider = providerOverride(payload);
  if (!parsedProvider.valid) {
    return responseForCalendarResult({ ok: false, outcome: "invalid_input" });
  }
  const context = await routeContext(request, resolved.leadId);
  return responseForCalendarResult(
    await createCalendarMeeting({
      ...context,
      providerOverride: parsedProvider.provider,
      idempotencyKey: String(payload.idempotencyKey ?? ""),
      startsAt: String(payload.startsAt ?? ""),
      endsAt: String(payload.endsAt ?? ""),
      timezone: String(payload.timezone ?? ""),
      title: String(payload.title ?? ""),
      includeConferencing:
        payload.includeConferencing === true || payload.includeMeet === true
    })
  );
}

export async function handleCalendarMeetingUpdate(
  request: Request,
  params: Promise<{ leadId: string; activityId: string }>
) {
  const [resolved, payload] = await Promise.all([
    params,
    request.json().catch(() => null) as Promise<Record<string, unknown> | null>
  ]);
  if (!payload) return responseForCalendarResult({ ok: false, outcome: "invalid_input" });
  const parsedProvider = providerOverride(payload);
  if (!parsedProvider.valid) {
    return responseForCalendarResult({ ok: false, outcome: "invalid_input" });
  }
  const context = await routeContext(request, resolved.leadId);
  return responseForCalendarResult(
    await updateCalendarMeeting({
      ...context,
      activityId: resolved.activityId,
      providerOverride: parsedProvider.provider,
      operationKey: String(payload.operationKey ?? ""),
      startsAt: String(payload.startsAt ?? ""),
      endsAt: String(payload.endsAt ?? ""),
      timezone: String(payload.timezone ?? ""),
      title: String(payload.title ?? "")
    })
  );
}

export async function handleCalendarMeetingCancel(
  request: Request,
  params: Promise<{ leadId: string; activityId: string }>
) {
  const [resolved, payload] = await Promise.all([
    params,
    request.json().catch(() => null) as Promise<Record<string, unknown> | null>
  ]);
  if (!payload) return responseForCalendarResult({ ok: false, outcome: "invalid_input" });
  const parsedProvider = providerOverride(payload);
  if (!parsedProvider.valid) {
    return responseForCalendarResult({ ok: false, outcome: "invalid_input" });
  }
  const context = await routeContext(request, resolved.leadId);
  return responseForCalendarResult(
    await cancelCalendarMeeting({
      ...context,
      activityId: resolved.activityId,
      providerOverride: parsedProvider.provider,
      operationKey: String(payload.operationKey ?? "")
    })
  );
}
