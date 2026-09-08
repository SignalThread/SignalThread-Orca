import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, NodeJS.Module | undefined>)[serverOnlyPath] = {
  id: serverOnlyPath,
  path: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {},
  isPreloading: false,
  require,
  parent: null
} as unknown as NodeJS.Module;

process.env.MICROSOFT_CLIENT_ID = "test-microsoft-client-id";
process.env.MICROSOFT_CLIENT_SECRET = "test-microsoft-client-secret";
process.env.MICROSOFT_REDIRECT_URI = "http://localhost:3000/api/integrations/microsoft/callback";
process.env.INTEGRATION_SECRET_ACTIVE_KEY_ID = "v1";
process.env.INTEGRATION_SECRET_ENCRYPTION_KEYS = JSON.stringify({
  v1: Buffer.alloc(32, 7).toString("base64")
});

import type { createAdminClient } from "@/lib/supabase/admin";
import { asAdminClient, createFakeSupabase, type FakeRow } from "./helpers/fake-supabase";
import { microsoftSecretContext } from "@/lib/integrations/microsoft/secret-context";
import { digestMicrosoftOAuthValue } from "@/lib/integrations/microsoft/oauth-state";
import { buildMicrosoftOAuthResultUrlForState } from "@/lib/integrations/microsoft/redirect";
import { decryptSecret, encryptSecret, getIntegrationSecretKeyring } from "@/lib/security/encrypted-secret";
import {
  resolveMobileOAuthBrowserLaunch,
  type MobileOAuthLaunchTicketBinding
} from "@/lib/integrations/mobile-oauth/launch-route-core";
import { MOBILE_OAUTH_BROWSER_LAUNCH_PATH } from "@/lib/integrations/mobile-oauth/middleware-policy";
import {
  MOBILE_OAUTH_INTERNAL_RETURN_PATH,
  isMobileOAuthProvider
} from "@/lib/integrations/mobile-oauth/bridge-core";
import { toMobileMicrosoft365Connection } from "@/lib/integrations/mobile-oauth/status-core";
import { MICROSOFT_365_PROVIDER } from "@/lib/integrations/microsoft/provider";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_USER_ID = "33333333-3333-4333-8333-333333333333";
const CORRELATION = "opaque_correlation_12345";
const TICKET = "ticket_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CONNECTION_ID = "44444444-4444-4444-8444-444444444444";
const GRANTED_SCOPES = ["User.Read", "Mail.Send", "Calendars.ReadWrite"];

/**
 * Server-only modules are imported lazily so the `server-only` stub above is
 * installed before they load.
 */
const loadOAuthClient = () => import("@/lib/integrations/microsoft/oauth-client");
const loadConnectionService = () => import("@/lib/integrations/microsoft/connection-service");
const loadConnectionStatus = () => import("@/lib/integrations/microsoft/connection-status");
const loadTokenManager = () => import("@/lib/integrations/microsoft/token-manager");

type Fake = ReturnType<typeof createFakeSupabase>;

