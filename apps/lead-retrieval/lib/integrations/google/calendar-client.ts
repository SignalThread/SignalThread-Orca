import "server-only";

import type { BusyWindow } from "@/lib/integrations/google/calendar-core";

export type GoogleCalendarFailure = {
  ok: false;
  outcome: "failed" | "unknown";
  category: "provider_rejected" | "provider_unavailable" | "unknown_outcome";
  status: number | null;
  reason: "invalid_request" | "authentication_failed" | "insufficient_permissions" | "api_not_configured" | "rate_limited" | "provider_unavailable" | "provider_rejected" | "unknown";
};

export const GOOGLE_FREEBUSY_CALENDAR_ID = "primary";

function safeReasonForResponse(status: number, payload: unknown): GoogleCalendarFailure["reason"] {
  const googleStatus = typeof (payload as { error?: { status?: unknown } } | null)?.error?.status === "string"
    ? (payload as { error: { status: string } }).error.status
    : "";
  const googleReason = Array.isArray((payload as { error?: { errors?: unknown } } | null)?.error?.errors)
    ? (payload as { error: { errors: Array<{ reason?: unknown }> } }).error.errors[0]?.reason
    : "";
  const normalized = `${googleStatus} ${typeof googleReason === "string" ? googleReason : ""}`.toLowerCase();
  if (status === 400 || /invalid(argument|request)|badrequest/.test(normalized)) return "invalid_request";
  if (status === 401 || /auth(error|entication)|invalidcredentials/.test(normalized)) return "authentication_failed";
  if (/accessnotconfigured|servicedisabled|api.*disabled/.test(normalized)) return "api_not_configured";
  if (status === 403 && /ratelimit|quota/.test(normalized)) return "rate_limited";
  if (status === 403 || /insufficient|forbidden|permission/.test(normalized)) return "insufficient_permissions";
  if (status >= 500) return "provider_unavailable";
  return "provider_rejected";
}

async function failureForResponse(response: Response): Promise<GoogleCalendarFailure> {
  const payload = await response.clone().json().catch(() => null);
  const status = response.status;
  return {
    ok: false,
    outcome: "failed",
    category: status >= 500 ? "provider_unavailable" : "provider_rejected",
    status,
    reason: safeReasonForResponse(status, payload)
  };
}

async function googleRequest(input: {
  accessToken: string;
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  fetchImpl?: typeof fetch;
}) {
  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" })
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      cache: "no-store"
    });
    return { ok: true as const, response };
  } catch {
    return { ok: false as const, failure: { ok: false as const, outcome: "unknown" as const, category: "unknown_outcome" as const, status: null, reason: "unknown" as const } };
  }
}

export async function queryGoogleFreeBusy(input: {
  accessToken: string;
  timeMin: string;
  timeMax: string;
  timeZone: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; busy: BusyWindow[] } | GoogleCalendarFailure> {
  const request = await googleRequest({
    accessToken: input.accessToken,
    url: "https://www.googleapis.com/calendar/v3/freeBusy",
    method: "POST",
    body: { timeMin: input.timeMin, timeMax: input.timeMax, timeZone: input.timeZone, items: [{ id: GOOGLE_FREEBUSY_CALENDAR_ID }] },
    fetchImpl: input.fetchImpl
  });
  if (!request.ok) return request.failure;
  if (!request.response.ok) return failureForResponse(request.response);
  const payload = (await request.response.json().catch(() => null)) as { calendars?: { primary?: { busy?: unknown } } } | null;
  const busy = Array.isArray(payload?.calendars?.primary?.busy)
    ? payload!.calendars!.primary!.busy!.flatMap((value) => {
        const row = value as { start?: unknown; end?: unknown };
        return typeof row.start === "string" && typeof row.end === "string" ? [{ start: row.start, end: row.end }] : [];
      })
    : [];
  return { ok: true, busy };
}

export type GoogleCalendarEventIdentity = {
  organizerEmail: string | null;
  creatorEmail: string | null;
};

function returnedGoogleEmail(value: unknown): string | null {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  return email && email.length <= 320 ? email : null;
}

export async function createGoogleCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  attendeeEmail: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  title: string;
  description?: string | null;
  includeMeet: boolean;
  conferenceRequestId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; eventId: string; meetUri: string | null; identity: GoogleCalendarEventIdentity } | GoogleCalendarFailure> {
  const request = await googleRequest({
    accessToken: input.accessToken,
    url: "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
    method: "POST",
    body: {
      id: input.eventId,
      summary: input.title,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      start: { dateTime: input.startsAt, timeZone: input.timeZone },
      end: { dateTime: input.endsAt, timeZone: input.timeZone },
      attendees: [{ email: input.attendeeEmail }],
      ...(input.includeMeet ? { conferenceData: { createRequest: { requestId: input.conferenceRequestId, conferenceSolutionKey: { type: "hangoutsMeet" } } } } : {})
    },
    fetchImpl: input.fetchImpl
  });
  if (!request.ok) return request.failure;
  // The deterministic provider event ID makes a retry after an uncertain
  // response safe: Google cannot create a second meeting for the same LR
  // idempotency key.
  if (request.response.status === 409) {
    return { ok: true, eventId: input.eventId, meetUri: null, identity: { organizerEmail: null, creatorEmail: null } };
  }
  if (!request.response.ok) return failureForResponse(request.response);
  const payload = (await request.response.json().catch(() => null)) as {
    id?: unknown;
    hangoutLink?: unknown;
    organizer?: { email?: unknown } | null;
    creator?: { email?: unknown } | null;
  } | null;
  const eventId = typeof payload?.id === "string" ? payload.id.trim() : "";
  if (!eventId) return { ok: false, outcome: "unknown", category: "unknown_outcome", status: request.response.status, reason: "unknown" };
  return {
    ok: true,
    eventId,
    meetUri: typeof payload?.hangoutLink === "string" ? payload.hangoutLink : null,
    identity: {
      organizerEmail: returnedGoogleEmail(payload?.organizer?.email),
      creatorEmail: returnedGoogleEmail(payload?.creator?.email)
    }
  };
}

