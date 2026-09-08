import "server-only";

export const MICROSOFT_GET_SCHEDULE_ENDPOINT =
  "https://graph.microsoft.com/v1.0/me/calendar/getSchedule";
export const MICROSOFT_EVENTS_ENDPOINT = "https://graph.microsoft.com/v1.0/me/events";
const MICROSOFT_CALENDAR_TIMEOUT_MS = 15_000;

export type MicrosoftCalendarFailure = {
  ok: false;
  outcome: "failed" | "unknown";
  category:
    | "provider_unauthorized"
    | "permission_required"
    | "provider_throttled"
    | "provider_unavailable"
    | "provider_rejected"
    | "unknown_outcome";
  status: number | null;
  retryAfterSeconds?: number | null;
};

type GraphDateTime = { dateTime?: unknown; timeZone?: unknown };

export type MicrosoftScheduleItem = {
  status: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
};

function retryAfterSeconds(response: Response) {
  const raw = response.headers.get("retry-after");
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  return Math.min(Number(raw), 86_400);
}

function failureForResponse(response: Response): MicrosoftCalendarFailure {
  if (response.status === 401) {
    return { ok: false, outcome: "failed", category: "provider_unauthorized", status: 401 };
  }
  if (response.status === 403) {
    return { ok: false, outcome: "failed", category: "permission_required", status: 403 };
  }
  if (response.status === 429) {
    return {
      ok: false,
      outcome: "failed",
      category: "provider_throttled",
      status: 429,
      retryAfterSeconds: retryAfterSeconds(response)
    };
  }
  if (response.status >= 500) {
    return {
      ok: false,
      outcome: "unknown",
      category: "provider_unavailable",
      status: response.status
    };
  }
  return {
    ok: false,
    outcome: "failed",
    category: "provider_rejected",
    status: response.status
  };
}

async function graphRequest(input: {
  accessToken: string;
  url: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  timeZone?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}) {
  try {
    const response = await (input.fetchImpl ?? fetch)(input.url, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(input.timeZone ? { Prefer: `outlook.timezone="${input.timeZone}"` } : {})
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      cache: "no-store",
      signal: input.signal ?? AbortSignal.timeout(MICROSOFT_CALENDAR_TIMEOUT_MS)
    });
    return { ok: true as const, response };
  } catch {
    return {
      ok: false as const,
      failure: {
        ok: false as const,
        outcome: "unknown" as const,
        category: "unknown_outcome" as const,
        status: null
      }
    };
  }
}

function safeGraphDateTime(value: GraphDateTime | null | undefined) {
  const dateTime = typeof value?.dateTime === "string" ? value.dateTime.trim() : "";
  const timeZone = typeof value?.timeZone === "string" ? value.timeZone.trim() : "";
  return dateTime && timeZone ? { dateTime, timeZone } : null;
}