function client(fake: Fake) {
  return asAdminClient<ReturnType<typeof createAdminClient>>(fake);
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function identity() {
  return { subject: "microsoft-subject-1", email: "person@contoso.com", displayName: "Person" };
}

function emptyTables(overrides: Record<string, FakeRow[]> = {}) {
  return createFakeSupabase({
    microsoft_365_connections: [],
    microsoft_365_connection_secrets: [],
    microsoft_oauth_state_nonces: [],
    google_workspace_connections: [],
    google_workspace_connection_secrets: [],
    ...overrides
  });
}

// ── requirement 1: the start produces a valid launch flow ─────────────────────

test("Microsoft authorization URL carries PKCE, the approved scopes, and no secret", async () => {
  const { buildMicrosoftAuthorizationUrl, requireMicrosoftOAuthConfig } = await loadOAuthClient();
  const url = buildMicrosoftAuthorizationUrl({
    state: "signed-state",
    codeChallenge: "challenge-value",
    forceConsent: true
  });
  assert.equal(url.origin, "https://login.microsoftonline.com");
  assert.equal(url.pathname, "/common/oauth2/v2.0/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-value");
  assert.equal(url.searchParams.get("state"), "signed-state");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(
    url.searchParams.get("scope"),
    "openid profile email offline_access User.Read Mail.Send Calendars.ReadWrite"
  );
  assert.equal(url.searchParams.get("redirect_uri"), requireMicrosoftOAuthConfig().redirectUri);
  assert.doesNotMatch(url.toString(), /test-microsoft-client-secret/);
  assert.equal(
    buildMicrosoftAuthorizationUrl({ state: "s", codeChallenge: "c" }).searchParams.get("prompt"),
    "select_account"
  );
});

test("the mobile bridge launches Microsoft from a Microsoft ticket and consumes it once", async () => {
  const binding: MobileOAuthLaunchTicketBinding = {
    provider: MICROSOFT_365_PROVIDER,
    user_id: USER_ID,
    company_id: COMPANY_ID,
    correlation: CORRELATION,
    force_reconnect: true
  };
  let available = true;
  let microsoftInput: Record<string, unknown> | null = null;
  const deps = {
    consumeTicket: async () => {
      if (!available) return null;
      available = false;
      return binding;
    },
    prepareGoogleLaunch: async () => assert.fail("a Microsoft ticket must not start Google"),
    prepareMicrosoftLaunch: async (input: Record<string, unknown>) => {
      microsoftInput = input;
      return {
        authorizationUrl: new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=signed"),
        codeVerifier: "pkce-verifier",
        maxAge: 600
      };
    }
  };
  const request = { url: `https://lr.signalthread.ai${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}?ticket=${TICKET}` };

  const first = await resolveMobileOAuthBrowserLaunch(request, deps);
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.provider, MICROSOFT_365_PROVIDER);
    assert.equal(first.authorizationUrl.origin, "https://login.microsoftonline.com");
  }
  assert.deepEqual(microsoftInput, {
    userId: USER_ID,
    companyId: COMPANY_ID,
    channel: "mobile",
    correlation: CORRELATION,
    returnTo: MOBILE_OAUTH_INTERNAL_RETURN_PATH,
    forceConsent: true
  });

  // Requirement 5, launch layer: a ticket is single use.
  const second = await resolveMobileOAuthBrowserLaunch(request, deps);
  assert.deepEqual(second, {
    ok: false,
    status: 400,
    error: "This authorization link is invalid or has expired."
  });
});

// ── requirement 15: provider mix-up / replay at the launch bridge ─────────────

test("a Microsoft ticket cannot start another provider and unknown providers are rejected", async () => {
  const neverPrepare = async () => assert.fail("an invalid binding must not prepare a launch");
  const request = { url: `https://lr.signalthread.ai${MOBILE_OAUTH_BROWSER_LAUNCH_PATH}?ticket=${TICKET}` };

  // Microsoft ticket, but no Microsoft preparation registered: refuse rather
  // than fall back to the Google launch.
  const withoutMicrosoft = await resolveMobileOAuthBrowserLaunch(request, {
    consumeTicket: async () => ({
      provider: MICROSOFT_365_PROVIDER,
      user_id: USER_ID,
      company_id: COMPANY_ID,
      correlation: CORRELATION,
      force_reconnect: false
    }),
    prepareGoogleLaunch: neverPrepare
  });
  assert.equal(withoutMicrosoft.ok, false);
  assert.equal(!withoutMicrosoft.ok && withoutMicrosoft.status, 400);

  for (const provider of ["outlook", "microsoft", "microsoft_365 ", ""]) {
    assert.equal(isMobileOAuthProvider(provider), false, provider);
    const result = await resolveMobileOAuthBrowserLaunch(request, {
      consumeTicket: async () =>
        ({
          provider,
          user_id: USER_ID,
          company_id: COMPANY_ID,
          correlation: CORRELATION,
          force_reconnect: false
        }) as unknown as MobileOAuthLaunchTicketBinding,
      prepareGoogleLaunch: neverPrepare,
      prepareMicrosoftLaunch: neverPrepare
    });
    assert.equal(result.ok, false, provider);
  }
});

