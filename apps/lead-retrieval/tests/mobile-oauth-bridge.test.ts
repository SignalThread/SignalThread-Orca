import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  MOBILE_OAUTH_INTERNAL_RETURN_PATH,
  buildMobileOAuthReturnUrl,
  createMobileOAuthLaunchSecrets,
  digestMobileOAuthTicket,
  getApprovedMobileOAuthReturnUri,
  toSafeMobileOAuthResult
} from "../lib/integrations/mobile-oauth/bridge-core";
import {
  buildMobileOAuthLaunchUrl,
  buildMobileOAuthStartPayload,
  resolveMobileOAuthBrowserLaunch,
  type MobileOAuthLaunchTicketBinding
} from "../lib/integrations/mobile-oauth/launch-route-core";
import {
  GOOGLE_OAUTH_CALLBACK_PATH,
  MOBILE_OAUTH_BROWSER_LAUNCH_PATH,
  isOAuthBrowserHandoffRequest
} from "../lib/integrations/mobile-oauth/middleware-policy";
import {
  createGoogleOAuthState,
  verifyGoogleOAuthState
} from "../lib/integrations/google/oauth-state";
import { buildGoogleOAuthResultUrlForState } from "../lib/integrations/google/redirect";
import {
  toMobileEligibleEmailSender,
  toMobileGoogleWorkspaceConnection
} from "../lib/integrations/mobile-oauth/status-core";
import {
  logMobileOAuthLaunchPostgrestError,
  type MobileOAuthLaunchDiagnostic
} from "../lib/integrations/mobile-oauth/launch-diagnostics";

const root = process.cwd();
const SECRET = "deterministic-test-secret-with-32-plus-bytes";
const NOW = new Date("2026-08-03T12:00:00.000Z");
const TICKET = "ticket_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const CORRELATION = "opaque_correlation_12345";

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

test("mobile OAuth return is fixed, provider-neutral, and contains only a safe result", () => {
  const url = buildMobileOAuthReturnUrl({
    provider: "google_workspace",
    result: "connection_failed: access_token=secret",
    correlation: "opaque_correlation_12345",
    configuredReturnUri: "leadintelscan://oauth/callback"
  });
  assert.equal(url.origin, "null");
  assert.equal(url.protocol, "leadintelscan:");
  assert.equal(url.hostname, "oauth");
  assert.equal(url.pathname, "/callback");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["correlation", "provider", "result"]);
  assert.equal(url.searchParams.get("provider"), "google_workspace");
  assert.equal(url.searchParams.get("result"), "failed");
  assert.equal(url.searchParams.get("correlation"), "opaque_correlation_12345");
  assert.doesNotMatch(url.toString(), /access_token|secret/);
  assert.equal(toSafeMobileOAuthResult("access_denied"), "cancelled");
  assert.equal(toSafeMobileOAuthResult("permission_required"), "permission_required");
});

test("mobile OAuth return target cannot be changed to a web or arbitrary app redirect", () => {
  for (const candidate of [
    "https://attacker.example/callback",
    "leadintelscan://attacker/callback",
    "leadintelscan://oauth/other",
    "javascript:alert(1)"
  ]) {
    assert.throws(() => getApprovedMobileOAuthReturnUri(candidate), /MOBILE_OAUTH_RETURN_URI/);
  }
});

test("mobile Google state binds the user, company, fixed return path, and opaque correlation", () => {
  const created = createGoogleOAuthState({
    userId: "user-1",
    companyId: "company-1",
    channel: "mobile",
    correlation: "opaque_correlation_12345",
    returnTo: "https://attacker.example/callback",
    now: NOW,
    secret: SECRET
  });
  const verified = verifyGoogleOAuthState(created.state, { now: NOW, secret: SECRET });
  assert.equal(verified.channel, "mobile");
  assert.equal(verified.returnTo, MOBILE_OAUTH_INTERNAL_RETURN_PATH);
  assert.equal(verified.correlation, "opaque_correlation_12345");
  assert.throws(
    () =>
      createGoogleOAuthState({
        userId: "user-1",
        companyId: "company-1",
        channel: "mobile",
        correlation: "bad",
        now: NOW,
        secret: SECRET
      }),
    /opaque correlation/i
  );
});

