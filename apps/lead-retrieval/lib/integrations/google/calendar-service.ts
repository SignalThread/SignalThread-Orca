import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { canMutateExhibitorLeadsInContext } from "@/lib/server/exhibitor-permission-aggregates";
import { getGoogleWorkspaceCapabilities } from "@/lib/integrations/google/scopes";
import { getValidGoogleAccessTokenForUser } from "@/lib/integrations/google/token-manager";
import {
  deterministicGoogleEventId,
  isIanaTimeZone,
  normalizeBusyWindows,
  suggestAvailableMeetingTimesWithDiagnostics,
  zonedLocalToIso
} from "@/lib/integrations/google/calendar-core";
import { emitGoogleCalendarDiagnostic } from "@/lib/integrations/google/calendar-diagnostics";
import {
  cancelGoogleCalendarEvent,
  createGoogleCalendarEvent,
  queryGoogleFreeBusy,
  GOOGLE_FREEBUSY_CALENDAR_ID,
  updateGoogleCalendarEvent,
  type GoogleCalendarFailure
} from "@/lib/integrations/google/calendar-client";
import { claimCalendarMeetingProvider } from "@/lib/integrations/calendar/provider-claim";

export type GoogleMeetingActivity = {
  id: string;
  leadId: string;
  attendeeEmail: string;
  googleEventId: string;
  googleMeetUri: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: "pending" | "scheduled" | "cancelled" | "unknown";
  lastOperation: "create" | "update" | "cancel";
  lastOperationStatus: "pending" | "succeeded" | "failed" | "unknown";
  safeErrorCategory: string | null;
  createdAt: string;
  calendarOwnerName: string | null;
  calendarOwnerEmail: string | null;
  actingUserName: string | null;
  actingUserEmail: string | null;
};

type ServiceInput = { userId: string; companyId: string; role: string; isBearer: boolean; leadId: string };
type ActivityRow = {
  id: string; lead_id: string; connection_id: string | null; acting_user_id: string | null; attendee_email: string; google_event_id: string; google_meet_uri: string | null;
  starts_at: string; ends_at: string; timezone: string; status: GoogleMeetingActivity["status"];
  last_operation: GoogleMeetingActivity["lastOperation"]; last_operation_status: GoogleMeetingActivity["lastOperationStatus"];
  safe_error_category: string | null; created_at: string; updated_at: string; last_operation_key: string;
};

const ACTIVITY_COLUMNS = "id, lead_id, connection_id, acting_user_id, attendee_email, google_event_id, google_meet_uri, starts_at, ends_at, timezone, status, last_operation, last_operation_status, safe_error_category, created_at, updated_at, last_operation_key";

function toActivity(
  row: ActivityRow,
  attribution: {
    calendarOwners?: Map<string, { name: string | null; email: string | null }>;
    actingUsers?: Map<string, { name: string | null; email: string | null }>;
  } = {}
): GoogleMeetingActivity {
  const calendarOwner = row.connection_id ? attribution.calendarOwners?.get(row.connection_id) : null;
  const actingUser = row.acting_user_id ? attribution.actingUsers?.get(row.acting_user_id) : null;
  return {
    id: row.id,
    leadId: row.lead_id,
    attendeeEmail: row.attendee_email,
    googleEventId: row.google_event_id,
    googleMeetUri: row.google_meet_uri,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    status: row.status,
    lastOperation: row.last_operation,
    lastOperationStatus: row.last_operation_status,
    safeErrorCategory: row.safe_error_category,
    createdAt: row.created_at,
    calendarOwnerName: calendarOwner?.name ?? null,
    calendarOwnerEmail: calendarOwner?.email ?? null,
    actingUserName: actingUser?.name ?? null,
    actingUserEmail: actingUser?.email ?? null
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateMeetingInput(input: { startsAt: string; endsAt: string; timezone: string; title: string }) {
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const title = String(input.title ?? "").trim();
  if (!isIanaTimeZone(input.timezone) || !title || title.length > 200 || /[\r\n]/.test(title)) return null;
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) return null;
  if (endsAt.getTime() - startsAt.getTime() > 8 * 60 * 60_000) return null;
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), timezone: input.timezone, title };
}