/** Private acting-user reminder: no attendee, invitation, or Meet request. */
export async function createGooglePrivateCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  title: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; eventId: string } | GoogleCalendarFailure> {
  const request = await googleRequest({
    accessToken: input.accessToken,
    url: "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none",
    method: "POST",
    body: {
      id: input.eventId,
      summary: input.title,
      start: { dateTime: input.startsAt, timeZone: input.timeZone },
      end: { dateTime: input.endsAt, timeZone: input.timeZone },
      visibility: "private"
    },
    fetchImpl: input.fetchImpl
  });
  if (!request.ok) return request.failure;
  // A retry after Google accepted the first request is successful because the
  // canonical deterministic event id proves this is the same reminder.
  if (request.response.status === 409) return { ok: true, eventId: input.eventId };
  if (!request.response.ok) return failureForResponse(request.response);
  const payload = await request.response.json().catch(() => null) as { id?: unknown } | null;
  const eventId = typeof payload?.id === "string" ? payload.id.trim() : "";
  return eventId ? { ok: true, eventId } : { ok: false, outcome: "unknown", category: "unknown_outcome", status: request.response.status, reason: "unknown" };
}

/** Update the acting user's private reminder without attendees or conferencing. */
export async function updateGooglePrivateCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  title: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | GoogleCalendarFailure> {
  const request = await googleRequest({
    accessToken: input.accessToken,
    url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}?sendUpdates=none`,
    method: "PATCH",
    body: {
      summary: input.title,
      start: { dateTime: input.startsAt, timeZone: input.timeZone },
      end: { dateTime: input.endsAt, timeZone: input.timeZone },
      visibility: "private"
    },
    fetchImpl: input.fetchImpl
  });
  if (!request.ok) return request.failure;
  if (!request.response.ok) return failureForResponse(request.response);
  return { ok: true };
}

/** Delete the acting user's private reminder without sending updates. */
export async function deleteGooglePrivateCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | GoogleCalendarFailure> {
  const request = await googleRequest({
    accessToken: input.accessToken,
    url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}?sendUpdates=none`,
    method: "DELETE",
    fetchImpl: input.fetchImpl
  });
  if (!request.ok) return request.failure;
  if (![200, 204, 404, 410].includes(request.response.status)) {
    return failureForResponse(request.response);
  }
  return { ok: true };
}

export async function updateGoogleCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  attendeeEmail: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  title: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | GoogleCalendarFailure> {
  const request = await googleRequest({
    accessToken: input.accessToken,
    url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}?sendUpdates=all`,
    method: "PATCH",
    body: {
      summary: input.title,
      start: { dateTime: input.startsAt, timeZone: input.timeZone },
      end: { dateTime: input.endsAt, timeZone: input.timeZone },
      attendees: [{ email: input.attendeeEmail }]
    },
    fetchImpl: input.fetchImpl
  });
  if (!request.ok) return request.failure;
  if (!request.response.ok) return failureForResponse(request.response);
  return { ok: true };
}

export async function cancelGoogleCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | GoogleCalendarFailure> {
  const request = await googleRequest({
    accessToken: input.accessToken,
    url: `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(input.eventId)}?sendUpdates=all`,
    method: "DELETE",
    fetchImpl: input.fetchImpl
  });
  if (!request.ok) return request.failure;
  if (!request.response.ok && request.response.status !== 410) return failureForResponse(request.response);
  return { ok: true };
}
