import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { canMutateExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import { getMicrosoft365Capabilities } from "@/lib/integrations/microsoft/scopes";
import { getValidMicrosoftAccessTokenForUser } from "@/lib/integrations/microsoft/token-manager";
import {
  createMicrosoftCalendarEvent,
  deleteMicrosoftCalendarEvent,
  queryMicrosoftSchedule,
  updateMicrosoftCalendarEvent,
  type MicrosoftCalendarFailure,
  type MicrosoftScheduleItem
} from "@/lib/integrations/microsoft/calendar-client";
import {
  isIanaTimeZone,
  normalizeBusyWindows,
  suggestAvailableMeetingTimesWithDiagnostics,
  zonedLocalToIso
} from "@/lib/integrations/google/calendar-core";
import {
  isCalendarOperationKey,
  validateCalendarMeetingInput
} from "@/lib/integrations/calendar/core";
import type { NormalizedMeeting } from "@/lib/integrations/calendar/types";

type ServiceInput = {
  userId: string;
  companyId: string;
  role: string;
  isBearer: boolean;
  leadId: string;
};

type MicrosoftActivityRow = {
  id: string;
  company_id: string;
  event_id: string | null;
  lead_id: string;
  connection_id: string | null;
  acting_user_id: string | null;
  attendee_email: string;
  idempotency_key: string;
  provider_event_id: string | null;
  join_url: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: "pending" | "scheduled" | "cancelled" | "unknown";
  last_operation: "create" | "update" | "cancel";
  last_operation_status: "pending" | "succeeded" | "failed" | "unknown";
  last_operation_key: string;
  safe_error_category: string | null;
  created_at: string;
  updated_at: string;
};

const ACTIVITY_COLUMNS = [
  "id",
  "company_id",
  "event_id",
  "lead_id",
  "connection_id",
  "acting_user_id",
  "attendee_email",
  "idempotency_key",
  "provider_event_id",
  "join_url",
  "starts_at",
  "ends_at",
  "timezone",
  "status",
  "last_operation",
  "last_operation_status",
  "last_operation_key",
  "safe_error_category",
  "created_at",
  "updated_at"
].join(", ");

export function toNormalizedMicrosoftMeeting(row: MicrosoftActivityRow): NormalizedMeeting {
  return {
    activityId: row.id,
    provider: "microsoft_365",
    eventId: row.provider_event_id ?? "",
    joinUrl: row.join_url,
    start: row.starts_at,
    end: row.ends_at,
    timezone: row.timezone,
    attendeeEmail: row.attendee_email
  };
}

async function loadContext(input: ServiceInput) {
  const supabase = createAdminClient();
  const [{ data: lead, error: leadError }, { data: connection, error: connectionError }] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id, company_id, event_id, email, full_name")
        .eq("id", input.leadId)
        .eq("company_id", input.companyId)
        .maybeSingle(),
      supabase
        .from("microsoft_365_connections")
        .select("id, status, granted_scopes, microsoft_email")
        .eq("user_id", input.userId)
        .eq("company_id", input.companyId)
        .maybeSingle()
    ]);
  if (leadError || !lead) return { ok: false as const, outcome: "lead_not_found" as const };
  if (
    !(await canMutateExhibitorLeadsInContext({
      userId: input.userId,
      companyId: input.companyId,
      role: input.role,
      isBearer: input.isBearer,
      leadEventId: lead.event_id,
      denyExhibitorViewer: true
    }))
  ) {
    return { ok: false as const, outcome: "unauthorized" as const };
  }
  const attendeeEmail = String(lead.email ?? "").trim().toLowerCase();
  if (!attendeeEmail) return { ok: false as const, outcome: "missing_email" as const };
  if (connectionError || !connection) {
    return { ok: false as const, outcome: "missing_connection" as const };
  }
  if (connection.status !== "connected") {
    return { ok: false as const, outcome: "reconnect_required" as const };
  }
  if (!getMicrosoft365Capabilities(connection.granted_scopes ?? []).calendarReadWrite) {
    return { ok: false as const, outcome: "permission_required" as const };
  }
  return {
    ok: true as const,
    lead,
    connection,
    attendeeEmail,
    scheduleEmail: String(connection.microsoft_email ?? "").trim().toLowerCase()
  };
}

function tokenFailure(token: Awaited<ReturnType<typeof getValidMicrosoftAccessTokenForUser>>) {
  if (token.ok) throw new Error("Expected a failed token result.");
  return {
    ok: false as const,
    outcome:
      token.reason === "missing_connection"
        ? "missing_connection" as const
        : token.reason === "reconnect_required"
          ? "reconnect_required" as const
          : "failed" as const,
    errorCategory:
      token.reason === "missing_connection" || token.reason === "reconnect_required"
        ? token.reason
        : "provider_unavailable" as const
  };
}