async function loadContext(input: ServiceInput, capability: "calendarFreeBusy" | "calendarEventsOwned") {
  const supabase = createAdminClient();
  const [{ data: lead, error: leadError }, { data: connection, error: connectionError }] = await Promise.all([
    supabase.from("leads").select("id, company_id, event_id, email, full_name").eq("id", input.leadId).eq("company_id", input.companyId).maybeSingle(),
    supabase.from("google_workspace_connections").select("id, status, granted_scopes").eq("user_id", input.userId).eq("company_id", input.companyId).maybeSingle()
  ]);
  if (leadError || !lead) return { ok: false as const, outcome: "lead_not_found" as const };
  if (!(await canMutateExhibitorLeadsInContext({ userId: input.userId, companyId: input.companyId, role: input.role, isBearer: input.isBearer, leadEventId: lead.event_id, denyExhibitorViewer: true }))) {
    return { ok: false as const, outcome: "unauthorized" as const };
  }
  const attendeeEmail = String(lead.email ?? "").trim().toLowerCase();
  if (!attendeeEmail) return { ok: false as const, outcome: "missing_email" as const };
  if (connectionError || !connection) return { ok: false as const, outcome: "missing_connection" as const };
  if (connection.status === "reconnect_required" || connection.status === "revocation_pending") {
    return { ok: false as const, outcome: "reconnect_required" as const };
  }
  if (!getGoogleWorkspaceCapabilities(connection.granted_scopes ?? [])[capability]) {
    return { ok: false as const, outcome: "missing_capability" as const };
  }
  return { ok: true as const, lead, attendeeEmail, connection };
}

type AvailabilityErrorCategory = "invalid_input" | "missing_connection" | "reconnect_required" | "missing_capability" | "provider_rejected" | "provider_unavailable" | "unknown_outcome" | "configuration_error" | "credential_storage_error" | "credential_decryption_error" | "invalid_expiration" | "refresh_lease_error" | "refresh_busy" | "provider_refresh_error" | "refresh_persistence_error" | "internal_error";

function availabilityDiagnostic(input: {
  stage: "context" | "input_validation" | "token_manager" | "freebusy_request" | "freebusy_retry";
  googleHttpStatus: number | null;
  category: AvailabilityErrorCategory;
  googleReason: string | null;
  tokenRefreshAttempted: boolean;
  validCalendarId: boolean | null;
  validRfc3339Range: boolean | null;
  validIanaTimezone: boolean;
  rangeStart?: string | null;
  rangeEnd?: string | null;
  timezone?: string | null;
  calendarCapability?: boolean | null;
}) {
  emitGoogleCalendarDiagnostic({
    level: input.category === "invalid_input" ? "warn" : "error",
    diagnostic: {
      stage: input.stage === "context" ? "request_context" : input.stage,
      safe_error_category: input.category,
      authenticated_user: true,
      calendar_capability: input.calendarCapability ?? null,
      calendar_id: input.validCalendarId === true ? "primary" : null,
      range_start: input.rangeStart ?? null,
      range_end: input.rangeEnd ?? null,
      timezone: input.timezone ?? null,
      google_http_status: input.googleHttpStatus,
      google_reason: input.googleReason,
      token_refresh_attempted: input.tokenRefreshAttempted,
      busy_interval_count: null,
      generated_slot_count: null,
      slots_removed_by_busy: null,
      slots_removed_by_window_end: null,
      slots_removed_by_lead_time: null,
      slots_removed_by_same_day: null,
      slots_truncated_by_limit: null
    }
  });
}

async function accessToken(input: ServiceInput, forceRefresh = false) {
  const token = await getValidGoogleAccessTokenForUser({ userId: input.userId, companyId: input.companyId, forceRefresh });
  if (!token.ok) {
    return {
      ok: false as const,
      outcome: token.reason === "reconnect_required"
        ? "reconnect_required" as const
        : token.reason === "missing_connection"
          ? "missing_connection" as const
          : "failed" as const,
      errorCategory: token.category,
      refreshAttempted: token.refreshAttempted
    };
  }
  return { ok: true as const, value: token.accessToken, refreshAttempted: token.refreshAttempted };
}