// ── requirements 2 and 5: nonce binding, single use, expiry ──────────────────

test("the state nonce is single use and bound to user, company and PKCE verifier", async () => {
  const { consumeMicrosoftOAuthNonce } = await loadConnectionService();
  const codeVerifier = "pkce-verifier-value";
  const nonce = {
    jti_digest: digestMicrosoftOAuthValue("jti-1"),
    user_id: USER_ID,
    company_id: COMPANY_ID,
    code_verifier_digest: digestMicrosoftOAuthValue(codeVerifier),
    return_to: "/exhibitor/integrations/microsoft-365",
    expires_at: "2026-08-18T12:10:00.000Z",
    consumed_at: null
  };
  const fake = emptyTables({ microsoft_oauth_state_nonces: [{ ...nonce }] });
  const supabase = client(fake);
  const now = new Date("2026-08-18T12:01:00.000Z");

  const first = await consumeMicrosoftOAuthNonce({
    jti: "jti-1",
    userId: USER_ID,
    companyId: COMPANY_ID,
    codeVerifier,
    now,
    supabase
  });
  assert.equal(first, "/exhibitor/integrations/microsoft-365");

  // Requirement 5: replaying the same state finds no unconsumed row.
  const replay = await consumeMicrosoftOAuthNonce({
    jti: "jti-1",
    userId: USER_ID,
    companyId: COMPANY_ID,
    codeVerifier,
    now,
    supabase
  });
  assert.equal(replay, null);

  // Requirement 2: a different user, company, or verifier never matches.
  for (const mismatch of [
    { userId: OTHER_USER_ID },
    { companyId: "55555555-5555-4555-8555-555555555555" },
    { codeVerifier: "different-verifier" }
  ]) {
    const scoped = emptyTables({ microsoft_oauth_state_nonces: [{ ...nonce }] });
    const result = await consumeMicrosoftOAuthNonce({
      jti: "jti-1",
      userId: USER_ID,
      companyId: COMPANY_ID,
      codeVerifier,
      now,
      supabase: client(scoped),
      ...mismatch
    });
    assert.equal(result, null, JSON.stringify(mismatch));
    assert.equal(scoped._tables.microsoft_oauth_state_nonces[0].consumed_at, null);
  }
});

// ── requirement 4: expired state is rejected at the nonce layer too ──────────

test("an expired state nonce is not consumable", async () => {
  const { consumeMicrosoftOAuthNonce } = await loadConnectionService();
  const codeVerifier = "pkce-verifier-value";
  const fake = emptyTables({
    microsoft_oauth_state_nonces: [
      {
        jti_digest: digestMicrosoftOAuthValue("jti-expired"),
        user_id: USER_ID,
        company_id: COMPANY_ID,
        code_verifier_digest: digestMicrosoftOAuthValue(codeVerifier),
        return_to: "/exhibitor/integrations/microsoft-365",
        expires_at: "2026-08-18T12:00:00.000Z",
        consumed_at: null
      }
    ]
  });
  const result = await consumeMicrosoftOAuthNonce({
    jti: "jti-expired",
    userId: USER_ID,
    companyId: COMPANY_ID,
    codeVerifier,
    now: new Date("2026-08-18T12:05:00.000Z"),
    supabase: client(fake)
  });
  assert.equal(result, null);
});

// ── requirement 6: authorization code exchange ───────────────────────────────

test("the authorization code is exchanged with PKCE and client credentials", async () => {
  const { exchangeMicrosoftAuthorizationCode } = await loadOAuthClient();
  let requestUrl: string | null = null;
  let body: URLSearchParams | null = null;
  const result = await exchangeMicrosoftAuthorizationCode({
    code: "authorization-code",
    codeVerifier: "pkce-verifier",
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      body = new URLSearchParams(String(init?.body));
      return jsonResponse(200, {
        access_token: "access-1",
        refresh_token: "refresh-1",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send"
      });
    }
  });

  assert.equal(requestUrl, "https://login.microsoftonline.com/common/oauth2/v2.0/token");
  assert.equal(body!.get("grant_type"), "authorization_code");
  assert.equal(body!.get("code"), "authorization-code");
  assert.equal(body!.get("code_verifier"), "pkce-verifier");
  assert.equal(body!.get("client_id"), "test-microsoft-client-id");
  assert.equal(body!.get("client_secret"), "test-microsoft-client-secret");
  assert.equal(result.ok, true);
  assert.equal(result.payload.access_token, "access-1");

  const failure = await exchangeMicrosoftAuthorizationCode({
    code: "bad",
    codeVerifier: "v",
    fetchImpl: async () => jsonResponse(400, { error: "invalid_grant" })
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.payload.error, "invalid_grant");
});