test("launch tickets and correlations are opaque and stored only by digest", () => {
  const one = createMobileOAuthLaunchSecrets();
  const two = createMobileOAuthLaunchSecrets();
  assert.match(one.ticket, /^[A-Za-z0-9_-]{32,128}$/);
  assert.match(one.correlation, /^[A-Za-z0-9_-]{16,128}$/);
  assert.notEqual(one.ticket, two.ticket);
  assert.notEqual(digestMobileOAuthTicket(one.ticket), one.ticket);

  const migration = read("supabase/migrations/0095_mobile_oauth_launch_tickets.sql");
  assert.match(migration, /ticket_digest text PRIMARY KEY/);
  assert.doesNotMatch(migration, /access_token|refresh_token|code_verifier/);
});

test("authenticated mobile start contract returns 201 data with the exact ticket launch URL", () => {
  const authorizationUrl = buildMobileOAuthLaunchUrl({
    request: { url: "https://lr.signalthread.ai/api/mobile/integrations/connections/google_workspace/oauth" },
    ticket: TICKET
  });
  const payload = buildMobileOAuthStartPayload({ authorizationUrl, correlation: CORRELATION });
  const parsed = new URL(payload.authorizationUrl);

  assert.deepEqual(payload, {
    provider: "google_workspace",
    authorizationUrl: `https://lr.signalthread.ai${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}?ticket=${TICKET}`,
    correlation: CORRELATION
  });
  assert.deepEqual([...parsed.searchParams.keys()], ["ticket"]);
  assert.equal(parsed.searchParams.get("ticket"), TICKET);
  assert.doesNotMatch(payload.authorizationUrl, /authorization|bearer|access_token/i);

  const startRoute = read("app/api/mobile/integrations/connections/[provider]/oauth/route.ts");
  assert.match(startRoute, /buildMobileOAuthStartPayload\(launch\)/);
  assert.match(startRoute, /status:\s*201/);
});

test("cookie-less browser launch consumes one ticket and preserves its complete binding", async () => {
  const binding: MobileOAuthLaunchTicketBinding = {
    provider: "google_workspace",
    user_id: USER_ID,
    company_id: COMPANY_ID,
    correlation: CORRELATION,
    force_reconnect: true
  };
  let available = true;
  let consumed = 0;
  let preparedInput: Record<string, unknown> | null = null;
  const request = new Request(
    `https://lr.signalthread.ai${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}?ticket=${TICKET}`
  );
  assert.equal(request.headers.has("cookie"), false);
  assert.equal(request.headers.has("authorization"), false);

  const deps = {
    consumeTicket: async (ticket: string) => {
      assert.equal(ticket, TICKET);
      consumed += 1;
      if (!available) return null;
      available = false;
      return binding;
    },
    prepareGoogleLaunch: async (input: Record<string, unknown>) => {
      preparedInput = input;
      return {
        authorizationUrl: new URL("https://accounts.google.com/o/oauth2/v2/auth?state=signed"),
        codeVerifier: "pkce-verifier",
        maxAge: 600
      };
    }
  };

  const first = await resolveMobileOAuthBrowserLaunch(request, deps);
  assert.equal(first.ok, true);
  assert.deepEqual(preparedInput, {
    userId: USER_ID,
    companyId: COMPANY_ID,
    channel: "mobile",
    correlation: CORRELATION,
    returnTo: MOBILE_OAUTH_INTERNAL_RETURN_PATH,
    forceConsent: true
  });
  if (first.ok) {
    assert.equal(first.authorizationUrl.origin, "https://accounts.google.com");
    assert.equal(first.authorizationUrl.searchParams.get("state"), "signed");
  }

  const second = await resolveMobileOAuthBrowserLaunch(request, deps);
  assert.deepEqual(second, {
    ok: false,
    status: 400,
    error: "This authorization link is invalid or has expired."
  });
  assert.equal(consumed, 2);
});