function providerOutcome(provider: GoogleCalendarFailure) {
  return provider.outcome === "unknown" ? "unknown" as const : "failed" as const;
}

export async function getGoogleAvailability(input: ServiceInput & {
  windowStartLocal: string; windowEndLocal: string; timezone: string; durationMinutes: number;
}) {
  const context = await loadContext(input, "calendarFreeBusy");
  if (!context.ok) {
    const category = context.outcome === "missing_connection" || context.outcome === "reconnect_required" || context.outcome === "missing_capability"
      ? context.outcome
      : "invalid_input";
    availabilityDiagnostic({ stage: "context", googleHttpStatus: null, category, googleReason: null, tokenRefreshAttempted: false, validCalendarId: null, validRfc3339Range: null, validIanaTimezone: isIanaTimeZone(input.timezone), timezone: input.timezone, calendarCapability: context.outcome === "missing_capability" ? false : null });
    return context;
  }
  const timeMin = zonedLocalToIso(input.windowStartLocal, input.timezone);
  const timeMax = zonedLocalToIso(input.windowEndLocal, input.timezone);
  const durationMinutes = Math.trunc(input.durationMinutes);
  const validRfc3339Range = Boolean(timeMin && timeMax && /^\d{4}-\d{2}-\d{2}T/.test(timeMin) && /^\d{4}-\d{2}-\d{2}T/.test(timeMax) && Number.isFinite(Date.parse(timeMin)) && Number.isFinite(Date.parse(timeMax)) && Date.parse(timeMax) > Date.parse(timeMin));
  if (!validRfc3339Range || Date.parse(timeMax!) - Date.parse(timeMin!) > 14 * 86400_000 || durationMinutes < 15 || durationMinutes > 240) {
    availabilityDiagnostic({ stage: "input_validation", googleHttpStatus: null, category: "invalid_input", googleReason: null, tokenRefreshAttempted: false, validCalendarId: GOOGLE_FREEBUSY_CALENDAR_ID === "primary", validRfc3339Range, validIanaTimezone: isIanaTimeZone(input.timezone), rangeStart: timeMin, rangeEnd: timeMax, timezone: input.timezone, calendarCapability: true });
    return { ok: false as const, outcome: "invalid_input" as const, errorCategory: "invalid_input" as const };
  }
  const token = await accessToken(input);
  if (!token.ok) {
    availabilityDiagnostic({ stage: "token_manager", googleHttpStatus: null, category: token.errorCategory, googleReason: null, tokenRefreshAttempted: token.refreshAttempted, validCalendarId: GOOGLE_FREEBUSY_CALENDAR_ID === "primary", validRfc3339Range, validIanaTimezone: isIanaTimeZone(input.timezone), rangeStart: timeMin, rangeEnd: timeMax, timezone: input.timezone, calendarCapability: true });
    return { ok: false as const, outcome: token.outcome, errorCategory: token.errorCategory };
  }
  let provider = await queryGoogleFreeBusy({ accessToken: token.value, timeMin: timeMin!, timeMax: timeMax!, timeZone: input.timezone });
  let tokenRefreshAttempted = token.refreshAttempted;
  if (!provider.ok && provider.status === 401) {
    const refreshedToken = await accessToken(input, true);
    tokenRefreshAttempted = tokenRefreshAttempted || refreshedToken.refreshAttempted;
    if (!refreshedToken.ok) {
      availabilityDiagnostic({ stage: "token_manager", googleHttpStatus: 401, category: refreshedToken.errorCategory, googleReason: provider.reason, tokenRefreshAttempted, validCalendarId: GOOGLE_FREEBUSY_CALENDAR_ID === "primary", validRfc3339Range, validIanaTimezone: isIanaTimeZone(input.timezone), rangeStart: timeMin, rangeEnd: timeMax, timezone: input.timezone, calendarCapability: true });
      return { ok: false as const, outcome: refreshedToken.outcome, errorCategory: refreshedToken.errorCategory };
    }
    provider = await queryGoogleFreeBusy({ accessToken: refreshedToken.value, timeMin: timeMin!, timeMax: timeMax!, timeZone: input.timezone });
  }
  if (!provider.ok) {
    availabilityDiagnostic({ stage: tokenRefreshAttempted ? "freebusy_retry" : "freebusy_request", googleHttpStatus: provider.status, category: provider.category, googleReason: provider.reason, tokenRefreshAttempted, validCalendarId: GOOGLE_FREEBUSY_CALENDAR_ID === "primary", validRfc3339Range, validIanaTimezone: isIanaTimeZone(input.timezone), rangeStart: timeMin, rangeEnd: timeMax, timezone: input.timezone, calendarCapability: true });
    return { ok: false as const, outcome: providerOutcome(provider), errorCategory: provider.reason };
  }
  const busy = normalizeBusyWindows(provider.busy, timeMin!, timeMax!);
  const generated = suggestAvailableMeetingTimesWithDiagnostics({ rangeStart: timeMin!, rangeEnd: timeMax!, durationMinutes, busy });
  emitGoogleCalendarDiagnostic({
    level: "info",
    diagnostic: {
      stage: "slot_generation",
      safe_error_category: "none",
      authenticated_user: true,
      calendar_capability: true,
      calendar_id: "primary",
      range_start: timeMin!,
      range_end: timeMax!,
      timezone: input.timezone,
      google_http_status: 200,
      google_reason: null,
      token_refresh_attempted: tokenRefreshAttempted,
      busy_interval_count: busy.length,
      generated_slot_count: generated.suggestions.length,
      slots_removed_by_busy: generated.diagnostics.removedByBusy,
      slots_removed_by_window_end: generated.diagnostics.removedByWindowEnd,
      slots_removed_by_lead_time: generated.diagnostics.removedByLeadTime,
      slots_removed_by_same_day: generated.diagnostics.removedBySameDay,
      slots_truncated_by_limit: generated.diagnostics.truncatedByLimit
    }
  });
  return {
    ok: true as const,
    timezone: input.timezone,
    range: { start: timeMin!, end: timeMax! },
    suggestions: generated.suggestions
  };
}

