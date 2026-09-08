import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function freeBusyResponse(status: number, reason?: string) {
  const script = `
    const module = await import("./lib/integrations/google/calendar-client.ts");
    const { queryGoogleFreeBusy } = module.default ?? module;
    let captured = null;
    const result = await queryGoogleFreeBusy({
      accessToken: "test-token",
      timeMin: "2026-08-01T09:00:00.000Z",
      timeMax: "2026-08-01T10:00:00.000Z",
      timeZone: "America/New_York",
      fetchImpl: async (url, init) => {
        captured = { url: String(url), method: init.method, body: JSON.parse(String(init.body)) };
        const payload = ${status} === 200
          ? { calendars: { primary: { busy: [] } } }
          : { error: { status: ${status} === 401 ? "UNAUTHENTICATED" : ${status} === 403 ? "PERMISSION_DENIED" : ${status} >= 500 ? "INTERNAL" : "INVALID_ARGUMENT", errors: ${JSON.stringify(reason ? [{ reason }] : [])} } };
        return new Response(JSON.stringify(payload), { status: ${status} });
      }
    });
    console.log(JSON.stringify({ captured, result }));
  `;
  const run = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], {
    cwd: process.cwd(), encoding: "utf8"
  });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout) as {
    captured: { url: string; method: string; body: { timeMin: string; timeMax: string; timeZone: string; items: Array<{ id: string }> } };
    result: { ok: boolean; status?: number; reason?: string; category?: string };
  };
}

test("FreeBusy sends the primary calendar and RFC3339 range in the documented payload", () => {
  const { captured, result } = freeBusyResponse(200);
  assert.equal(captured.url, "https://www.googleapis.com/calendar/v3/freeBusy");
  assert.equal(captured.method, "POST");
  assert.deepEqual(captured.body, {
    timeMin: "2026-08-01T09:00:00.000Z",
    timeMax: "2026-08-01T10:00:00.000Z",
    timeZone: "America/New_York",
    items: [{ id: "primary" }]
  });
  assert.equal(result.ok, true);
});

test("FreeBusy classifies safe provider failure categories without retaining provider bodies", () => {
  const expected = new Map([[400, "invalid_request"], [401, "authentication_failed"], [403, "insufficient_permissions"], [500, "provider_unavailable"]]);
  for (const [status, reason] of expected) {
    const { result } = freeBusyResponse(status);
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.equal(result.reason, reason);
  }
});

test("FreeBusy distinguishes a disabled Calendar API from a missing OAuth scope", () => {
  const { result } = freeBusyResponse(403, "accessNotConfigured");
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.reason, "api_not_configured");
});

test("meeting creation targets primary, invites the lead, and requests Google Meet safely", () => {
  const script = `
    const module = await import("./lib/integrations/google/calendar-client.ts");
    const { createGoogleCalendarEvent } = module.default ?? module;
    let captured = null;
    const result = await createGoogleCalendarEvent({
      accessToken: "test-token",
      eventId: "lrabc123",
      attendeeEmail: "lead@example.com",
      startsAt: "2026-08-18T19:00:00.000Z",
      endsAt: "2026-08-18T19:30:00.000Z",
      timeZone: "America/New_York",
      title: "Meeting with Dana Kim",
      description: "Scheduled from SignalThread Lead Retrieval.",
      includeMeet: true,
      conferenceRequestId: "11111111-1111-4111-8111-111111111111",
      fetchImpl: async (url, init) => {
        captured = { url: String(url), method: init.method, body: JSON.parse(String(init.body)) };
        return new Response(JSON.stringify({
          id: "lrabc123",
          hangoutLink: "https://meet.google.com/abc-defg-hij",
          organizer: { email: "ali@signalthread.ai" },
          creator: { email: "ali@signalthread.ai" }
        }), { status: 200 });
      }
    });
    console.log(JSON.stringify({ captured, result }));
  `;
  const run = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], {
    cwd: process.cwd(), encoding: "utf8"
  });
  assert.equal(run.status, 0, run.stderr);
  const { captured, result } = JSON.parse(run.stdout);
  assert.equal(captured.url, "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all");
  assert.equal(captured.method, "POST");
  assert.deepEqual(captured.body.attendees, [{ email: "lead@example.com" }]);
  assert.deepEqual(captured.body.start, { dateTime: "2026-08-18T19:00:00.000Z", timeZone: "America/New_York" });
  assert.deepEqual(captured.body.end, { dateTime: "2026-08-18T19:30:00.000Z", timeZone: "America/New_York" });
  assert.equal(captured.body.description, "Scheduled from SignalThread Lead Retrieval.");
  assert.equal(captured.body.conferenceData.createRequest.requestId, "11111111-1111-4111-8111-111111111111");
  assert.equal(captured.body.conferenceData.createRequest.conferenceSolutionKey.type, "hangoutsMeet");
  assert.deepEqual(result, {
    ok: true,
    eventId: "lrabc123",
    meetUri: "https://meet.google.com/abc-defg-hij",
    identity: { organizerEmail: "ali@signalthread.ai", creatorEmail: "ali@signalthread.ai" }
  });
});

test("meeting creation treats a deterministic provider-ID conflict as an idempotent retry", () => {
  const script = `
    const module = await import("./lib/integrations/google/calendar-client.ts");
    const { createGoogleCalendarEvent } = module.default ?? module;
    const result = await createGoogleCalendarEvent({
      accessToken: "test-token", eventId: "lrabc123", attendeeEmail: "lead@example.com",
      startsAt: "2026-08-18T19:00:00.000Z", endsAt: "2026-08-18T19:30:00.000Z",
      timeZone: "America/New_York", title: "Meeting with Dana Kim", includeMeet: false,
      conferenceRequestId: "11111111-1111-4111-8111-111111111111",
      fetchImpl: async () => new Response(JSON.stringify({ error: { status: "ALREADY_EXISTS" } }), { status: 409 })
    });
    console.log(JSON.stringify(result));
  `;
  const run = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "--input-type=module", "-e", script], {
    cwd: process.cwd(), encoding: "utf8"
  });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), {
    ok: true,
    eventId: "lrabc123",
    meetUri: null,
    identity: { organizerEmail: null, creatorEmail: null }
  });
});