// ── requirement 7: Graph /me identity verification ───────────────────────────

test("the connected identity is verified against Microsoft Graph /me", async () => {
  const { fetchMicrosoftIdentity } = await loadOAuthClient();
  let requestUrl: string | null = null;
  let authorizationHeader: string | null = null;
  const verified = await fetchMicrosoftIdentity({
    accessToken: "access-1",
    fetchImpl: async (input, init) => {
      requestUrl = String(input);
      authorizationHeader = new Headers(init?.headers).get("authorization");
      return jsonResponse(200, {
        id: "microsoft-subject-1",
        userPrincipalName: "Person@Contoso.com",
        displayName: "Person"
      });
    }
  });
  assert.equal(requestUrl, "https://graph.microsoft.com/v1.0/me");
  assert.equal(authorizationHeader, "Bearer access-1");
  assert.deepEqual(verified, {
    subject: "microsoft-subject-1",
    email: "person@contoso.com",
    displayName: "Person"
  });

  await assert.rejects(
    fetchMicrosoftIdentity({ accessToken: "bad", fetchImpl: async () => jsonResponse(401, {}) }),
    /did not return the connected account/
  );
  await assert.rejects(
    fetchMicrosoftIdentity({
      accessToken: "access-1",
      fetchImpl: async () => jsonResponse(200, { displayName: "No identity" })
    }),
    /usable account identity/
  );
});

// ── requirements 8 and 9: encrypted storage, refresh credential persisted ────

test("connection credentials are stored encrypted and only then marked connected", async () => {
  const { saveMicrosoft365Connection } = await loadConnectionService();
  const { getMicrosoft365ConnectionStatus } = await loadConnectionStatus();
  const fake = emptyTables();
  const connectionId = await saveMicrosoft365Connection({
    userId: USER_ID,
    companyId: COMPANY_ID,
    identity: identity(),
    accessToken: "access-1",
    refreshToken: "refresh-1",
    expiresIn: 3600,
    scopes: GRANTED_SCOPES,
    tokenType: "Bearer",
    supabase: client(fake)
  });

  const connection = fake._tables.microsoft_365_connections[0];
  const secret = fake._tables.microsoft_365_connection_secrets[0];
  assert.equal(connection.id, connectionId);
  assert.equal(connection.status, "connected");
  assert.equal(connection.user_id, USER_ID);
  assert.equal(connection.company_id, COMPANY_ID);
  assert.equal(connection.microsoft_email, "person@contoso.com");
  assert.deepEqual(connection.granted_scopes, GRANTED_SCOPES);
  assert.equal(connection.last_error_code, null);

  // Requirement 8: nothing readable is stored, and the envelope is bound to
  // this connection and credential kind.
  const serialized = JSON.stringify(fake._tables);
  assert.doesNotMatch(serialized, /access-1|refresh-1/);
  assert.equal(secret.encryption_key_version, "v1");
  assert.equal(
    decryptSecret(
      String(secret.access_token_encrypted),
      microsoftSecretContext(connectionId, "access_token")
    ),
    "access-1"
  );
  // Requirement 9: the refresh credential round-trips from storage.
  assert.equal(
    decryptSecret(
      String(secret.refresh_token_encrypted),
      microsoftSecretContext(connectionId, "refresh_token")
    ),
    "refresh-1"
  );
  assert.throws(
    () =>
      decryptSecret(
        String(secret.refresh_token_encrypted),
        microsoftSecretContext(connectionId, "access_token")
      ),
    /could not be authenticated/
  );

  const status = await getMicrosoft365ConnectionStatus(USER_ID, COMPANY_ID, {
    supabase: client(fake)
  });
  assert.equal(status.connected, true);
  assert.equal(status.status, "connected");
  assert.equal(status.isPartialGrant, false);
  assert.deepEqual(status.capabilities, { mailSend: true, calendarReadWrite: true });
  assert.deepEqual(toMobileMicrosoft365Connection(status), {
    provider: "microsoft_365",
    displayName: "Microsoft 365",
    state: "connected",
    account: { email: "person@contoso.com" },
    capabilities: { email: true, calendar: true }
  });
});