export async function createGoogleMeeting(input: ServiceInput & {
  idempotencyKey: string; startsAt: string; endsAt: string; timezone: string; title: string; includeMeet: boolean;
}) {
  const meeting = validateMeetingInput(input);
  if (!meeting || !isUuid(input.idempotencyKey)) return { ok: false as const, outcome: "invalid_input" as const };
  const context = await loadContext(input, "calendarEventsOwned");
  if (!context.ok) return context;
  const providerClaim = await claimCalendarMeetingProvider({
    idempotencyKey: input.idempotencyKey,
    companyId: input.companyId,
    leadId: input.leadId,
    userId: input.userId,
    role: input.role,
    isBearer: input.isBearer,
    provider: "google_workspace"
  });
  if (!providerClaim.ok) return providerClaim;
  const supabase = createAdminClient();
  const googleEventId = deterministicGoogleEventId(input.idempotencyKey);
  const conferenceRequestId = input.includeMeet ? input.idempotencyKey : null;
  const { data, error } = await (supabase as any).from("google_calendar_meeting_activities").insert({
    company_id: input.companyId, event_id: context.lead.event_id, lead_id: context.lead.id,
    connection_id: context.connection.id, acting_user_id: input.userId, attendee_email: context.attendeeEmail,
    idempotency_key: input.idempotencyKey, provider_calendar_id: "primary", google_event_id: googleEventId,
    conference_request_id: conferenceRequestId, starts_at: meeting.startsAt, ends_at: meeting.endsAt,
    timezone: meeting.timezone, status: "pending", last_operation: "create", last_operation_status: "pending",
    last_operation_key: input.idempotencyKey
  }).select(ACTIVITY_COLUMNS).maybeSingle();
  if (error && error.code !== "23505") throw new Error("Unable to reserve the Google meeting.");
  if (!data) {
    const { data: existing } = await (supabase as any).from("google_calendar_meeting_activities").select(ACTIVITY_COLUMNS)
      .eq("idempotency_key", input.idempotencyKey).eq("company_id", input.companyId).eq("lead_id", input.leadId).eq("acting_user_id", input.userId).maybeSingle();
    if (!existing) throw new Error("Unable to resolve the duplicate Google meeting.");
    return { ok: true as const, outcome: "duplicate" as const, activity: toActivity(existing as ActivityRow) };
  }
  const token = await accessToken(input);
  if (!token.ok) {
    await (supabase as any).from("google_calendar_meeting_activities").update({ status: "pending", last_operation_status: "failed", safe_error_category: token.outcome === "reconnect_required" ? "reconnect_required" : "provider_unavailable" }).eq("id", data.id);
    return token;
  }
  let provider = await createGoogleCalendarEvent({ accessToken: token.value, eventId: googleEventId, attendeeEmail: context.attendeeEmail, startsAt: meeting.startsAt, endsAt: meeting.endsAt, timeZone: meeting.timezone, title: meeting.title, description: "Scheduled from SignalThread Lead Retrieval.", includeMeet: input.includeMeet, conferenceRequestId: conferenceRequestId ?? input.idempotencyKey });
  let tokenRefreshAttempted = token.refreshAttempted;
  if (!provider.ok && provider.status === 401) {
    const refreshedToken = await accessToken(input, true);
    tokenRefreshAttempted = tokenRefreshAttempted || refreshedToken.refreshAttempted;
    if (!refreshedToken.ok) {
      await (supabase as any).from("google_calendar_meeting_activities").update({ status: "pending", last_operation_status: "failed", safe_error_category: refreshedToken.errorCategory }).eq("id", data.id);
      emitGoogleCalendarDiagnostic({
        level: "error",
        diagnostic: {
          stage: "event_create_retry", safe_error_category: refreshedToken.errorCategory,
          authenticated_user: true, calendar_capability: true, calendar_id: "primary",
          range_start: meeting.startsAt, range_end: meeting.endsAt, timezone: meeting.timezone,
          google_http_status: 401, google_reason: provider.reason,
          token_refresh_attempted: tokenRefreshAttempted, busy_interval_count: null,
          generated_slot_count: null, slots_removed_by_busy: null,
          slots_removed_by_window_end: null, slots_removed_by_lead_time: null,
          slots_removed_by_same_day: null, slots_truncated_by_limit: null
        }
      });
      return refreshedToken;
    }
    provider = await createGoogleCalendarEvent({ accessToken: refreshedToken.value, eventId: googleEventId, attendeeEmail: context.attendeeEmail, startsAt: meeting.startsAt, endsAt: meeting.endsAt, timeZone: meeting.timezone, title: meeting.title, description: "Scheduled from SignalThread Lead Retrieval.", includeMeet: input.includeMeet, conferenceRequestId: conferenceRequestId ?? input.idempotencyKey });
  }
  if (!provider.ok) {
    const status = provider.outcome === "unknown" ? "unknown" : "pending";
    const { data: failed } = await (supabase as any).from("google_calendar_meeting_activities").update({ status, last_operation_status: provider.outcome, safe_error_category: provider.reason }).eq("id", data.id).select(ACTIVITY_COLUMNS).maybeSingle();
    emitGoogleCalendarDiagnostic({
      level: "error",
      diagnostic: {
        stage: tokenRefreshAttempted ? "event_create_retry" : "event_create",
        safe_error_category: provider.reason, authenticated_user: true,
        calendar_capability: true, calendar_id: "primary", range_start: meeting.startsAt,
        range_end: meeting.endsAt, timezone: meeting.timezone,
        google_http_status: provider.status, google_reason: provider.reason,
        token_refresh_attempted: tokenRefreshAttempted, busy_interval_count: null,
        generated_slot_count: null, slots_removed_by_busy: null,
        slots_removed_by_window_end: null, slots_removed_by_lead_time: null,
        slots_removed_by_same_day: null, slots_truncated_by_limit: null
      }
    });
    return { ok: false as const, outcome: providerOutcome(provider), errorCategory: provider.reason, ...(failed ? { activity: toActivity(failed as ActivityRow) } : {}) };
  }
  emitGoogleCalendarDiagnostic({
    level: "info",
    diagnostic: {
      stage: tokenRefreshAttempted ? "event_create_retry" : "event_create",
      safe_error_category: "none", authenticated_user: true,
      calendar_capability: true, calendar_id: "primary", range_start: meeting.startsAt,
      range_end: meeting.endsAt, timezone: meeting.timezone,
      google_http_status: 200, google_reason: null,
      token_refresh_attempted: tokenRefreshAttempted, busy_interval_count: null,
      generated_slot_count: null, slots_removed_by_busy: null,
      slots_removed_by_window_end: null, slots_removed_by_lead_time: null,
      slots_removed_by_same_day: null, slots_truncated_by_limit: null,
      organizer_email: provider.identity.organizerEmail,
      creator_email: provider.identity.creatorEmail
    }
  });
  const { data: saved, error: saveError } = await (supabase as any).from("google_calendar_meeting_activities").update({ google_event_id: provider.eventId, google_meet_uri: provider.meetUri, status: "scheduled", last_operation_status: "succeeded", safe_error_category: null }).eq("id", data.id).select(ACTIVITY_COLUMNS).maybeSingle();
  if (saveError || !saved) {
    await (supabase as any).from("google_calendar_meeting_activities").update({ status: "unknown", last_operation_status: "unknown", safe_error_category: "persistence_failure" }).eq("id", data.id);
    return { ok: false as const, outcome: "unknown" as const };
  }
  return { ok: true as const, outcome: "scheduled" as const, activity: toActivity(saved as ActivityRow) };
}