async function withMicrosoftTokenRetry<T extends { ok: true }>(
  input: ServiceInput,
  operation: (accessToken: string) => Promise<T | MicrosoftCalendarFailure>
): Promise<T | MicrosoftCalendarFailure | ReturnType<typeof tokenFailure>> {
  const firstToken = await getValidMicrosoftAccessTokenForUser({
    userId: input.userId,
    companyId: input.companyId
  });
  if (!firstToken.ok) return tokenFailure(firstToken);
  const first = await operation(firstToken.accessToken);
  if (first.ok || first.status !== 401) return first;

  // A definitive 401 cannot represent an accepted Graph mutation. Refresh and
  // retry this same provider once; never switch providers.
  const refreshed = await getValidMicrosoftAccessTokenForUser({
    userId: input.userId,
    companyId: input.companyId,
    forceRefresh: true
  });
  if (!refreshed.ok) return tokenFailure(refreshed);
  const retry = await operation(refreshed.accessToken);
  return !retry.ok && retry.status === 401
    ? {
        ok: false as const,
        outcome: "failed" as const,
        category: "provider_unauthorized" as const,
        status: 401
      }
    : retry;
}

function graphDateTimeToIso(
  value: MicrosoftScheduleItem["start"],
  fallbackTimeZone: string
) {
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(value.dateTime)) {
    const parsed = Date.parse(value.dateTime);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  const timeZone = isIanaTimeZone(value.timeZone) ? value.timeZone : fallbackTimeZone;
  return zonedLocalToIso(value.dateTime.slice(0, 16), timeZone);
}

export function normalizeMicrosoftCalendarFailure(
  result: MicrosoftCalendarFailure | ReturnType<typeof tokenFailure>
) {
  if ("errorCategory" in result) return result;
  if (result.category === "provider_unauthorized") {
    return {
      ok: false as const,
      outcome: "reconnect_required" as const,
      errorCategory: "reconnect_required" as const
    };
  }
  if (result.category === "permission_required") {
    return {
      ok: false as const,
      outcome: "permission_required" as const,
      errorCategory: "permission_required" as const
    };
  }
  return {
    ok: false as const,
    outcome: result.outcome,
    errorCategory: result.category,
    ...(result.retryAfterSeconds == null
      ? {}
      : { retryAfterSeconds: result.retryAfterSeconds })
  };
}

function persistedFailureCategory(result: MicrosoftCalendarFailure | ReturnType<typeof tokenFailure>) {
  if ("errorCategory" in result) {
    return result.outcome === "reconnect_required" || result.outcome === "missing_connection"
      ? "reconnect_required"
      : result.errorCategory;
  }
  return result.category === "provider_unauthorized"
    ? "reconnect_required"
    : result.category;
}

export async function getMicrosoftAvailability(input: ServiceInput & {
  windowStartLocal: string;
  windowEndLocal: string;
  timezone: string;
  durationMinutes: number;
}) {
  const context = await loadContext(input);
  if (!context.ok) return context;
  const timeMin = zonedLocalToIso(input.windowStartLocal, input.timezone);
  const timeMax = zonedLocalToIso(input.windowEndLocal, input.timezone);
  const durationMinutes = Math.trunc(input.durationMinutes);
  if (
    !timeMin ||
    !timeMax ||
    Date.parse(timeMax) <= Date.parse(timeMin) ||
    Date.parse(timeMax) - Date.parse(timeMin) > 14 * 86_400_000 ||
    durationMinutes < 15 ||
    durationMinutes > 240
  ) {
    return { ok: false as const, outcome: "invalid_input" as const };
  }
  const result = await withMicrosoftTokenRetry(input, (accessToken) =>
    queryMicrosoftSchedule({
      accessToken,
      scheduleEmail: context.scheduleEmail,
      timeMin,
      timeMax,
      timeZone: input.timezone
    })
  );
  if (!result.ok) return normalizeMicrosoftCalendarFailure(result);
  const rawBusy = result.scheduleItems.flatMap((item) => {
    if (item.status.toLowerCase() === "free") return [];
    const start = graphDateTimeToIso(item.start, input.timezone);
    const end = graphDateTimeToIso(item.end, input.timezone);
    return start && end ? [{ start, end }] : [];
  });
  const busy = normalizeBusyWindows(rawBusy, timeMin, timeMax);
  const generated = suggestAvailableMeetingTimesWithDiagnostics({
    rangeStart: timeMin,
    rangeEnd: timeMax,
    durationMinutes,
    busy
  });
  return {
    ok: true as const,
    timezone: input.timezone,
    range: { start: timeMin, end: timeMax },
    suggestions: generated.suggestions
  };
}