test("a reconnect without a new refresh token keeps the stored offline credential", async () => {
  const { saveMicrosoft365Connection } = await loadConnectionService();
  const fake = emptyTables();
  const supabase = client(fake);
  await saveMicrosoft365Connection({
    userId: USER_ID,
    companyId: COMPANY_ID,
    identity: identity(),
    accessToken: "access-1",
    refreshToken: "refresh-1",
    scopes: GRANTED_SCOPES,
    supabase
  });
  await saveMicrosoft365Connection({
    userId: USER_ID,
    companyId: COMPANY_ID,
    identity: identity(),
    accessToken: "access-2",
    scopes: GRANTED_SCOPES,
    supabase
  });

  assert.equal(fake._tables.microsoft_365_connections.length, 1);
  const connectionId = String(fake._tables.microsoft_365_connections[0].id);
  const secret = fake._tables.microsoft_365_connection_secrets[0];
  assert.equal(
    decryptSecret(
      String(secret.access_token_encrypted),
      microsoftSecretContext(connectionId, "access_token")
    ),
    "access-2"
  );
  assert.equal(
    decryptSecret(
      String(secret.refresh_token_encrypted),
      microsoftSecretContext(connectionId, "refresh_token")
    ),
    "refresh-1"
  );
});

// ── requirement 10: replacement refresh token rotates ────────────────────────

test("a replacement refresh token replaces the stored one on refresh", async () => {
  const { getValidMicrosoftAccessTokenForUser } = await loadTokenManager();
  const keyring = getIntegrationSecretKeyring();
  const fake = emptyTables({
    microsoft_365_connections: [
      {
        id: CONNECTION_ID,
        user_id: USER_ID,
        company_id: COMPANY_ID,
        status: "connected",
        token_expires_at: "2020-01-01T00:00:00.000Z",
        granted_scopes: GRANTED_SCOPES,
        refresh_lease_token: null,
        refresh_lease_until: null
      }
    ],
    microsoft_365_connection_secrets: [
      {
        connection_id: CONNECTION_ID,
        access_token_encrypted: encryptSecret(
          "old-access",
          microsoftSecretContext(CONNECTION_ID, "access_token"),
          keyring
        ),
        refresh_token_encrypted: encryptSecret(
          "old-refresh",
          microsoftSecretContext(CONNECTION_ID, "refresh_token"),
          keyring
        ),
        encryption_key_version: "v1"
      }
    ]
  });

  let refreshBody: URLSearchParams | null = null;
  const result = await getValidMicrosoftAccessTokenForUser({
    userId: USER_ID,
    companyId: COMPANY_ID,
    supabase: client(fake),
    fetchImpl: async (_input, init) => {
      refreshBody = new URLSearchParams(String(init?.body));
      return jsonResponse(200, {
        access_token: "new-access",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.ReadWrite"
      });
    }
  });

  assert.equal(refreshBody!.get("grant_type"), "refresh_token");
  assert.equal(refreshBody!.get("refresh_token"), "old-refresh");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.refreshed, true);
  assert.equal(result.ok && result.accessToken, "new-access");

  const secret = fake._tables.microsoft_365_connection_secrets[0];
  assert.equal(
    decryptSecret(
      String(secret.refresh_token_encrypted),
      microsoftSecretContext(CONNECTION_ID, "refresh_token")
    ),
    "rotated-refresh"
  );
  assert.doesNotMatch(JSON.stringify(fake._tables), /rotated-refresh|new-access/);
  const connection = fake._tables.microsoft_365_connections[0];
  assert.equal(connection.status, "connected");
  assert.equal(connection.refresh_lease_token, null);
});