async function loadActivityForMutation(input: ServiceInput & { activityId: string }) {
  const context = await loadContext(input, "calendarEventsOwned");
  if (!context.ok) return context;
  const supabase = createAdminClient();
  const { data } = await (supabase as any).from("google_calendar_meeting_activities").select(ACTIVITY_COLUMNS)
    .eq("id", input.activityId).eq("company_id", input.companyId).eq("lead_id", input.leadId).eq("acting_user_id", input.userId).maybeSingle();
  if (!data) return { ok: false as const, outcome: "meeting_not_found" as const };
  return { ok: true as const, context, row: data as ActivityRow };
}

export async function updateGoogleMeeting(input: ServiceInput & { activityId: string; operationKey: string; startsAt: string; endsAt: string; timezone: string; title: string }) {
  const meeting = validateMeetingInput(input);
  if (!meeting || !isUuid(input.operationKey)) return { ok: false as const, outcome: "invalid_input" as const };
  const loaded = await loadActivityForMutation(input);
  if (!loaded.ok) return loaded;
  if (loaded.row.status === "cancelled") return { ok: false as const, outcome: "meeting_not_found" as const };
  if (loaded.row.last_operation_key === input.operationKey) return { ok: true as const, outcome: "duplicate" as const, activity: toActivity(loaded.row) };
  const supabase = createAdminClient();
  const { data: claimed } = await (supabase as any).from("google_calendar_meeting_activities").update({ last_operation: "update", last_operation_status: "pending", last_operation_key: input.operationKey, safe_error_category: null })
    .eq("id", loaded.row.id).eq("updated_at", loaded.row.updated_at).select(ACTIVITY_COLUMNS).maybeSingle();
  if (!claimed) return { ok: false as const, outcome: "conflict" as const };
  const token = await accessToken(input);
  if (!token.ok) {
    await (supabase as any).from("google_calendar_meeting_activities").update({ last_operation_status: "failed", safe_error_category: token.outcome === "reconnect_required" ? "reconnect_required" : "provider_unavailable" }).eq("id", loaded.row.id).eq("last_operation_key", input.operationKey);
    return token;
  }
  const provider = await updateGoogleCalendarEvent({ accessToken: token.value, eventId: loaded.row.google_event_id, attendeeEmail: loaded.context.attendeeEmail, startsAt: meeting.startsAt, endsAt: meeting.endsAt, timeZone: meeting.timezone, title: meeting.title });
  if (!provider.ok) {
    await (supabase as any).from("google_calendar_meeting_activities").update({ last_operation_status: provider.outcome, safe_error_category: provider.category }).eq("id", loaded.row.id).eq("last_operation_key", input.operationKey);
    return { ok: false as const, outcome: providerOutcome(provider) };
  }
  const { data: saved } = await (supabase as any).from("google_calendar_meeting_activities").update({ starts_at: meeting.startsAt, ends_at: meeting.endsAt, timezone: meeting.timezone, status: "scheduled", last_operation_status: "succeeded", safe_error_category: null }).eq("id", loaded.row.id).eq("last_operation_key", input.operationKey).select(ACTIVITY_COLUMNS).maybeSingle();
  return saved ? { ok: true as const, outcome: "updated" as const, activity: toActivity(saved as ActivityRow) } : { ok: false as const, outcome: "unknown" as const };
}

