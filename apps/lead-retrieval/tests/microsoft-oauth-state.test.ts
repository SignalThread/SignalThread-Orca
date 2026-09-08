import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createMicrosoftOAuthState,
  createMicrosoftPkcePair,
  digestMicrosoftOAuthValue,
  normalizeMicrosoftReturnTo,
  verifyMicrosoftOAuthState
} from "../lib/integrations/microsoft/oauth-state";
import {
  createGoogleOAuthState,
  verifyGoogleOAuthState
} from "../lib/integrations/google/oauth-state";
import {
  MICROSOFT_365_SCOPES,
  getMicrosoft365Capabilities,
  hasRequiredMicrosoft365IdentityScopes,
  normalizeGrantedMicrosoft365Scopes
} from "../lib/integrations/microsoft/scopes";
import { MICROSOFT_365_MANAGE_PATH, MICROSOFT_365_PROVIDER } from "../lib/integrations/microsoft/provider";
import { MOBILE_OAUTH_INTERNAL_RETURN_PATH } from "../lib/integrations/mobile-oauth/bridge-core";

const SECRET = "deterministic-test-secret-with-32-plus-bytes";
const NOW = new Date("2026-08-18T12:00:00.000Z");
const USER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const CORRELATION = "opaque_correlation_12345";

function microsoftState(overrides: Partial<Parameters<typeof createMicrosoftOAuthState>[0]> = {}) {
  return createMicrosoftOAuthState({
    userId: USER_ID,
    companyId: COMPANY_ID,
    now: NOW,
    secret: SECRET,
    ...overrides
  });
}

test("Microsoft OAuth requests exactly the approved delegated scope set", () => {
  assert.deepEqual([...MICROSOFT_365_SCOPES], [
    "openid",
    "profile",
    "email",
    "offline_access",
    "User.Read",
    "Mail.Send",
    "Calendars.ReadWrite"
  ]);
});

test("Microsoft Graph resource URIs normalize to the requested short scope names", () => {
  assert.deepEqual(
    normalizeGrantedMicrosoft365Scopes(
      "https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/Files.ReadWrite"
    ),
    ["User.Read", "Mail.Send", "Calendars.ReadWrite"]
  );
  assert.deepEqual(getMicrosoft365Capabilities(["User.Read", "Mail.Send"]), {
    mailSend: true,
    calendarReadWrite: false
  });
  assert.equal(hasRequiredMicrosoft365IdentityScopes(["User.Read"]), true);
  assert.equal(hasRequiredMicrosoft365IdentityScopes(["Mail.Send"]), false);
});

// Requirement 2: state binds provider, user and company.
test("Microsoft OAuth state is signed, expiring, and bound to provider, user and company", () => {
  const created = microsoftState({ returnTo: "/exhibitor/integrations" });
  const verified = verifyMicrosoftOAuthState(created.state, { now: NOW, secret: SECRET });
  assert.equal(verified.provider, MICROSOFT_365_PROVIDER);
  assert.equal(verified.userId, USER_ID);
  assert.equal(verified.companyId, COMPANY_ID);
  assert.equal(verified.returnTo, "/exhibitor/integrations");
  assert.ok(verified.exp > verified.iat);
});

// Requirement 3: invalid state is rejected.
test("Microsoft OAuth state rejects tampering, wrong secrets, and unsafe return paths", () => {
  const created = microsoftState({ returnTo: "https://attacker.example/callback" });
  assert.equal(created.payload.returnTo, MICROSOFT_365_MANAGE_PATH);
  assert.equal(normalizeMicrosoftReturnTo("https://attacker.example"), MICROSOFT_365_MANAGE_PATH);

  const [payload, signature] = created.state.split(".");
  assert.throws(
    () => verifyMicrosoftOAuthState(`${payload}x.${signature}`, { now: NOW, secret: SECRET }),
    /signature/i
  );
  assert.throws(
    () => verifyMicrosoftOAuthState(created.state, { now: NOW, secret: `${SECRET}-different` }),
    /signature/i
  );
  assert.throws(() => verifyMicrosoftOAuthState("not-a-state", { now: NOW, secret: SECRET }), /Invalid OAuth state/);

  // A forged payload cannot be re-signed without the secret.
  const forged = Buffer.from(
    JSON.stringify({ ...created.payload, userId: "attacker-user" }),
    "utf8"
  ).toString("base64url");
  assert.throws(
    () => verifyMicrosoftOAuthState(`${forged}.${signature}`, { now: NOW, secret: SECRET }),
    /signature/i
  );
});