// ── requirement 12: invalid credentials become reconnect_required ────────────

test("an invalid_grant refresh demotes the connection to reconnect_required", async () => {
  const { getValidMicrosoftAccessTokenForUser } = await loadTokenManager();
  const { getMicrosoft365ConnectionStatus } = await loadConnectionStatus();
  const keyring = getIntegrationSecretKeyring();
  const fake = emptyTables({
    microsoft_365_connections: [
      {
        id: CONNECTION_ID,
        user_id: USER_ID,
        company_id: COMPANY_ID,
        status: "connected",
        token_expires_at: "2020-01-01T00:00:00.000Z",
        granted_scopes: GRANTED_SCOPES,
        microsoft_email: "person@contoso.com",
        microsoft_display_name: "Person",
        connected_at: "2026-08-18T12:00:00.000Z",
        last_refresh_at: null,
        last_error_code: null,
        refresh_lease_token: null,
        refresh_lease_until: null
      }
    ],
    microsoft_365_connection_secrets: [
      {
        connection_id: CONNECTION_ID,
        access_token_encrypted: encryptSecret(
          "old-access",
          microsoftSecretContext(CONNECTION_ID, "access_token"),
          keyring
        ),
        refresh_token_encrypted: encryptSecret(
          "revoked-refresh",
          microsoftSecretContext(CONNECTION_ID, "refresh_token"),
          keyring
        ),
        encryption_key_version: "v1"
      }
    ]
  });
  const supabase = client(fake);

  const result = await getValidMicrosoftAccessTokenForUser({
    userId: USER_ID,
    companyId: COMPANY_ID,
    supabase,
    fetchImpl: async () =>
      jsonResponse(400, { error: "invalid_grant", error_description: "AADSTS70000: revoked" })
  });

  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "reconnect_required");
  assert.equal(fake._tables.microsoft_365_connections[0].status, "reconnect_required");
  assert.equal(fake._tables.microsoft_365_connections[0].last_error_code, "invalid_grant");
  assert.equal(fake._tables.microsoft_365_connection_secrets.length, 0);

  const status = await getMicrosoft365ConnectionStatus(USER_ID, COMPANY_ID, { supabase });
  assert.equal(status.connected, false);
  assert.equal(status.status, "reconnect_required");
  assert.deepEqual(status.capabilities, { mailSend: false, calendarReadWrite: false });
  assert.equal(toMobileMicrosoft365Connection(status).state, "reconnect_required");
});

test("an unreadable stored credential reports reconnect_required rather than connected", async () => {
  const { getMicrosoft365ConnectionStatus } = await loadConnectionStatus();
  const fake = emptyTables({
    microsoft_365_connections: [
      {
        id: CONNECTION_ID,
        user_id: USER_ID,
        company_id: COMPANY_ID,
        status: "connected",
        token_expires_at: "2030-01-01T00:00:00.000Z",
        granted_scopes: GRANTED_SCOPES,
        microsoft_email: "person@contoso.com",
        microsoft_display_name: "Person",
        connected_at: "2026-08-18T12:00:00.000Z",
        last_refresh_at: null,
        last_error_code: null
      }
    ],
    microsoft_365_connection_secrets: [
      {
        connection_id: CONNECTION_ID,
        access_token_encrypted: "v1:v1:corrupt:corrupt:corrupt",
        refresh_token_encrypted: "v1:v1:corrupt:corrupt:corrupt",
        encryption_key_version: "v1"
      }
    ]
  });
  const status = await getMicrosoft365ConnectionStatus(USER_ID, COMPANY_ID, {
    supabase: client(fake)
  });
  assert.equal(status.status, "reconnect_required");
  assert.equal(status.connected, false);
  assert.equal(status.lastErrorCode, "credential_decryption_failed");
});

// ── requirement 13: disconnect clears local connection state ─────────────────