export async function cancelGoogleMeeting(input: ServiceInput & { activityId: string; operationKey: string }) {
  if (!isUuid(input.operationKey)) return { ok: false as const, outcome: "invalid_input" as const };
  const loaded = await loadActivityForMutation(input);
  if (!loaded.ok) return loaded;
  if (loaded.row.status === "cancelled" || loaded.row.last_operation_key === input.operationKey) return { ok: true as const, outcome: "duplicate" as const, activity: toActivity(loaded.row) };
  const supabase = createAdminClient();
  const { data: claimed } = await (supabase as any).from("google_calendar_meeting_activities").update({ last_operation: "cancel", last_operation_status: "pending", last_operation_key: input.operationKey, safe_error_category: null })
    .eq("id", loaded.row.id).eq("updated_at", loaded.row.updated_at).select("id").maybeSingle();
  if (!claimed) return { ok: false as const, outcome: "conflict" as const };
  const token = await accessToken(input);
  if (!token.ok) {
    await (supabase as any).from("google_calendar_meeting_activities").update({ last_operation_status: "failed", safe_error_category: token.outcome === "reconnect_required" ? "reconnect_required" : "provider_unavailable" }).eq("id", loaded.row.id).eq("last_operation_key", input.operationKey);
    return token;
  }
  const provider = await cancelGoogleCalendarEvent({ accessToken: token.value, eventId: loaded.row.google_event_id });
  if (!provider.ok) {
    await (supabase as any).from("google_calendar_meeting_activities").update({ last_operation_status: provider.outcome, safe_error_category: provider.category }).eq("id", loaded.row.id).eq("last_operation_key", input.operationKey);
    return { ok: false as const, outcome: providerOutcome(provider) };
  }
  const now = new Date().toISOString();
  const { data: saved } = await (supabase as any).from("google_calendar_meeting_activities").update({ status: "cancelled", cancelled_at: now, last_operation_status: "succeeded", safe_error_category: null }).eq("id", loaded.row.id).eq("last_operation_key", input.operationKey).select(ACTIVITY_COLUMNS).maybeSingle();
  return saved ? { ok: true as const, outcome: "cancelled" as const, activity: toActivity(saved as ActivityRow) } : { ok: false as const, outcome: "unknown" as const };
}