export async function queryMicrosoftSchedule(input: {
  accessToken: string;
  scheduleEmail: string;
  timeMin: string;
  timeMax: string;
  timeZone: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ ok: true; scheduleItems: MicrosoftScheduleItem[] } | MicrosoftCalendarFailure> {
  const request = await graphRequest({
    accessToken: input.accessToken,
    url: MICROSOFT_GET_SCHEDULE_ENDPOINT,
    method: "POST",
    timeZone: input.timeZone,
    body: {
      schedules: [input.scheduleEmail],
      startTime: { dateTime: input.timeMin, timeZone: input.timeZone },
      endTime: { dateTime: input.timeMax, timeZone: input.timeZone },
      availabilityViewInterval: 15
    },
    fetchImpl: input.fetchImpl,
    signal: input.signal
  });
  if (!request.ok) return request.failure;
  if (!request.response.ok) return failureForResponse(request.response);
  const payload = (await request.response.json().catch(() => null)) as {
    value?: Array<{ scheduleItems?: unknown }>;
  } | null;
  const rawItems = Array.isArray(payload?.value?.[0]?.scheduleItems)
    ? payload!.value![0].scheduleItems as unknown[]
    : [];
  const scheduleItems = rawItems.flatMap((value) => {
    const row = value as { status?: unknown; start?: GraphDateTime; end?: GraphDateTime };
    const start = safeGraphDateTime(row.start);
    const end = safeGraphDateTime(row.end);
    if (!start || !end) return [];
    return [{ status: typeof row.status === "string" ? row.status : "busy", start, end }];
  });
  return { ok: true, scheduleItems };
}

export async function createMicrosoftCalendarEvent(input: {
  accessToken: string;
  attendeeEmail: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  title: string;
  description?: string | null;
  includeTeams: boolean;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<
  | { ok: true; eventId: string; joinUrl: string | null; status: number }
  | MicrosoftCalendarFailure
> {
  const request = await graphRequest({
    accessToken: input.accessToken,
    url: MICROSOFT_EVENTS_ENDPOINT,
    method: "POST",
    timeZone: input.timeZone,
    body: {
      subject: input.title,
      body: {
        contentType: "Text",
        content: input.description?.trim() || "Scheduled from SignalThread Lead Retrieval."
      },
      start: { dateTime: input.startsAt, timeZone: input.timeZone },
      end: { dateTime: input.endsAt, timeZone: input.timeZone },
      attendees: [
        { emailAddress: { address: input.attendeeEmail }, type: "required" }
      ],
      ...(input.includeTeams
        ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" }
        : {})
    },
    fetchImpl: input.fetchImpl,
    signal: input.signal
  });
  if (!request.ok) return request.failure;
  if (!request.response.ok) return failureForResponse(request.response);
  const payload = (await request.response.json().catch(() => null)) as {
    id?: unknown;
    onlineMeeting?: { joinUrl?: unknown } | null;
    onlineMeetingUrl?: unknown;
  } | null;
  const eventId = typeof payload?.id === "string" ? payload.id.trim() : "";
  if (!eventId) {
    return {
      ok: false,
      outcome: "unknown",
      category: "unknown_outcome",
      status: request.response.status
    };
  }
  const joinUrl =
    typeof payload?.onlineMeeting?.joinUrl === "string"
      ? payload.onlineMeeting.joinUrl
      : typeof payload?.onlineMeetingUrl === "string"
        ? payload.onlineMeetingUrl
        : null;
  return { ok: true, eventId, joinUrl, status: request.response.status };
}

export async function updateMicrosoftCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  attendeeEmail: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  title: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ ok: true; status: number } | MicrosoftCalendarFailure> {
  const request = await graphRequest({
    accessToken: input.accessToken,
    url: `${MICROSOFT_EVENTS_ENDPOINT}/${encodeURIComponent(input.eventId)}`,
    method: "PATCH",
    timeZone: input.timeZone,
    body: {
      subject: input.title,
      start: { dateTime: input.startsAt, timeZone: input.timeZone },
      end: { dateTime: input.endsAt, timeZone: input.timeZone },
      attendees: [
        { emailAddress: { address: input.attendeeEmail }, type: "required" }
      ]
    },
    fetchImpl: input.fetchImpl,
    signal: input.signal
  });
  if (!request.ok) return request.failure;
  if (!request.response.ok) return failureForResponse(request.response);
  return { ok: true, status: request.response.status };
}

export async function deleteMicrosoftCalendarEvent(input: {
  accessToken: string;
  eventId: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ ok: true; status: number } | MicrosoftCalendarFailure> {
  const request = await graphRequest({
    accessToken: input.accessToken,
    url: `${MICROSOFT_EVENTS_ENDPOINT}/${encodeURIComponent(input.eventId)}`,
    method: "DELETE",
    fetchImpl: input.fetchImpl,
    signal: input.signal
  });
  if (!request.ok) return request.failure;
  if (request.response.status === 404 || request.response.status === 410) {
    return { ok: true, status: request.response.status };
  }
  if (!request.response.ok) return failureForResponse(request.response);
  return { ok: true, status: request.response.status };
}