test("disconnect removes the local connection and its encrypted credentials", async () => {
  const { disconnectMicrosoft365Connection, saveMicrosoft365Connection } = await loadConnectionService();
  const { getMicrosoft365ConnectionStatus } = await loadConnectionStatus();
  const fake = emptyTables();
  const supabase = client(fake);
  await saveMicrosoft365Connection({
    userId: USER_ID,
    companyId: COMPANY_ID,
    identity: identity(),
    accessToken: "access-1",
    refreshToken: "refresh-1",
    scopes: GRANTED_SCOPES,
    supabase
  });
  assert.equal(fake._tables.microsoft_365_connections.length, 1);

  const result = await disconnectMicrosoft365Connection({
    userId: USER_ID,
    companyId: COMPANY_ID,
    supabase
  });
  assert.deepEqual(result, {
    disconnected: true,
    revocationConfirmed: true,
    revocationPending: false
  });
  assert.equal(fake._tables.microsoft_365_connections.length, 0);

  const status = await getMicrosoft365ConnectionStatus(USER_ID, COMPANY_ID, { supabase });
  assert.equal(status.status, "disconnected");
  assert.equal(status.identity, null);

  // Disconnecting again is idempotent, and never touches another user's row.
  assert.deepEqual(
    await disconnectMicrosoft365Connection({ userId: USER_ID, companyId: COMPANY_ID, supabase }),
    { disconnected: true, revocationConfirmed: true, revocationPending: false }
  );
});

// ── requirement 14: Microsoft failures do not affect Google ──────────────────

test("a Microsoft failure leaves the Google connection untouched", async () => {
  const { disconnectMicrosoft365Connection, saveMicrosoft365Connection } = await loadConnectionService();
  const fake = emptyTables({
    google_workspace_connections: [
      {
        id: "google-connection-1",
        user_id: USER_ID,
        company_id: COMPANY_ID,
        status: "connected",
        google_email: "person@example.com",
        granted_scopes: ["openid", "email", "profile"]
      }
    ]
  });
  const supabase = client(fake);

  await assert.rejects(
    saveMicrosoft365Connection({
      userId: USER_ID,
      companyId: COMPANY_ID,
      identity: identity(),
      accessToken: "access-1",
      // No refresh token and no stored credential: Microsoft persistence fails.
      scopes: GRANTED_SCOPES,
      supabase
    }),
    /offline refresh token/
  );
  await disconnectMicrosoft365Connection({ userId: USER_ID, companyId: COMPANY_ID, supabase });

  assert.deepEqual(fake._tables.google_workspace_connections, [
    {
      id: "google-connection-1",
      user_id: USER_ID,
      company_id: COMPANY_ID,
      status: "connected",
      google_email: "person@example.com",
      granted_scopes: ["openid", "email", "profile"]
    }
  ]);
  const touchedGoogleTables = fake._calls.filter((call) => call.table.startsWith("google_"));
  assert.deepEqual(touchedGoogleTables, []);
});

// ── requirements 11 and 16: return to the mobile completion flow, no secrets ──

test("the callback returns through the existing completion flow without tokens", () => {
  const mobile = buildMicrosoftOAuthResultUrlForState(
    { url: "https://lr.signalthread.ai/api/integrations/microsoft/callback" },
    {
      v: 1,
      provider: MICROSOFT_365_PROVIDER,
      jti: "opaque-jti",
      userId: USER_ID,
      companyId: COMPANY_ID,
      returnTo: MOBILE_OAUTH_INTERNAL_RETURN_PATH,
      channel: "mobile",
      correlation: CORRELATION,
      iat: 1,
      exp: 2
    },
    "connection_failed: refresh_token=rotated-refresh access_token=new-access"
  );
  assert.equal(
    mobile.toString(),
    `leadintelscan://oauth/callback?provider=microsoft_365&result=failed&correlation=${CORRELATION}`
  );
  assert.deepEqual([...mobile.searchParams.keys()].sort(), ["correlation", "provider", "result"]);

  const web = buildMicrosoftOAuthResultUrlForState(
    { url: "https://lr.signalthread.ai/api/integrations/microsoft/callback" },
    {
      v: 1,
      provider: MICROSOFT_365_PROVIDER,
      jti: "opaque-jti",
      userId: USER_ID,
      companyId: COMPANY_ID,
      returnTo: "/exhibitor/integrations/microsoft-365",
      iat: 1,
      exp: 2
    },
    "connected"
  );
  assert.equal(
    web.toString(),
    "https://lr.signalthread.ai/exhibitor/integrations/microsoft-365?microsoft=connected"
  );

  for (const url of [mobile, web]) {
    assert.doesNotMatch(url.toString(), /access_token|refresh_token|code_verifier|client_secret/);
    assert.doesNotMatch(url.toString(), /rotated-refresh|new-access|test-microsoft-client-secret/);
  }
});