export async function listGoogleMeetingsForLead(input: { companyId: string; leadId: string }) {
  const supabase = createAdminClient();
  const { data, error } = await (supabase as any).from("google_calendar_meeting_activities").select(ACTIVITY_COLUMNS)
    .eq("company_id", input.companyId).eq("lead_id", input.leadId).order("created_at", { ascending: false }).limit(25);
  if (error) throw new Error("Unable to load Google meeting activity.");
  const rows = (data ?? []) as ActivityRow[];
  const connectionIds = [...new Set(rows.flatMap((row) => row.connection_id ? [row.connection_id] : []))];
  const actingUserIds = [...new Set(rows.flatMap((row) => row.acting_user_id ? [row.acting_user_id] : []))];
  const [{ data: connections }, { data: users }] = await Promise.all([
    connectionIds.length
      ? supabase.from("google_workspace_connections").select("id, google_display_name, google_email").in("id", connectionIds)
      : Promise.resolve({ data: [] as Array<{ id: string; google_display_name: string | null; google_email: string | null }> }),
    actingUserIds.length
      ? supabase.from("users").select("id, full_name, email").eq("company_id", input.companyId).in("id", actingUserIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null }> })
  ]);
  const calendarOwners = new Map((connections ?? []).map((connection) => [connection.id, { name: connection.google_display_name, email: connection.google_email }]));
  const actingUsers = new Map((users ?? []).map((user) => [user.id, { name: user.full_name, email: user.email }]));
  return rows.map((row) => toActivity(row, { calendarOwners, actingUsers }));
}
