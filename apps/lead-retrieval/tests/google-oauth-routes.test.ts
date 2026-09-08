import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before, mock } from "node:test";
import { GOOGLE_WORKSPACE_SCOPES, normalizeGrantedGoogleScopes } from "../lib/integrations/google/scopes";
import {
  createGoogleOAuthCallbackDiagnostic,
  emitGoogleOAuthCallbackDiagnostic,
  type GoogleOAuthCallbackDiagnostic
} from "../lib/integrations/google/oauth-callback-diagnostics";

let buildGoogleAuthorizationUrl: typeof import("../lib/integrations/google/oauth-client").buildGoogleAuthorizationUrl;

before(async () => {
  mock.module("server-only", { namedExports: {} });
  ({ buildGoogleAuthorizationUrl } = await import("../lib/integrations/google/oauth-client"));
});

test("Google OAuth requests exactly the approved scope set", () => {
  assert.deepEqual([...GOOGLE_WORKSPACE_SCOPES], [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events.owned",
    "https://www.googleapis.com/auth/calendar.events.freebusy"
  ]);
});

test("initial and reconnect authorization URLs contain the complete canonical scope set", () => {
  const previous = {
    clientId: process.env.GOOGLE_WORKSPACE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_WORKSPACE_REDIRECT_URI
  };
  process.env.GOOGLE_WORKSPACE_CLIENT_ID = "google-client-id.apps.googleusercontent.com";
  process.env.GOOGLE_WORKSPACE_CLIENT_SECRET = "test-client-secret";
  process.env.GOOGLE_WORKSPACE_REDIRECT_URI = "https://lr.signalthread.ai/api/integrations/google/callback";

  try {
    for (const flow of [
      { name: "initial", forceConsent: false, expectedPrompt: "select_account" },
      { name: "reconnect", forceConsent: true, expectedPrompt: "consent select_account" }
    ] as const) {
      const url = buildGoogleAuthorizationUrl({
        state: `${flow.name}-state`,
        codeChallenge: `${flow.name}-challenge`,
        forceConsent: flow.forceConsent
      });
      const parsedScopes = String(url.searchParams.get("scope") ?? "")
        .split(/\s+/)
        .filter(Boolean);

      assert.deepEqual(parsedScopes, [...GOOGLE_WORKSPACE_SCOPES], `${flow.name} scope set drifted`);
      assert.equal(url.searchParams.get("prompt"), flow.expectedPrompt);
      assert.equal(url.searchParams.get("access_type"), "offline");
      assert.equal(url.searchParams.get("include_granted_scopes"), "false");
    }
  } finally {
    for (const [key, value] of Object.entries({
      GOOGLE_WORKSPACE_CLIENT_ID: previous.clientId,
      GOOGLE_WORKSPACE_CLIENT_SECRET: previous.clientSecret,
      GOOGLE_WORKSPACE_REDIRECT_URI: previous.redirectUri
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("web and mobile launches delegate scope construction to the same Google OAuth service", () => {
  const oauthClient = readFileSync("lib/integrations/google/oauth-client.ts", "utf8");
  const scopes = readFileSync("lib/integrations/google/scopes.ts", "utf8");
  const connect = readFileSync("app/api/exhibitor/integrations/google/connect/route.ts", "utf8");
  const mobileLaunch = readFileSync("app/api/mobile/integrations/oauth/launch/route.ts", "utf8");
  const launch = readFileSync("lib/integrations/google/oauth-launch-service.ts", "utf8");
  assert.match(scopes, /https:\/\/www\.googleapis\.com\/auth\/calendar\.events\.freebusy/);
  assert.match(oauthClient, /url\.searchParams\.set\("scope", GOOGLE_WORKSPACE_SCOPES\.join\(" "\)\)/);
  assert.match(oauthClient, /getGoogleOAuthAuthorizationAccessParameters/);
  assert.match(oauthClient, /url\.searchParams\.set\("access_type", access\.accessType\)/);
  assert.match(oauthClient, /url\.searchParams\.set\("prompt", access\.prompt\)/);
  assert.match(connect, /requestUrl\.searchParams\.get\("reconnect"\) === "1"/);
  assert.match(connect, /prepareGoogleOAuthLaunch/);
  assert.match(mobileLaunch, /prepareGoogleLaunch: prepareGoogleOAuthLaunch/);
  assert.match(launch, /assessGoogleOAuthConsentRequirement/);
  assert.match(launch, /forceConsent: consent\.requiresNewRefreshToken/);
});

test("Google canonical userinfo aliases normalize to the requested identity scopes", () => {
  assert.deepEqual(
    normalizeGrantedGoogleScopes(
      "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
    ),
    ["openid", "email", "profile"]
  );
});

test("connect and callback routes enforce admin scope, PKCE, and single-use state", () => {
  const connect = readFileSync("app/api/exhibitor/integrations/google/connect/route.ts", "utf8");
  const launch = readFileSync("lib/integrations/google/oauth-launch-service.ts", "utf8");
  const callback = readFileSync("app/api/integrations/google/callback/route.ts", "utf8");
  const nonce = readFileSync("lib/integrations/google/connection-service.ts", "utf8");
  assert.match(connect, /authorizeGoogleWorkspaceAdmin/);
  assert.match(connect, /prepareGoogleOAuthLaunch/);
  assert.match(launch, /createGooglePkcePair/);
  assert.match(connect, /httpOnly:\s*true/);
  assert.match(connect, /sameSite:\s*"lax"/);
  assert.match(callback, /verifyGoogleOAuthState/);
  assert.match(callback, /authorization\.context\.userId !== payload\.userId/);
  assert.match(callback, /consumeGoogleOAuthNonce/);
  assert.ok(callback.indexOf("consumeGoogleOAuthNonce") < callback.indexOf("exchangeGoogleAuthorizationCode"));
  assert.match(nonce, /\.is\("consumed_at", null\)/);
  assert.match(nonce, /\.eq\("code_verifier_digest"/);
});

test("status route exposes only the safe connection DTO", () => {
  const status = readFileSync("app/api/exhibitor/integrations/google/status/route.ts", "utf8");
  assert.match(status, /getGoogleWorkspaceConnectionStatus/);
  assert.doesNotMatch(status, /access_token|refresh_token|connection_secrets/);
});

test("callback diagnostics identify every failure stage without logging OAuth credentials", () => {
  const callback = readFileSync("app/api/integrations/google/callback/route.ts", "utf8");
  const connection = readFileSync("lib/integrations/google/connection-service.ts", "utf8");
  const diagnostics = readFileSync("lib/integrations/google/oauth-callback-diagnostics.ts", "utf8");

  for (const stage of [
    "state_verification",
    "pkce_cookie_validation",
    "nonce_lookup_and_consumption",
    "google_code_exchange",
    "google_token_response_validation",
    "google_id_token_verification",
    "google_subject_account_binding",
    "connection_persistence",
    "final_mobile_redirect"
  ]) {
    assert.match(`${callback}\n${connection}`, new RegExp(stage));
  }
  assert.match(connection, /stage: "credential_encryption"/);
  assert.match(connection, /stage: "connection_secret_persistence"/);
  assert.match(connection, /safeErrorCategory: missingRefreshToken \? "missing_refresh_token" : "encryption_failed"/);
  assert.doesNotMatch(diagnostics, /process\.env\.NODE_ENV === "production"/);
  assert.match(callback, /stage = "connection_persistence"/);
  assert.doesNotMatch(diagnostics, /console\.(?:info|warn|error)\([^\n]*(?:authorization code|access token|refresh token|ID token|client secret|PKCE verifier|raw OAuth state|cookie|authorization header)/i);
});

test("structured callback failure diagnostics retain safe provider fields and redact OAuth secrets", () => {
  const authorizationCode = "authorization_code_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const accessToken = "access_token_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const diagnostic = createGoogleOAuthCallbackDiagnostic({
    stage: "google_code_exchange",
    safeErrorCategory: "provider_rejected",
    providerHttpStatus: 400,
    providerCode: "invalid_grant",
    message: `code=${authorizationCode}&access_token=${accessToken} Bearer ${accessToken}`,
    progress: {
      state_validation_succeeded: true,
      nonce_validation_succeeded: true,
      pkce_validation_succeeded: true,
      token_exchange_succeeded: false
    }
  });

  assert.deepEqual(diagnostic, {
    stage: "google_code_exchange",
    safe_error_category: "provider_rejected",
    provider_http_status: 400,
    provider_code: "invalid_grant",
    sanitized_message: "code=[redacted]&access_token=[redacted] Bearer [redacted]",
    state_validation_succeeded: true,
    nonce_validation_succeeded: true,
    pkce_validation_succeeded: true,
    token_exchange_succeeded: false,
    token_response_validation_succeeded: null,
    subject_account_binding_succeeded: null,
    encryption_succeeded: null,
    persistence_succeeded: null
  });
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(authorizationCode));
  assert.doesNotMatch(JSON.stringify(diagnostic), new RegExp(accessToken));
});

test("callback diagnostic emitter reports deterministic encryption and persistence state", () => {
  const events: Array<{ level: string; diagnostic: GoogleOAuthCallbackDiagnostic }> = [];
  emitGoogleOAuthCallbackDiagnostic({
    level: "error",
    stage: "credential_refresh_resolution",
    safeErrorCategory: "missing_refresh_token",
    message: "Google did not issue an offline refresh token.",
    progress: {
      state_validation_succeeded: true,
      nonce_validation_succeeded: true,
      pkce_validation_succeeded: true,
      token_exchange_succeeded: true,
      token_response_validation_succeeded: true,
      subject_account_binding_succeeded: true,
      encryption_succeeded: false,
      persistence_succeeded: false
    },
    logger: (level, diagnostic) => events.push({ level, diagnostic })
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.level, "error");
  assert.deepEqual(events[0]?.diagnostic, {
    stage: "credential_refresh_resolution",
    safe_error_category: "missing_refresh_token",
    provider_http_status: null,
    provider_code: null,
    sanitized_message: "Google did not issue an offline refresh token.",
    state_validation_succeeded: true,
    nonce_validation_succeeded: true,
    pkce_validation_succeeded: true,
    token_exchange_succeeded: true,
    token_response_validation_succeeded: true,
    subject_account_binding_succeeded: true,
    encryption_succeeded: false,
    persistence_succeeded: false
  });
});

test("callback persists only Google's returned grant and flags missing FreeBusy permission", () => {
  const callback = readFileSync("app/api/integrations/google/callback/route.ts", "utf8");
  const connectionService = readFileSync("lib/integrations/google/connection-service.ts", "utf8");
  assert.match(callback, /normalizeGrantedGoogleScopes\(tokenResult\.payload\.scope \?\? ""\)/);
  assert.match(callback, /scopeResponsePresent/);
  assert.match(callback, /calendarFreeBusyGranted/);
  assert.match(callback, /capabilities\.calendarFreeBusy \? "connected" : "permission_required"/);
  assert.doesNotMatch(callback, /\[\.\.\.GOOGLE_WORKSPACE_SCOPES\]/);
  assert.match(connectionService, /scope field is used solely as the authoritative capability grant/);
  assert.doesNotMatch(connectionService, /hasRequiredGoogleIdentityScopes/);
});