export async function createMicrosoftMeeting(input: ServiceInput & {
  idempotencyKey: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  title: string;
  includeTeams: boolean;
}) {
  const meeting = validateCalendarMeetingInput(input);
  if (!meeting || !isCalendarOperationKey(input.idempotencyKey)) {
    return { ok: false as const, outcome: "invalid_input" as const };
  }
  const context = await loadContext(input);
  if (!context.ok) return context;
  const supabase = createAdminClient() as any;
  const { data, error } = await supabase
    .from("microsoft_calendar_meeting_activities")
    .insert({
      company_id: input.companyId,
      event_id: context.lead.event_id,
      lead_id: context.lead.id,
      connection_id: context.connection.id,
      acting_user_id: input.userId,
      attendee_email: context.attendeeEmail,
      idempotency_key: input.idempotencyKey,
      provider_event_id: null,
      join_url: null,
      starts_at: meeting.startsAt,
      ends_at: meeting.endsAt,
      timezone: meeting.timezone,
      status: "pending",
      last_operation: "create",
      last_operation_status: "pending",
      last_operation_key: input.idempotencyKey
    })
    .select(ACTIVITY_COLUMNS)
    .maybeSingle();
  if (error && error.code !== "23505") {
    throw new Error("Unable to reserve the Microsoft meeting.");
  }
  if (!data) {
    const { data: existing } = await supabase
      .from("microsoft_calendar_meeting_activities")
      .select(ACTIVITY_COLUMNS)
      .eq("idempotency_key", input.idempotencyKey)
      .eq("company_id", input.companyId)
      .eq("lead_id", input.leadId)
      .eq("acting_user_id", input.userId)
      .maybeSingle();
    if (!existing) throw new Error("Unable to resolve the duplicate Microsoft meeting.");
    return existing.status === "scheduled"
      ? {
          ok: true as const,
          outcome: "duplicate" as const,
          meeting: toNormalizedMicrosoftMeeting(existing as MicrosoftActivityRow)
        }
      : { ok: false as const, outcome: "unknown" as const };
  }

  const provider = await withMicrosoftTokenRetry(input, (accessToken) =>
    createMicrosoftCalendarEvent({
      accessToken,
      attendeeEmail: context.attendeeEmail,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      timeZone: meeting.timezone,
      title: meeting.title,
      description: "Scheduled from SignalThread Lead Retrieval.",
      includeTeams: input.includeTeams
    })
  );
  if (!provider.ok) {
    const category = persistedFailureCategory(provider);
    await supabase
      .from("microsoft_calendar_meeting_activities")
      .update({
        status: provider.outcome === "unknown" ? "unknown" : "pending",
        last_operation_status: provider.outcome,
        safe_error_category: category
      })
      .eq("id", data.id);
    return normalizeMicrosoftCalendarFailure(provider);
  }
  const { data: saved, error: saveError } = await supabase
    .from("microsoft_calendar_meeting_activities")
    .update({
      provider_event_id: provider.eventId,
      join_url: provider.joinUrl,
      status: "scheduled",
      last_operation_status: "succeeded",
      safe_error_category: null
    })
    .eq("id", data.id)
    .select(ACTIVITY_COLUMNS)
    .maybeSingle();
  if (saveError || !saved) {
    await supabase
      .from("microsoft_calendar_meeting_activities")
      .update({
        status: "unknown",
        last_operation_status: "unknown",
        safe_error_category: "persistence_failure"
      })
      .eq("id", data.id);
    return { ok: false as const, outcome: "unknown" as const };
  }
  return {
    ok: true as const,
    outcome: "scheduled" as const,
    meeting: toNormalizedMicrosoftMeeting(saved as MicrosoftActivityRow)
  };
}

async function loadActivityForMutation(input: ServiceInput & { activityId: string }) {
  const context = await loadContext(input);
  if (!context.ok) return context;
  const supabase = createAdminClient() as any;
  const { data } = await supabase
    .from("microsoft_calendar_meeting_activities")
    .select(ACTIVITY_COLUMNS)
    .eq("id", input.activityId)
    .eq("company_id", input.companyId)
    .eq("lead_id", input.leadId)
    .eq("acting_user_id", input.userId)
    .maybeSingle();
  if (!data) return { ok: false as const, outcome: "meeting_not_found" as const };
  return { ok: true as const, context, row: data as MicrosoftActivityRow };
}