test("missing, malformed, expired, consumed, and mismatched launch tickets fail safely", async () => {
  let consumeCalls = 0;
  const neverPrepare = async () => {
    assert.fail("invalid tickets must not prepare a Google OAuth launch");
  };
  const nullDeps = {
    consumeTicket: async () => {
      consumeCalls += 1;
      return null;
    },
    prepareGoogleLaunch: neverPrepare
  };

  for (const url of [
    `https://lr.signalthread.ai${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}`,
    `https://lr.signalthread.ai${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}?ticket=bad`
  ]) {
    const result = await resolveMobileOAuthBrowserLaunch({ url }, nullDeps);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 400);
  }
  assert.equal(consumeCalls, 0);

  for (const unavailableState of ["expired", "consumed"]) {
    const result = await resolveMobileOAuthBrowserLaunch(
      { url: `https://lr.signalthread.ai${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}?ticket=${TICKET}` },
      nullDeps
    );
    assert.equal(result.ok, false, unavailableState);
    assert.equal(!result.ok && result.status, 400, unavailableState);
  }

  for (const mismatched of [
    { provider: "outlook" },
    { user_id: "another-user" },
    { company_id: "another-company" },
    { correlation: "wrong" }
  ]) {
    const binding = {
      provider: "google_workspace",
      user_id: USER_ID,
      company_id: COMPANY_ID,
      correlation: CORRELATION,
      force_reconnect: false,
      ...mismatched
    } as MobileOAuthLaunchTicketBinding;
    const result = await resolveMobileOAuthBrowserLaunch(
      { url: `https://lr.signalthread.ai${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}?ticket=${TICKET}` },
      { consumeTicket: async () => binding, prepareGoogleLaunch: neverPrepare }
    );
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.status, 400);
  }
});

test("launch consumption logs safe structured PostgREST diagnostics without secrets", () => {
  const events: Array<{ level: string; diagnostic: MobileOAuthLaunchDiagnostic }> = [];
  const rawTicket = "ticket_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rawBearer = "Bearer abcdefghijklmnopqrstuvwxyz0123456789.SECRET";
  logMobileOAuthLaunchPostgrestError({
    stage: "ticket_atomic_consumption",
    error: {
      code: "42501",
      message: `permission denied while consuming ticket=${rawTicket} using ${rawBearer}`,
      status: 403
    },
    ticketRowMatched: false,
    atomicConsumptionSucceeded: false,
    bindingValidationSucceeded: null,
    logger: (level, diagnostic) => events.push({ level, diagnostic })
  });

  assert.deepEqual(events, [
    {
      level: "error",
      diagnostic: {
        stage: "ticket_atomic_consumption",
        safe_error_category: "postgrest_error",
        supabase_code: "42501",
        sanitized_message: "permission denied while consuming ticket=[redacted] using Bearer [redacted]",
        http_status: 403,
        ticket_row_matched: false,
        atomic_consumption_succeeded: false,
        binding_validation_succeeded: null
      }
    }
  ]);
  assert.doesNotMatch(JSON.stringify(events), new RegExp(rawTicket));
  assert.doesNotMatch(JSON.stringify(events), /abcdefghijklmnopqrstuvwxyz0123456789\.SECRET/);
});

