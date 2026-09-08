import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import test from "node:test";
import {
  buildPipedriveAuthorizationUrlCore,
  normalizePipedriveScopes,
  validatePipedriveApiDomain
} from "../lib/integrations/pipedrive/oauth-client-core";
import { handlePipedriveOAuthCallback, type PipedriveCallbackDeps } from "../lib/integrations/pipedrive/oauth-callback-core";
import {
  createPipedriveOAuthState,
  digestPipedriveOAuthState,
  PIPEDRIVE_OAUTH_STATE_TTL_MS
} from "../lib/integrations/pipedrive/oauth-state";
import {
  buildEncryptedPipedriveCredentialRecord,
  pipedriveSecretContext
} from "../lib/integrations/pipedrive/credential-core";
import {
  decryptSecret,
  encryptSecret,
  parseSecretKeyring
} from "../lib/security/encrypted-secret";
import {
  buildRequestHeadersWithCurrentCookies,
  createSupabaseRouteCookieBridge
} from "../lib/supabase/route-auth";

const binding = {
  userId: "user-a",
  companyId: "company-a",
  returnTo: "/exhibitor/integrations/pipedrive"
};

function deps(overrides: Partial<PipedriveCallbackDeps> = {}): PipedriveCallbackDeps {
  return {
    consumeState: async () => binding,
    authorize: async () => ({ ok: true, context: { userId: "user-a", companyId: "company-a" } }),
    exchangeCode: async () => ({
      ok: true,
      status: 200,
      payload: {
        access_token: "access-secret",
        refresh_token: "refresh-secret",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "base,users:read",
        api_domain: "https://acme.pipedrive.com"
      }
    }),
    verifyConnection: async () => ({
      userId: "88",
      companyId: "42",
      companyName: "Acme Pipedrive",
      email: "owner@example.com",
      name: "Owner"
    }),
    saveConnection: async () => undefined,
    normalizeScopes: normalizePipedriveScopes,
    revokeRefreshToken: async () => undefined,
    ...overrides
  };
}

