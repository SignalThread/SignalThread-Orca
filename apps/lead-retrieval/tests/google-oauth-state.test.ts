import assert from "node:assert/strict";
import test from "node:test";
import {
  createGoogleOAuthState,
  createGooglePkcePair,
  digestGoogleOAuthValue,
  verifyGoogleOAuthState
} from "../lib/integrations/google/oauth-state";

const SECRET = "deterministic-test-secret-with-32-plus-bytes";
const NOW = new Date("2026-07-30T12:00:00.000Z");

test("Google OAuth state is signed, expiring, and bound to user and company", () => {
  const created = createGoogleOAuthState({
    userId: "user-1",
    companyId: "company-1",
    returnTo: "/exhibitor/integrations",
    now: NOW,
    secret: SECRET
  });
  const verified = verifyGoogleOAuthState(created.state, { now: NOW, secret: SECRET });
  assert.equal(verified.userId, "user-1");
  assert.equal(verified.companyId, "company-1");
  assert.equal(verified.returnTo, "/exhibitor/integrations");
  assert.ok(verified.exp > verified.iat);
  assert.throws(
    () => verifyGoogleOAuthState(created.state, { now: new Date("2026-07-30T12:11:00.000Z"), secret: SECRET }),
    /expired or invalid/i
  );
});

test("Google OAuth state rejects tampering and unsafe return paths", () => {
  const created = createGoogleOAuthState({
    userId: "user-1",
    companyId: "company-1",
    returnTo: "https://attacker.example/callback",
    now: NOW,
    secret: SECRET
  });
  assert.equal(created.payload.returnTo, "/exhibitor/integrations/google-workspace");
  const [payload, signature] = created.state.split(".");
  assert.throws(
    () => verifyGoogleOAuthState(`${payload}x.${signature}`, { now: NOW, secret: SECRET }),
    /signature/i
  );
});

test("PKCE uses S256 and nonce digests do not retain raw values", () => {
  const pair = createGooglePkcePair();
  assert.equal(pair.method, "S256");
  assert.notEqual(pair.verifier, pair.challenge);
  assert.match(pair.verifier, /^[A-Za-z0-9_-]+$/);
  assert.equal(digestGoogleOAuthValue("one"), digestGoogleOAuthValue("one"));
  assert.notEqual(digestGoogleOAuthValue("one"), digestGoogleOAuthValue("two"));
});

