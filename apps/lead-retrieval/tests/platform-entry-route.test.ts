// @lr area=auth-session severity=P0 layer=api category=local-only
/**
 * GET /platform-entry and GET /platform-entry/start, end to end at the request level.
 *
 * Pins the decision order (shape → navigation → browser-bound state → relayed
 * correlator → claim/map/authorize → session conflict → session on the redirect),
 * that every refusal is cookie-free and sanitized, and that the middleware treats
 * the entry routes as public without loosening anything else.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import test from "node:test";
import type { EntryResult } from "../lib/platform/handoff-entry";
import {
  LAUNCH_STATE_COOKIE,
  createLaunchState,
  launchStateCorrelator,
  serializeLaunchState
} from "../lib/platform/launch-state";
import { EXHIBITOR_APP_ACTIVE_EVENT_COOKIE } from "../lib/exhibitor/exhibitor-app-active-event-constants";
import {
  handlePlatformEntryRequest,
  handlePlatformEntryStartRequest,
  type PlatformEntryDeps
} from "../lib/platform/platform-entry-core";
import { PLATFORM_ENTRY_PATH, PLATFORM_ENTRY_START_PATH, isPlatformEntryPath } from "../lib/platform/paths";

const ORIGIN = "https://lr.signalthread.ai";
const EVENT = "ae9942ba-5759-486b-b591-f1b5ed223370";
const OTHER_EVENT = "7d6a9f0e-2f4c-4b1e-9a3d-1c2b3a4d5e6f";
const NOW = new Date("2026-09-08T10:00:00Z");
const LR_USER = "lr-user-1";

const ALLOWED: EntryResult = {
  ok: true,
  lrUserId: LR_USER,
  role: "exhibitor_admin",
  resolution: "company_assigned_only",
  companyContextId: "co-1",
  eventId: "lr-event-1",
  redirectPath: "/exhibitor/dashboard?eventId=lr-event-1"
};

function entryRequest(input: { handoff?: string | null; eventId?: string | null; state?: string | null; cookie?: string; dest?: string | null }) {
  const url = new URL(`${ORIGIN}${PLATFORM_ENTRY_PATH}`);
  if (input.handoff != null) url.searchParams.set("handoff", input.handoff);
  if (input.eventId != null) url.searchParams.set("event_id", input.eventId);
  if (input.state != null) url.searchParams.set("state", input.state);
  const headers: Record<string, string> = {};
  if (input.cookie) headers.cookie = input.cookie;
  if (input.dest !== null) headers["sec-fetch-dest"] = input.dest ?? "document";
  return new NextRequest(url, { headers });
}

function makeDeps(overrides: Partial<PlatformEntryDeps> = {}) {
  const calls = { resolveEntry: [] as unknown[], establishSession: [] as string[], existing: 0 };
  const deps: PlatformEntryDeps = {
    async resolveEntry(input) {
      calls.resolveEntry.push(input);
      return ALLOWED;
    },
    async readExistingSessionUserId() {
      calls.existing += 1;
      return null;
    },
    async establishSession(lrUserId) {
      calls.establishSession.push(lrUserId);
      return {
        ok: true,
        userId: lrUserId,
        attachCookies: (response: NextResponse) => {
          response.cookies.set({ name: "sb-lr-auth-token", value: `session-for-${lrUserId}`, path: "/", sameSite: "lax", httpOnly: false });
          return response;
        }
      };
    },
    now: () => NOW,
    secureCookies: true,
    ...overrides
  };
  return { deps, calls };
}

function armed() {
  const state = createLaunchState(EVENT, NOW);
  return { state, cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}`, correlator: launchStateCorrelator(state) };
}

function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

async function body(response: Response) {
  return (await response.json()) as { success: boolean; error: string; reason: string; hint: string; platformReason?: string };
}

test("a valid launch (state + matching correlator + allowed entry) establishes the session on a relative 303 into the workspace", async () => {
  const { state, cookie, correlator } = armed();
  const { deps, calls } = makeDeps();
  const response = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state: correlator, cookie }), deps);

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/exhibitor/dashboard?eventId=lr-event-1", "relative Location: the request host is preserved");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(calls.resolveEntry, [{ handoff: "tok", eventId: EVENT }]);
  assert.deepEqual(calls.establishSession, [LR_USER], "the session is opened for the LR user the entry decision produced");

  const cookies = setCookies(response);
  assert.ok(cookies.some((c) => c.startsWith("sb-lr-auth-token=session-for-lr-user-1")), "LR session cookie attached");
  const spent = cookies.find((c) => c.startsWith(`${LAUNCH_STATE_COOKIE}=`));
  assert.ok(spent && /Max-Age=0/i.test(spent) && /Path=\/platform-entry/.test(spent), "launch state is spent with identical scope");
  const active = cookies.find((c) => c.startsWith(`${EXHIBITOR_APP_ACTIVE_EVENT_COOKIE}=lr-event-1`));
  assert.ok(active && /Path=\//.test(active) && /SameSite=lax/i.test(active) && /Secure/.test(active) && !/HttpOnly/i.test(active), "exhibitor active event cookie mirrors the in-app writer");
  assert.equal(state.eventId, EVENT);
});

test("without launch state the browser is sent to start its own launch -- the handoff is not redeemed", async () => {
  const { deps, calls } = makeDeps();
  const response = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT.toUpperCase(), state: "a".repeat(64) }), deps);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${PLATFORM_ENTRY_START_PATH}?event_id=${EVENT}`);
  assert.equal(calls.resolveEntry.length, 0);
  assert.equal(calls.establishSession.length, 0);
  assert.equal(setCookies(response).length, 0);
});

test("expired launch state also restarts rather than redeeming", async () => {
  const { cookie, correlator } = armed();
  const { deps, calls } = makeDeps({ now: () => new Date(NOW.getTime() + 121_000) });
  const response = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state: correlator, cookie }), deps);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${PLATFORM_ENTRY_START_PATH}?event_id=${EVENT}`);
  assert.equal(calls.resolveEntry.length, 0);
});

test("a missing or mismatched relayed correlator is refused, spends the state, and never contacts Platform", async () => {
  const { cookie } = armed();
  const other = armed();
  for (const [label, state] of [
    ["missing", null],
    ["empty", ""],
    ["another browser's correlator", other.correlator],
    ["the nonce itself is not a correlator", "not-hex"]
  ] as const) {
    const { deps, calls } = makeDeps();
    const response = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state, cookie }), deps);
    assert.equal(response.status, 403, label);
    const json = await body(response);
    assert.equal(json.reason, state === null || state === "" ? "LAUNCH_STATE_MISSING" : "LAUNCH_STATE_MISMATCH", label);
    assert.equal(calls.resolveEntry.length, 0, label);
    assert.equal(calls.establishSession.length, 0, label);
    const cookies = setCookies(response);
    assert.equal(cookies.length, 1, `${label}: only the launch state is touched`);
    assert.match(cookies[0], /^lr_platform_launch=;/);
    assert.match(cookies[0], /Max-Age=0/i);
  }
});

test("state created for a different event, or tampered state, is refused before the claim", async () => {
  const otherEvent = createLaunchState(OTHER_EVENT, NOW);
  const { deps, calls } = makeDeps();
  const mismatch = await handlePlatformEntryRequest(
    entryRequest({ handoff: "tok", eventId: EVENT, state: launchStateCorrelator(otherEvent), cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(otherEvent)}` }),
    deps
  );
  assert.equal(mismatch.status, 403);
  assert.equal((await body(mismatch)).reason, "LAUNCH_STATE_MISMATCH");

  const tampered = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state: "a".repeat(64), cookie: `${LAUNCH_STATE_COOKIE}=v1.garbage` }), deps);
  assert.equal(tampered.status, 403);
  assert.equal((await body(tampered)).reason, "LAUNCH_STATE_MISMATCH");
  assert.equal(calls.resolveEntry.length, 0);
});

test("malformed requests and non-navigations are refused before any state is read", async () => {
  const { cookie, correlator } = armed();
  const { deps, calls } = makeDeps();

  for (const input of [
    { handoff: null, eventId: EVENT, state: correlator, cookie },
    { handoff: "", eventId: EVENT, state: correlator, cookie },
    { handoff: "tok", eventId: null, state: correlator, cookie },
    { handoff: "tok", eventId: "not-a-uuid", state: correlator, cookie },
    { handoff: "tok", eventId: "ali@example.com", state: correlator, cookie }
  ]) {
    const response = await handlePlatformEntryRequest(entryRequest(input), deps);
    assert.equal(response.status, 400);
    assert.equal((await body(response)).reason, "INVALID_REQUEST");
    assert.equal(setCookies(response).length, 0);
  }
  for (const dest of ["image", "iframe", "empty"]) {
    const response = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state: correlator, cookie, dest }), deps);
    assert.equal(response.status, 403, dest);
    assert.equal((await body(response)).reason, "NOT_A_NAVIGATION");
    assert.equal(setCookies(response).length, 0, "a non-navigation cannot even spend the state");
  }
  assert.equal(calls.resolveEntry.length, 0);
  assert.equal(calls.establishSession.length, 0);
});

test("every entry refusal is returned as a sanitized JSON denial with its status, no session, state spent", async () => {
  const { cookie, correlator } = armed();
  const denials: Array<[number, string, string | undefined]> = [
    [401, "HANDOFF_INVALID", "HANDOFF_INVALID"],
    [401, "HANDOFF_EXPIRED", "HANDOFF_EXPIRED"],
    [403, "PLATFORM_DENIED", "NOT_ENTITLED"],
    [502, "PLATFORM_UNAVAILABLE", undefined],
    [503, "PLATFORM_NOT_CONFIGURED", undefined],
    [403, "USER_MAPPING_NOT_FOUND", undefined],
    [403, "EVENT_MAPPING_NOT_FOUND", undefined],
    [403, "EVENT_NOT_LAUNCHABLE_CONTAINER", undefined],
    [403, "ORGANIZATION_MAPPING_NOT_FOUND", undefined],
    [403, "AMBIGUOUS_ORGANIZATION_MAPPING", undefined],
    [403, "EVENT_ORGANIZATION_MISMATCH", undefined],
    [403, "LR_ROLE_NOT_LAUNCHABLE", undefined],
    [403, "LR_ACCESS_DENIED", undefined]
  ];
  for (const [status, reason, platformReason] of denials) {
    const { deps, calls } = makeDeps({
      resolveEntry: async () => ({ ok: false, status, reason: reason as never, hint: "hint text", ...(platformReason ? { platformReason } : {}) })
    });
    const response = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state: correlator, cookie }), deps);
    assert.equal(response.status, status, reason);
    const json = await body(response);
    assert.equal(json.success, false);
    assert.equal(json.reason, reason);
    assert.equal(json.hint, "hint text");
    assert.equal(json.platformReason, platformReason);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(calls.establishSession.length, 0, `${reason}: no session for a refused launch`);
    const cookies = setCookies(response);
    assert.equal(cookies.length, 1, `${reason}: only the launch state is spent`);
    assert.match(cookies[0], /^lr_platform_launch=;/);
  }
});

test("an existing LR session for a different user is never replaced: 409 SESSION_CONFLICT, no session minted", async () => {
  const { cookie, correlator } = armed();
  const { deps, calls } = makeDeps({ readExistingSessionUserId: async () => "someone-else" });
  const response = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state: correlator, cookie }), deps);
  assert.equal(response.status, 409);
  assert.equal((await body(response)).reason, "SESSION_CONFLICT");
  assert.equal(calls.establishSession.length, 0);
  assert.equal(setCookies(response).some((c) => c.startsWith("sb-")), false, "the other user's session cookies are untouched");

  // The same user already signed in is fine: the session is simply re-established.
  const same = makeDeps({ readExistingSessionUserId: async () => LR_USER });
  const ok = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state: correlator, cookie }), same.deps);
  assert.equal(ok.status, 303);
  assert.deepEqual(same.calls.establishSession, [LR_USER]);
});

test("a session that cannot be established is a refusal with no cookies other than the spent state", async () => {
  const { cookie, correlator } = armed();
  const { deps } = makeDeps({ establishSession: async () => ({ ok: false, reason: "AUTH_IDENTITY_MISSING" }) });
  const response = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state: correlator, cookie }), deps);
  assert.equal(response.status, 403);
  assert.equal((await body(response)).reason, "AUTH_IDENTITY_MISSING");
  const cookies = setCookies(response);
  assert.equal(cookies.length, 1);
  assert.match(cookies[0], /^lr_platform_launch=;/);
});

test("landing per role: admin, organizer and exhibitor each redirect into their existing workspace", async () => {
  const { cookie, correlator } = armed();
  const cases: Array<[EntryResult["ok"] extends true ? never : never, string, string, boolean]> = [] as never;
  void cases;
  const perRole: Array<[string, string, boolean]> = [
    ["platform_admin", "/admin/events/lr-event-1", false],
    ["organizer_admin", "/app/organizer?eventId=lr-event-1", false],
    ["exhibitor_admin", "/exhibitor/dashboard?eventId=lr-event-1", true],
    ["exhibitor_viewer", "/exhibitor/dashboard?eventId=lr-event-1", true]
  ];
  for (const [role, redirectPath, expectsActiveEventCookie] of perRole) {
    const { deps } = makeDeps({ resolveEntry: async () => ({ ...ALLOWED, role: role as never, redirectPath }) });
    const response = await handlePlatformEntryRequest(entryRequest({ handoff: "tok", eventId: EVENT, state: correlator, cookie }), deps);
    assert.equal(response.status, 303, role);
    assert.equal(response.headers.get("location"), redirectPath, role);
    const hasActive = setCookies(response).some((c) => c.startsWith(`${EXHIBITOR_APP_ACTIVE_EVENT_COOKIE}=`));
    assert.equal(hasActive, expectsActiveEventCookie, `${role}: active-event cookie`);
  }
});

test("/platform-entry/start arms browser state, then sends the browser to Platform with only the correlator", async () => {
  const first = await handlePlatformEntryStartRequest(new NextRequest(`${ORIGIN}${PLATFORM_ENTRY_START_PATH}?event_id=${EVENT.toUpperCase()}`), {
    buildLaunchUrl: () => "unused",
    now: () => NOW
  });
  assert.equal(first.status, 303);
  assert.equal(first.headers.get("location"), `${PLATFORM_ENTRY_START_PATH}?event_id=${EVENT}&armed=1`);
  const written = first.cookies.get(LAUNCH_STATE_COOKIE);
  assert.ok(written);
  assert.equal(written.httpOnly, true);
  assert.equal(written.path, "/platform-entry");

  const state = createLaunchState(EVENT, NOW);
  const seen: string[][] = [];
  const second = await handlePlatformEntryStartRequest(
    new NextRequest(`${ORIGIN}${PLATFORM_ENTRY_START_PATH}?event_id=${EVENT}&armed=1`, { headers: { cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}` } }),
    {
      buildLaunchUrl: (eventId, correlator) => {
        seen.push([eventId, correlator]);
        return `https://platform.signalthread.ai/api/launch/lead-retrieval?event_id=${eventId}&state=${correlator}`;
      },
      now: () => NOW
    }
  );
  assert.equal(second.status, 303);
  assert.equal(second.headers.get("location"), `https://platform.signalthread.ai/api/launch/lead-retrieval?event_id=${EVENT}&state=${launchStateCorrelator(state)}`);
  assert.deepEqual(seen, [[EVENT, launchStateCorrelator(state)]]);
  assert.equal(second.headers.get("location")?.includes(state.nonce), false, "the nonce never leaves the cookie");
  assert.equal(second.cookies.get(LAUNCH_STATE_COOKIE), undefined, "the state stays armed for the return trip");

  // armed=1 without a readable cookie means cookies are blocked: refuse instead of looping.
  const blocked = await handlePlatformEntryStartRequest(new NextRequest(`${ORIGIN}${PLATFORM_ENTRY_START_PATH}?event_id=${EVENT}&armed=1`), {
    buildLaunchUrl: () => "unused",
    now: () => NOW
  });
  assert.equal(blocked.status, 400);
  assert.equal((await body(blocked)).reason, "LAUNCH_STATE_REQUIRED");

  // Not configured: refuse, and never redirect anywhere derived from the request.
  const unconfigured = await handlePlatformEntryStartRequest(
    new NextRequest(`${ORIGIN}${PLATFORM_ENTRY_START_PATH}?event_id=${EVENT}&armed=1&redirect=https://evil.example`, {
      headers: { cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}` }
    }),
    { buildLaunchUrl: () => null, now: () => NOW }
  );
  assert.equal(unconfigured.status, 503);
  assert.equal((await body(unconfigured)).reason, "PLATFORM_NOT_CONFIGURED");

  const bad = await handlePlatformEntryStartRequest(new NextRequest(`${ORIGIN}${PLATFORM_ENTRY_START_PATH}?event_id=nope`), { buildLaunchUrl: () => "unused" });
  assert.equal(bad.status, 400);
  const sub = await handlePlatformEntryStartRequest(new NextRequest(`${ORIGIN}${PLATFORM_ENTRY_START_PATH}?event_id=${EVENT}`, { headers: { "sec-fetch-dest": "iframe" } }), {
    buildLaunchUrl: () => "unused"
  });
  assert.equal(sub.status, 403);
});

test("the route files are thin, run on Node, are never cached, and fail closed on exceptions", () => {
  for (const file of ["app/platform-entry/route.ts", "app/platform-entry/start/route.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /export const runtime = "nodejs"/, file);
    assert.match(source, /export const dynamic = "force-dynamic"/, file);
    assert.match(source, /catch \{[\s\S]*deniedResponse\(500, "INTERNAL_ERROR"/, `${file}: exception boundary`);
    assert.equal(/from\("|createAdminClient|generateLink|verifyOtp/.test(source), false, `${file}: no logic in the route file`);
  }
  assert.match(readFileSync("app/platform-entry/route.ts", "utf8"), /handlePlatformEntryRequest\(request, buildPlatformEntryDeps\(request\)\)/);
});

test("middleware treats exactly the platform-entry routes as public, via the shared path predicate", () => {
  const middleware = readFileSync("lib/supabase/middleware.ts", "utf8");
  assert.match(middleware, /import \{ isPlatformEntryPath \} from "@\/lib\/platform\/paths"/);
  assert.match(middleware, /const isPlatformEntryRoute = isPlatformEntryPath\(pathname\);/);
  assert.match(middleware, /const isPublicRoute = isLoginRoute \|\| isAuthRoute \|\| isPlatformEntryRoute;/);

  assert.equal(isPlatformEntryPath("/platform-entry"), true);
  assert.equal(isPlatformEntryPath("/platform-entry/start"), true);
  assert.equal(isPlatformEntryPath("/platform-entry/"), true);
  assert.equal(isPlatformEntryPath("/platform-entryx"), false, "prefix must be a path segment");
  assert.equal(isPlatformEntryPath("/api/platform-entry"), false);
  assert.equal(isPlatformEntryPath("/exhibitor/dashboard"), false);
  assert.equal(isPlatformEntryPath("/admin"), false);
});

test("no auth cookie ever leaves a denial: deniedResponse writes nothing but the spent launch state", () => {
  const core = readFileSync("lib/platform/platform-entry-core.ts", "utf8");
  const denialBody = core.slice(core.indexOf("export function deniedResponse"), core.indexOf("/** Relative Location only"));
  assert.equal(/attachCookies|applyLandingCookies|setLaunchStateCookie/.test(denialBody), false);
  assert.match(denialBody, /clearLaunchStateCookie\(response\)/);
});