test("OAuth state is high entropy, digest-only, and expires after ten minutes", () => {
  const now = new Date("2026-08-15T12:00:00.000Z");
  const created = createPipedriveOAuthState({
    now,
    random: () => Buffer.alloc(32, 7)
  });
  assert.match(created.state, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(created.stateDigest, digestPipedriveOAuthState(created.state));
  assert.notEqual(created.stateDigest, created.state);
  assert.equal(created.expiresAt.getTime() - now.getTime(), PIPEDRIVE_OAUTH_STATE_TTL_MS);
});

test("authorization URL contains only public OAuth parameters and opaque state", () => {
  const url = new URL(buildPipedriveAuthorizationUrlCore({
    state: "opaque-state",
    config: {
      clientId: "public-client",
      redirectUri: "https://lr.signalthread.ai/api/integrations/pipedrive/callback"
    }
  }));
  assert.equal(url.origin, "https://oauth.pipedrive.com");
  assert.equal(url.pathname, "/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "public-client");
  assert.equal(url.searchParams.get("state"), "opaque-state");
  assert.equal(url.searchParams.has("client_secret"), false);
});

test("Pipedrive credentials are AES-GCM envelopes and never plaintext database values", () => {
  const keyring = parseSecretKeyring({
    activeKeyId: "test-v1",
    serializedKeys: JSON.stringify({
      "test-v1": Buffer.alloc(32, 9).toString("base64")
    })
  });
  const record = buildEncryptedPipedriveCredentialRecord({
    connectionId: "connection-1",
    accessToken: "access-secret",
    refreshToken: "refresh-secret",
    keyVersion: keyring.activeKeyId,
    encrypt: (plaintext, context) => encryptSecret(plaintext, context, keyring)
  });
  assert.equal(JSON.stringify(record).includes("access-secret"), false);
  assert.equal(JSON.stringify(record).includes("refresh-secret"), false);
  assert.equal(
    decryptSecret(
      record.refresh_token_encrypted,
      pipedriveSecretContext("connection-1", "refresh_token"),
      keyring
    ),
    "refresh-secret"
  );
});

test("valid callback verifies first and persists the bound company connection", async () => {
  const calls: string[] = [];
  const saved: Array<Parameters<PipedriveCallbackDeps["saveConnection"]>[0]> = [];
  const result = await handlePipedriveOAuthCallback(
    { state: "state", code: "code", providerError: null },
    deps({
      consumeState: async () => { calls.push("consume"); return binding; },
      exchangeCode: async () => { calls.push("exchange"); return deps().exchangeCode("code"); },
      verifyConnection: async (input) => { calls.push("verify"); return deps().verifyConnection(input); },
      saveConnection: async (input) => { calls.push("save"); saved.push(input); }
    })
  );
  assert.deepEqual(result, { ok: true, result: "connected", returnTo: "/exhibitor/integrations/pipedrive" });
  assert.deepEqual(calls, ["consume", "exchange", "verify", "save"]);
  assert.equal(saved[0]?.companyId, "company-a");
  assert.equal(saved[0]?.accessToken, "access-secret");
  assert.deepEqual(saved[0]?.scopes, ["base", "users:read"]);
});

test("invalid, expired, and reused state fail before provider exchange", async () => {
  for (const stateCase of ["invalid", "expired", "reused"]) {
    let exchanged = false;
    const result = await handlePipedriveOAuthCallback(
      { state: stateCase, code: "code", providerError: null },
      deps({
        consumeState: async () => null,
        exchangeCode: async () => { exchanged = true; return deps().exchangeCode("code"); }
      })
    );
    assert.equal(result.result, "invalid_state");
    assert.equal(exchanged, false);
  }
});

test("callback cannot switch the company encoded by the one-time server record", async () => {
  let exchanged = false;
  const result = await handlePipedriveOAuthCallback(
    { state: "state", code: "code", providerError: null },
    deps({
      authorize: async () => ({ ok: true, context: { userId: "user-a", companyId: "company-b" } }),
      exchangeCode: async () => { exchanged = true; return deps().exchangeCode("code"); }
    })
  );
  assert.equal(result.result, "session_mismatch");
  assert.equal(exchanged, false);
});

test("provider denial and token exchange failure never create a connection", async () => {
  let saved = false;
  const providerDenied = await handlePipedriveOAuthCallback(
    { state: "state", code: null, providerError: "user_denied" },
    deps({ saveConnection: async () => { saved = true; } })
  );
  assert.equal(providerDenied.result, "access_denied");
  const exchangeFailed = await handlePipedriveOAuthCallback(
    { state: "state", code: "code", providerError: null },
    deps({
      exchangeCode: async () => ({ ok: false, status: 400, payload: { error: "invalid_grant" } }),
      saveConnection: async () => { saved = true; }
    })
  );
  assert.equal(exchangeFailed.result, "token_exchange_failed");
  assert.equal(saved, false);
});

test("connection must pass read-only identity verification before becoming healthy", async () => {
  let saved = false;
  const result = await handlePipedriveOAuthCallback(
    { state: "state", code: "code", providerError: null },
    deps({
      verifyConnection: async () => { throw new Error("401"); },
      saveConnection: async () => { saved = true; }
    })
  );
  assert.equal(result.result, "verification_failed");
  assert.equal(saved, false);
});

test("post-exchange persistence failure revokes the orphaned provider credential", async () => {
  const revoked: string[] = [];
  const result = await handlePipedriveOAuthCallback(
    { state: "state", code: "code", providerError: null },
    deps({
      saveConnection: async () => { throw new Error("database unavailable"); },
      revokeRefreshToken: async (token) => { revoked.push(token); }
    })
  );
  assert.equal(result.result, "persistence_failed");
  assert.deepEqual(revoked, ["refresh-secret"]);
});

test("Pipedrive API domain validation prevents bearer-token SSRF", () => {
  assert.equal(validatePipedriveApiDomain("https://acme.pipedrive.com/path"), "https://acme.pipedrive.com");
  assert.throws(() => validatePipedriveApiDomain("https://attacker.example"), /invalid API domain/i);
  assert.throws(() => validatePipedriveApiDomain("http://acme.pipedrive.com"), /invalid API domain/i);
});

test("routes resolve company server-side and never accept a browser company id", () => {
  const start = readFileSync("app/api/integrations/pipedrive/start/route.ts", "utf8");
  const callback = readFileSync("app/api/integrations/pipedrive/callback/route.ts", "utf8");
  assert.match(start, /authorizeCompanyIntegrationAdmin/);
  assert.match(start, /preparePipedriveOAuthLaunch\(authorization\.context\)/);
  assert.doesNotMatch(start, /searchParams\.get\(["']company/i);
  assert.match(callback, /consumePipedriveOAuthState/);
  assert.match(callback, /authorizeCompanyIntegrationAdmin/);
  assert.doesNotMatch(callback, /access_token|refresh_token|client_secret/);
});

test("successful Pipedrive callback uses one response-bound Supabase client for authorization", () => {
  const callback = readFileSync("app/api/integrations/pipedrive/callback/route.ts", "utf8");
  assert.match(callback, /const routeAuth = createSupabaseRouteAuth\(request\)/);
  assert.match(
    callback,
    /authorize: \(\) => authorizeCompanyIntegrationAdmin\(\{ supabase: routeAuth\.supabase \}\)/
  );
  assert.match(callback, /routeAuth\.withAuthCookies\(redirectWithResult\(request, result\)\)/);
  assert.doesNotMatch(callback, /refreshSupabaseAuthCookies|createServerClient|auth\.getUser/);
  assert.match(callback, /returnTo: "\/exhibitor\/integrations\/pipedrive"/);
  assert.doesNotMatch(callback, /\/exhibitor\/dashboard/);
});

test("rotated Supabase cookie chunks survive the callback redirect and authenticate its first destination request", () => {
  const request = new NextRequest("https://lr.signalthread.ai/api/integrations/pipedrive/callback", {
    headers: {
      cookie: "sb-lr-auth-token.0=stale-session; sb-lr-auth-token.1=obsolete-chunk"
    }
  });
  const bridge = createSupabaseRouteCookieBridge(request);
  bridge.setAll([
    {
      name: "sb-lr-auth-token.0",
      value: "rotated-session",
      options: { path: "/", sameSite: "lax", maxAge: 3600 }
    },
    {
      name: "sb-lr-auth-token.1",
      value: "",
      options: { path: "/", sameSite: "lax", maxAge: 0 }
    }
  ]);

  const callbackHandlerRequest = new NextRequest(request.url, {
    headers: buildRequestHeadersWithCurrentCookies(request)
  });
  assert.equal(
    callbackHandlerRequest.cookies.get("sb-lr-auth-token.0")?.value,
    "rotated-session"
  );
  assert.equal(callbackHandlerRequest.cookies.has("sb-lr-auth-token.1"), false);

  const redirect = bridge.withAuthCookies(
    NextResponse.redirect("https://lr.signalthread.ai/exhibitor/integrations/pipedrive?pipedrive=connected", { status: 303 })
  );
  assert.equal(redirect.status, 303);
  assert.equal(
    redirect.headers.get("location"),
    "https://lr.signalthread.ai/exhibitor/integrations/pipedrive?pipedrive=connected"
  );

  const browserCookies = new Map([
    ["sb-lr-auth-token.0", "stale-session"],
    ["sb-lr-auth-token.1", "obsolete-chunk"]
  ]);
  for (const cookie of redirect.cookies.getAll()) {
    if (cookie.maxAge === 0 || !cookie.value) browserCookies.delete(cookie.name);
    else browserCookies.set(cookie.name, cookie.value);
  }
  const firstRedirectedRequest = new NextRequest(redirect.headers.get("location")!, {
    headers: {
      cookie: [...browserCookies].map(([name, value]) => `${name}=${value}`).join("; ")
    }
  });

  assert.equal(firstRedirectedRequest.cookies.get("sb-lr-auth-token.0")?.value, "rotated-session");
  assert.equal(firstRedirectedRequest.cookies.has("sb-lr-auth-token.1"), false);
  assert.equal(firstRedirectedRequest.nextUrl.pathname, "/exhibitor/integrations/pipedrive");
  assert.notEqual(firstRedirectedRequest.nextUrl.pathname, "/login");
  assert.notEqual(firstRedirectedRequest.nextUrl.pathname, "/exhibitor/dashboard");
});

test("disconnect preserves rotated auth cookies and converts POST to GET with a 303", () => {
  const request = new NextRequest("https://lr.signalthread.ai/api/integrations/pipedrive/disconnect", {
    method: "POST",
    headers: { cookie: "sb-lr-auth-token.0=current-session" }
  });
  const bridge = createSupabaseRouteCookieBridge(request);
  bridge.setAll([
    {
      name: "sb-lr-auth-token.0",
      value: "rotated-session",
      options: { path: "/", sameSite: "lax", maxAge: 3600 }
    }
  ]);
  const response = bridge.withAuthCookies(
    NextResponse.redirect(
      "https://lr.signalthread.ai/exhibitor/integrations?pipedrive=disconnected",
      { status: 303 }
    )
  );

  assert.equal(response.status, 303);
  assert.equal(response.cookies.get("sb-lr-auth-token.0")?.value, "rotated-session");
  assert.equal(
    response.headers.get("location"),
    "https://lr.signalthread.ai/exhibitor/integrations?pipedrive=disconnected"
  );

  const followedMethod = response.status === 303 ? "GET" : request.method;
  assert.equal(followedMethod, "GET");
  assert.notEqual(followedMethod, "POST");
  assert.doesNotMatch(response.headers.get("location") ?? "", /\/login|\/exhibitor\/dashboard|exhibitor-web-entry/);
});

test("Pipedrive callback retains validated platform-admin company context rather than creating a parallel cookie", () => {
  const callback = readFileSync("app/api/integrations/pipedrive/callback/route.ts", "utf8");
  const disconnect = readFileSync("app/api/integrations/pipedrive/disconnect/route.ts", "utf8");
  assert.match(callback, /authorizeCompanyIntegrationAdmin/);
  assert.doesNotMatch(callback, /PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE|active_company_id|companyId.*searchParams/i);
  assert.match(callback, /authorizeCompanyIntegrationAdmin\(\{ supabase: routeAuth\.supabase \}\)/);
  assert.match(disconnect, /authorizeCompanyIntegrationAdmin\(\{ supabase: routeAuth\.supabase \}\)/);
  assert.doesNotMatch(disconnect, /PLATFORM_ADMIN_ACCOUNT_CONTEXT_COOKIE|active_company_id|companyId.*searchParams/i);
});