test("launch route diagnostics identify consumption exceptions and Google preparation failures", async () => {
  const request = {
    url: `https://lr.signalthread.ai${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}?ticket=${TICKET}`
  };
  const consumeEvents: MobileOAuthLaunchDiagnostic[] = [];
  await assert.rejects(
    resolveMobileOAuthBrowserLaunch(request, {
      consumeTicket: async () => {
        throw Object.assign(new Error("fetch failed for ticket=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"), {
          code: "ECONNRESET",
          status: 503
        });
      },
      prepareGoogleLaunch: async () => assert.fail("Google launch must not run"),
      logger: (_level, diagnostic) => consumeEvents.push(diagnostic)
    }),
    /fetch failed/
  );
  assert.deepEqual(consumeEvents, [
    {
      stage: "ticket_consumption_dependency",
      safe_error_category: "network_error",
      supabase_code: "ECONNRESET",
      sanitized_message: "fetch failed for ticket=[redacted]",
      http_status: 503,
      ticket_row_matched: null,
      atomic_consumption_succeeded: false,
      binding_validation_succeeded: null
    }
  ]);

  const prepareEvents: MobileOAuthLaunchDiagnostic[] = [];
  const result = await resolveMobileOAuthBrowserLaunch(request, {
    consumeTicket: async () => ({
      provider: "google_workspace",
      user_id: USER_ID,
      company_id: COMPANY_ID,
      correlation: CORRELATION,
      force_reconnect: false
    }),
    prepareGoogleLaunch: async () => {
      throw Object.assign(new Error("Unable to persist OAuth state."), {
        code: "PGRST205",
        status: 500
      });
    },
    logger: (_level, diagnostic) => prepareEvents.push(diagnostic)
  });
  assert.deepEqual(result, {
    ok: false,
    status: 500,
    error: "Unable to start mobile authorization."
  });
  assert.equal(prepareEvents.length, 2);
  assert.deepEqual(prepareEvents[0], {
    stage: "ticket_binding_validation",
    safe_error_category: "none",
    supabase_code: null,
    sanitized_message: null,
    http_status: null,
    ticket_row_matched: true,
    atomic_consumption_succeeded: true,
    binding_validation_succeeded: true
  });
  assert.deepEqual(prepareEvents[1], {
    stage: "google_launch_preparation",
    safe_error_category: "google_launch_failed",
    supabase_code: "PGRST205",
    sanitized_message: "Unable to persist OAuth state.",
    http_status: 500,
    ticket_row_matched: true,
    atomic_consumption_succeeded: true,
    binding_validation_succeeded: true
  });

  const ticketService = read("lib/integrations/mobile-oauth/launch-ticket-service.ts");
  const googleLaunchService = read("lib/integrations/google/oauth-launch-service.ts");
  assert.match(ticketService, /logMobileOAuthLaunchPostgrestError\(\{[\s\S]*stage: "ticket_atomic_consumption"/);
  assert.match(googleLaunchService, /stage: "google_state_nonce_persistence"/);
});

test("middleware bypass is GET-only and exact for cryptographically guarded OAuth handoffs", () => {
  assert.equal(
    isOAuthBrowserHandoffRequest({ pathname: MOBILE_OAUTH_BROWSER_LAUNCH_PATH, method: "GET" }),
    true
  );
  assert.equal(
    isOAuthBrowserHandoffRequest({ pathname: GOOGLE_OAUTH_CALLBACK_PATH, method: "GET" }),
    true
  );
  for (const input of [
    { pathname: MOBILE_OAUTH_BROWSER_LAUNCH_PATH, method: "POST" },
    { pathname: `${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}/anything`, method: "GET" },
    { pathname: "/api/mobile/integrations/connections", method: "GET" }
  ]) {
    assert.equal(isOAuthBrowserHandoffRequest(input), false);
  }

  const middleware = read("lib/supabase/middleware.ts");
  assert.match(middleware, /isOAuthBrowserHandoffRequest\(\{ pathname, method: request\.method \}\)/);
  assert.ok(
    middleware.indexOf("isOAuthBrowserHandoffRequest({ pathname, method: request.method })") <
      middleware.indexOf("const supabase = createServerClient")
  );
  const topLevelMiddleware = read("middleware.ts");
  assert.doesNotMatch(topLevelMiddleware, /DEV BYPASS HEADER/);
});

test("launch ticket and Google callback consumption are atomic and single-use", () => {
  const launchService = read("lib/integrations/mobile-oauth/launch-ticket-service.ts");
  const googleConnection = read("lib/integrations/google/connection-service.ts");
  const callback = read("app/api/integrations/google/callback/route.ts");
  assert.match(launchService, /\.is\("consumed_at", null\)/);
  assert.match(launchService, /\.gt\("expires_at", consumedAt\)/);
  assert.match(googleConnection, /\.is\("consumed_at", null\)/);
  assert.ok(callback.indexOf("consumeGoogleOAuthNonce") < callback.indexOf("exchangeGoogleAuthorizationCode"));
});

test("mobile launch/status routes require bearer auth and preserve user/company authorization", () => {
  const start = read("app/api/mobile/integrations/connections/[provider]/oauth/route.ts");
  const status = read("app/api/mobile/integrations/connections/route.ts");
  const disconnect = read("app/api/mobile/integrations/connections/[provider]/route.ts");
  const authorization = read("lib/integrations/mobile-oauth/authorization.ts");
  const authorizationCore = read("lib/integrations/mobile-oauth/authorization-core.ts");
  for (const source of [start, status, disconnect]) {
    assert.match(source, /authorizeMobileIntegrationRequest\(request\)/);
    assert.doesNotMatch(source, /isExhibitorAdminRole/);
  }
  assert.match(authorizationCore, /\^Bearer\\s\+\\S\+/);
  assert.match(authorization, /resolveApiSession\(candidate\)/);
  assert.match(authorization, /resolveAccessibleEventIdsForUser/);
  assert.match(authorizationCore, /isExhibitorScopedRole\(session\.role\)/);
  assert.match(authorizationCore, /accessCompanyId !== sessionCompanyId/);
  assert.match(authorizationCore, /access\.eventIds\.length === 0/);
  assert.match(start, /isMobileOAuthProvider/);
  assert.match(start, /issueMobileOAuthLaunchTicket/);
  assert.match(disconnect, /disconnectGoogleWorkspaceConnection/);
  assert.match(disconnect, /state = "disconnected"/);
  assert.match(disconnect, /disconnected: result\.disconnected/);
  assert.match(disconnect, /revocationPending: result\.revocationPending/);
  assert.match(disconnect, /authorization\.status === 401 \? "authentication" : "authorization"/);
  assert.match(disconnect, /category:\s*"unsupported_provider"/);
  assert.match(disconnect, /category:\s*"server_error"/);
  assert.doesNotMatch(disconnect, /console\.(?:info|warn|error)\([^\n]*(?:authorization|refreshToken|accessToken)/i);
  assert.match(disconnect, /Cache-Control/);
});

test("mobile status DTO is narrow and never exposes scopes, tokens, or provider errors", () => {
  const dto = toMobileGoogleWorkspaceConnection({
    connected: true,
    status: "connected",
    identity: { email: "person@example.com", displayName: "Person" },
    grantedScopes: ["secret-scope"],
    capabilities: { gmailSend: true, calendarEventsOwned: true, calendarFreeBusy: false },
    isPartialGrant: true,
    expiresAt: "2026-08-03T13:00:00.000Z",
    connectedAt: "2026-08-03T12:00:00.000Z",
    lastRefreshAt: null,
    lastErrorCode: "provider_detail"
  });
  assert.deepEqual(dto, {
    provider: "google_workspace",
    displayName: "Google Workspace",
    state: "permission_required",
    account: { email: "person@example.com" },
    capabilities: { email: true, calendar: false }
  });
  assert.doesNotMatch(JSON.stringify(dto), /scope|token|expires|provider_detail|Person/);
});

test("mobile eligible sender DTO contains only the safe sender choice fields", () => {
  const dto = toMobileEligibleEmailSender({
    provider: "microsoft_365",
    accountEmail: "person@example.com",
    isDefault: true
  });
  assert.deepEqual(dto, {
    provider: "microsoft_365",
    accountEmail: "person@example.com",
    isDefault: true
  });
  assert.deepEqual(Object.keys(dto).sort(), ["accountEmail", "isDefault", "provider"]);
});

test("mobile callback uses fixed safe deep-link redirect and does not require a browser session", () => {
  const callback = read("app/api/integrations/google/callback/route.ts");
  const redirect = read("lib/integrations/google/redirect.ts");
  const launch = read("app/api/mobile/integrations/oauth/launch/route.ts");
  assert.match(callback, /if \(payload\.channel !== "mobile"\)/);
  assert.match(redirect, /buildMobileOAuthReturnUrl/);
  assert.match(launch, /httpOnly:\s*true/);
  assert.match(launch, /sameSite:\s*"lax"/);
  assert.match(launch, /Referrer-Policy/);
  assert.doesNotMatch(redirect, /access_token|refresh_token|code_verifier/);
});

test("mobile Google callback returns only provider, safe result, and opaque correlation to Expo", () => {
  const resultUrl = buildGoogleOAuthResultUrlForState(
    { url: "https://lr.signalthread.ai/api/integrations/google/callback" },
    {
      v: 1,
      jti: "opaque-jti",
      userId: USER_ID,
      companyId: COMPANY_ID,
      returnTo: MOBILE_OAUTH_INTERNAL_RETURN_PATH,
      channel: "mobile",
      correlation: CORRELATION,
      iat: 1,
      exp: 2
    },
    "connection_failed: refresh_token=secret"
  );

  assert.equal(resultUrl.toString(), `leadintelscan://oauth/callback?provider=google_workspace&result=failed&correlation=${CORRELATION}`);
  assert.deepEqual([...resultUrl.searchParams.keys()].sort(), ["correlation", "provider", "result"]);
  assert.doesNotMatch(resultUrl.toString(), /refresh_token|secret/);
});