// Requirement 4: expired state is rejected.
test("Microsoft OAuth state expires and cannot be issued with an extended lifetime", () => {
  const created = microsoftState();
  assert.doesNotThrow(() =>
    verifyMicrosoftOAuthState(created.state, {
      now: new Date(NOW.getTime() + 9 * 60_000),
      secret: SECRET
    })
  );
  assert.throws(
    () =>
      verifyMicrosoftOAuthState(created.state, {
        now: new Date(NOW.getTime() + 11 * 60_000),
        secret: SECRET
      }),
    /expired or invalid/i
  );
});

// Requirement 15: provider mix-up is rejected in both directions.
test("state minted for one provider never verifies for another, even on a shared secret", () => {
  const microsoft = microsoftState({
    channel: "mobile",
    correlation: CORRELATION
  });
  const google = createGoogleOAuthState({
    userId: USER_ID,
    companyId: COMPANY_ID,
    channel: "mobile",
    correlation: CORRELATION,
    now: NOW,
    secret: SECRET
  });

  assert.throws(() => verifyGoogleOAuthState(microsoft.state, { now: NOW, secret: SECRET }), /signature/i);
  assert.throws(() => verifyMicrosoftOAuthState(google.state, { now: NOW, secret: SECRET }), /signature/i);

  // Even the web-channel states, whose payload shapes differ only by the
  // provider field, are cryptographically separated.
  const microsoftWeb = microsoftState();
  const googleWeb = createGoogleOAuthState({
    userId: USER_ID,
    companyId: COMPANY_ID,
    now: NOW,
    secret: SECRET
  });
  assert.throws(() => verifyGoogleOAuthState(microsoftWeb.state, { now: NOW, secret: SECRET }), /signature/i);
  assert.throws(() => verifyMicrosoftOAuthState(googleWeb.state, { now: NOW, secret: SECRET }), /signature/i);
});

test("mobile Microsoft state binds the fixed internal return path and an opaque correlation", () => {
  const created = microsoftState({
    channel: "mobile",
    correlation: CORRELATION,
    returnTo: "https://attacker.example/callback"
  });
  const verified = verifyMicrosoftOAuthState(created.state, { now: NOW, secret: SECRET });
  assert.equal(verified.channel, "mobile");
  assert.equal(verified.returnTo, MOBILE_OAUTH_INTERNAL_RETURN_PATH);
  assert.equal(verified.correlation, CORRELATION);
  assert.throws(
    () => microsoftState({ channel: "mobile", correlation: "short" }),
    /opaque correlation/i
  );
});

test("Microsoft PKCE uses S256 and nonce digests do not retain raw values", () => {
  const pair = createMicrosoftPkcePair();
  assert.equal(pair.method, "S256");
  assert.notEqual(pair.verifier, pair.challenge);
  assert.match(pair.verifier, /^[A-Za-z0-9_-]+$/);
  assert.equal(digestMicrosoftOAuthValue("one"), digestMicrosoftOAuthValue("one"));
  assert.notEqual(digestMicrosoftOAuthValue("one"), digestMicrosoftOAuthValue("two"));
  assert.notEqual(digestMicrosoftOAuthValue(pair.verifier), pair.verifier);
});

test("Microsoft OAuth reuses the shared signed-state, PKCE and consent cores", () => {
  const state = readFileSync("lib/integrations/microsoft/oauth-state.ts", "utf8");
  const launch = readFileSync("lib/integrations/microsoft/oauth-launch-service.ts", "utf8");
  assert.match(state, /from "@\/lib\/integrations\/oauth\/signed-state-core"/);
  assert.match(state, /deriveProviderStateSecret/);
  assert.match(launch, /deriveProviderOAuthConsentAssessment/);
  assert.match(launch, /forceConsent: consent\.requiresNewRefreshToken/);
  // Single-use, expiring state records are persisted before the browser leaves.
  assert.match(launch, /microsoft_oauth_state_nonces/);
  assert.match(launch, /code_verifier_digest: digestMicrosoftOAuthValue\(pkce\.verifier\)/);
  assert.match(launch, /expires_at: new Date\(payload\.exp \* 1000\)\.toISOString\(\)/);
  assert.doesNotMatch(launch, /code_verifier:\s|refresh_token:\s/);
});