export async function updateMicrosoftMeeting(input: ServiceInput & {
  activityId: string;
  operationKey: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  title: string;
}) {
  const meeting = validateCalendarMeetingInput(input);
  if (!meeting || !isCalendarOperationKey(input.operationKey)) {
    return { ok: false as const, outcome: "invalid_input" as const };
  }
  const loaded = await loadActivityForMutation(input);
  if (!loaded.ok) return loaded;
  if (loaded.row.status === "cancelled" || !loaded.row.provider_event_id) {
    return { ok: false as const, outcome: "meeting_not_found" as const };
  }
  if (loaded.row.last_operation_key === input.operationKey) {
    return {
      ok: true as const,
      outcome: "duplicate" as const,
      meeting: toNormalizedMicrosoftMeeting(loaded.row)
    };
  }
  const supabase = createAdminClient() as any;
  const { data: claimed } = await supabase
    .from("microsoft_calendar_meeting_activities")
    .update({
      last_operation: "update",
      last_operation_status: "pending",
      last_operation_key: input.operationKey,
      safe_error_category: null
    })
    .eq("id", loaded.row.id)
    .eq("updated_at", loaded.row.updated_at)
    .select(ACTIVITY_COLUMNS)
    .maybeSingle();
  if (!claimed) return { ok: false as const, outcome: "conflict" as const };
  const provider = await withMicrosoftTokenRetry(input, (accessToken) =>
    updateMicrosoftCalendarEvent({
      accessToken,
      eventId: loaded.row.provider_event_id!,
      attendeeEmail: loaded.context.attendeeEmail,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      timeZone: meeting.timezone,
      title: meeting.title
    })
  );
  if (!provider.ok) {
    await supabase
      .from("microsoft_calendar_meeting_activities")
      .update({
        last_operation_status: provider.outcome,
        safe_error_category: persistedFailureCategory(provider)
      })
      .eq("id", loaded.row.id)
      .eq("last_operation_key", input.operationKey);
    return normalizeMicrosoftCalendarFailure(provider);
  }
  const { data: saved } = await supabase
    .from("microsoft_calendar_meeting_activities")
    .update({
      starts_at: meeting.startsAt,
      ends_at: meeting.endsAt,
      timezone: meeting.timezone,
      status: "scheduled",
      last_operation_status: "succeeded",
      safe_error_category: null
    })
    .eq("id", loaded.row.id)
    .eq("last_operation_key", input.operationKey)
    .select(ACTIVITY_COLUMNS)
    .maybeSingle();
  return saved
    ? {
        ok: true as const,
        outcome: "updated" as const,
        meeting: toNormalizedMicrosoftMeeting(saved as MicrosoftActivityRow)
      }
    : { ok: false as const, outcome: "unknown" as const };
}

export async function cancelMicrosoftMeeting(input: ServiceInput & {
  activityId: string;
  operationKey: string;
}) {
  if (!isCalendarOperationKey(input.operationKey)) {
    return { ok: false as const, outcome: "invalid_input" as const };
  }
  const loaded = await loadActivityForMutation(input);
  if (!loaded.ok) return loaded;
  if (loaded.row.status === "cancelled" || loaded.row.last_operation_key === input.operationKey) {
    return {
      ok: true as const,
      outcome: "duplicate" as const,
      meeting: toNormalizedMicrosoftMeeting(loaded.row)
    };
  }
  if (!loaded.row.provider_event_id) {
    return { ok: false as const, outcome: "meeting_not_found" as const };
  }
  const supabase = createAdminClient() as any;
  const { data: claimed } = await supabase
    .from("microsoft_calendar_meeting_activities")
    .update({
      last_operation: "cancel",
      last_operation_status: "pending",
      last_operation_key: input.operationKey,
      safe_error_category: null
    })
    .eq("id", loaded.row.id)
    .eq("updated_at", loaded.row.updated_at)
    .select("id")
    .maybeSingle();
  if (!claimed) return { ok: false as const, outcome: "conflict" as const };
  const provider = await withMicrosoftTokenRetry(input, (accessToken) =>
    deleteMicrosoftCalendarEvent({
      accessToken,
      eventId: loaded.row.provider_event_id!
    })
  );
  if (!provider.ok) {
    await supabase
      .from("microsoft_calendar_meeting_activities")
      .update({
        last_operation_status: provider.outcome,
        safe_error_category: persistedFailureCategory(provider)
      })
      .eq("id", loaded.row.id)
      .eq("last_operation_key", input.operationKey);
    return normalizeMicrosoftCalendarFailure(provider);
  }
  const { data: saved } = await supabase
    .from("microsoft_calendar_meeting_activities")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      last_operation_status: "succeeded",
      safe_error_category: null
    })
    .eq("id", loaded.row.id)
    .eq("last_operation_key", input.operationKey)
    .select(ACTIVITY_COLUMNS)
    .maybeSingle();
  return saved
    ? {
        ok: true as const,
        outcome: "cancelled" as const,
        meeting: toNormalizedMicrosoftMeeting(saved as MicrosoftActivityRow)
      }
    : { ok: false as const, outcome: "unknown" as const };
}