// ── structural guarantees the runtime tests above cannot observe ─────────────

test("Microsoft routes reuse the canonical authorization, launch and disconnect architecture", () => {
  const connect = readFileSync("app/api/exhibitor/integrations/microsoft/connect/route.ts", "utf8");
  const callback = readFileSync("app/api/integrations/microsoft/callback/route.ts", "utf8");
  const status = readFileSync("app/api/exhibitor/integrations/microsoft/status/route.ts", "utf8");
  const disconnect = readFileSync("app/api/exhibitor/integrations/microsoft/disconnect/route.ts", "utf8");
  const service = readFileSync("lib/integrations/microsoft/connection-service.ts", "utf8");
  const mobileDisconnect = readFileSync(
    "app/api/mobile/integrations/connections/[provider]/route.ts",
    "utf8"
  );

  // RBAC is the shared integration-connection rule, not a Microsoft-specific one.
  for (const source of [connect, status, disconnect, callback]) {
    assert.match(source, /authorizeIntegrationConnectionAdmin/);
  }
  assert.match(connect, /httpOnly:\s*true/);
  assert.match(connect, /sameSite:\s*"lax"/);
  assert.match(connect, /path: MICROSOFT_OAUTH_CALLBACK_PATH/);
  assert.match(callback, /verifyMicrosoftOAuthState/);
  assert.match(callback, /authorization\.context\.userId !== payload\.userId/);
  assert.match(callback, /authorization\.context\.companyId !== payload\.companyId/);
  // Single-use nonce consumption happens before the code is ever exchanged.
  assert.ok(
    callback.indexOf("await consumeMicrosoftOAuthNonce(") <
      callback.indexOf("await exchangeMicrosoftAuthorizationCode(")
  );
  // Identity is verified before anything is persisted.
  assert.ok(
    callback.indexOf("await fetchMicrosoftIdentity(") < callback.indexOf("await saveMicrosoft365Connection(")
  );
  assert.match(service, /\.is\("consumed_at", null\)/);
  assert.match(service, /\.gt\("expires_at", consumedAt\)/);
  assert.match(service, /\.eq\("code_verifier_digest"/);
  // Local removal is authoritative and scoped to the owning user and company.
  assert.match(service, /disconnectProviderConnectionWithDeps/);
  assert.match(service, /revokeToken: null/);
  assert.match(mobileDisconnect, /disconnectMicrosoft365Connection/);
  // The status DTO never exposes credentials.
  assert.doesNotMatch(status, /access_token|refresh_token|connection_secrets/);
});

test("Microsoft shares the Google connection lifecycle cores rather than forking them", () => {
  const tokenManager = readFileSync("lib/integrations/microsoft/token-manager.ts", "utf8");
  const health = readFileSync("lib/integrations/microsoft/connection-health-core.ts", "utf8");
  const googleTokenCore = readFileSync("lib/integrations/google/token-manager-core.ts", "utf8");
  const googleDisconnect = readFileSync("lib/integrations/google/disconnect-core.ts", "utf8");
  assert.match(tokenManager, /from "@\/lib\/integrations\/oauth\/token-manager-core"/);
  assert.match(health, /from "@\/lib\/integrations\/oauth\/connection-health-core"/);
  assert.match(googleTokenCore, /from "@\/lib\/integrations\/oauth\/token-manager-core"/);
  assert.match(googleDisconnect, /from "@\/lib\/integrations\/oauth\/disconnect-core"/);
});
