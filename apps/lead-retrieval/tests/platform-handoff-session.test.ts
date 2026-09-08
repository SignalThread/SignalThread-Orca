// @lr area=auth-session severity=P0 layer=unit category=local-only
/**
 * Lead Retrieval session establishment after a Platform launch.
 *
 * The session is opened in LR's own Supabase Auth project for the LR user the
 * mapping produced -- by id, never by email -- through the same server-side
 * magic-link primitive LR already uses for passwordless sign-ins. No email is
 * sent, no OTP is shown, no service-role material leaves the server, and nothing
 * is minted for a user who was refused.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { establishLeadRetrievalSessionWithDeps, type EstablishSessionDeps } from "../lib/platform/establish-session";

const LR_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function fakeDeps(overrides: Partial<EstablishSessionDeps> = {}) {
  const log: string[] = [];
  const deps: EstablishSessionDeps = {
    async getAuthUserById(id) {
      log.push(`getUserById:${id}`);
      return id === LR_USER ? { id: LR_USER, email: "mapped.user@example.com", bannedUntil: null } : null;
    },
    async generateMagicLink(email) {
      log.push(`generateLink:${email}`);
      return { hashedToken: "hashed-otp", userId: LR_USER };
    },
    async verifyOtp(token) {
      log.push(`verifyOtp:${token}`);
      return { userId: token === "hashed-otp" ? LR_USER : null };
    },
    now: () => new Date("2026-09-08T10:00:00Z"),
    ...overrides
  };
  return { deps, log };
}

test("the mapped LR user id determines the session: lookup by id, mint, exchange, all bound to that id", async () => {
  const { deps, log } = fakeDeps();
  assert.deepEqual(await establishLeadRetrievalSessionWithDeps(LR_USER, deps), { ok: true, userId: LR_USER });
  assert.deepEqual(log, [`getUserById:${LR_USER}`, "generateLink:mapped.user@example.com", "verifyOtp:hashed-otp"]);
});

test("the address used for minting is the Auth user's own, read back by id -- a caller cannot supply one", () => {
  const source = readFileSync("lib/platform/establish-session.ts", "utf8");
  assert.match(source, /getAuthUserById\(id\)/);
  assert.equal(/email\s*:\s*string/.test(source.split("export async function establishLeadRetrievalSessionWithDeps")[1]), false,
    "the entry point takes a user id, not an email");
});

test("a link minted for a different user than requested is refused before any exchange", async () => {
  const { deps, log } = fakeDeps({ generateMagicLink: async () => ({ hashedToken: "hashed-otp", userId: OTHER }) });
  assert.deepEqual(await establishLeadRetrievalSessionWithDeps(LR_USER, deps), { ok: false, reason: "SESSION_IDENTITY_MISMATCH" });
  assert.equal(log.some((entry) => entry.startsWith("verifyOtp")), false);
});

test("a session that comes back for a different user is refused", async () => {
  const { deps } = fakeDeps({ verifyOtp: async () => ({ userId: OTHER }) });
  assert.deepEqual(await establishLeadRetrievalSessionWithDeps(LR_USER, deps), { ok: false, reason: "SESSION_ESTABLISH_FAILED" });
  const { deps: none } = fakeDeps({ verifyOtp: async () => null });
  assert.deepEqual(await establishLeadRetrievalSessionWithDeps(LR_USER, none), { ok: false, reason: "SESSION_ESTABLISH_FAILED" });
});

test("no Auth identity, a banned identity, or an identity without an address cannot mint anything", async () => {
  const missing = fakeDeps();
  assert.deepEqual(await establishLeadRetrievalSessionWithDeps(OTHER, missing.deps), { ok: false, reason: "AUTH_IDENTITY_MISSING" });
  assert.deepEqual(missing.log, [`getUserById:${OTHER}`]);

  const wrongId = fakeDeps({ getAuthUserById: async () => ({ id: OTHER, email: "x@example.com", bannedUntil: null }) });
  assert.deepEqual(await establishLeadRetrievalSessionWithDeps(LR_USER, wrongId.deps), { ok: false, reason: "AUTH_IDENTITY_MISSING" });

  const banned = fakeDeps({ getAuthUserById: async () => ({ id: LR_USER, email: "x@example.com", bannedUntil: "2099-01-01T00:00:00Z" }) });
  assert.deepEqual(await establishLeadRetrievalSessionWithDeps(LR_USER, banned.deps), { ok: false, reason: "AUTH_IDENTITY_BANNED" });
  assert.deepEqual(banned.log, [], "a banned identity never reaches minting or exchange");

  const banExpired = fakeDeps({ getAuthUserById: async () => ({ id: LR_USER, email: "x@example.com", bannedUntil: "2020-01-01T00:00:00Z" }) });
  assert.equal((await establishLeadRetrievalSessionWithDeps(LR_USER, banExpired.deps)).ok, true, "an expired ban is not a ban");

  const noEmail = fakeDeps({ getAuthUserById: async () => ({ id: LR_USER, email: null, bannedUntil: null }) });
  assert.deepEqual(await establishLeadRetrievalSessionWithDeps(LR_USER, noEmail.deps), { ok: false, reason: "AUTH_IDENTITY_NO_EMAIL" });

  assert.deepEqual(await establishLeadRetrievalSessionWithDeps("", fakeDeps().deps), { ok: false, reason: "AUTH_IDENTITY_MISSING" });
});

test("a failed mint is a refusal, never a retry with different parameters", async () => {
  let mints = 0;
  const { deps, log } = fakeDeps({
    generateMagicLink: async () => {
      mints += 1;
      return null;
    }
  });
  assert.deepEqual(await establishLeadRetrievalSessionWithDeps(LR_USER, deps), { ok: false, reason: "SESSION_MINT_FAILED" });
  assert.equal(mints, 1, "exactly one mint attempt");
  assert.equal(log.some((entry) => entry.startsWith("verifyOtp")), false, "no exchange after a failed mint");
});

test("the wiring establishes an LR-authority session with no email delivery and no exposed secrets", () => {
  const server = readFileSync("lib/platform/platform-entry-server.ts", "utf8");
  const core = readFileSync("lib/platform/platform-entry-core.ts", "utf8");

  // LR's own Auth project: the app's configured admin + SSR clients, never a Platform Core client.
  assert.match(server, /createAdminClient\(\)/);
  assert.match(server, /createSupabaseRouteAuth\(request\)/);
  assert.equal(/PLATFORM_CORE|platform-core|PLATFORM_SUPABASE/.test(server), false, "no Platform Core Auth involvement");

  // generateLink + verifyOtp only; no inviteUserByEmail / signInWithOtp / resend, which would send mail.
  assert.match(server, /generateLink\(\{ type: "magiclink", email \}\)/);
  assert.match(server, /verifyOtp\(\{ type: "magiclink", token_hash: hashedToken \}\)/);
  assert.equal(/inviteUserByEmail|signInWithOtp|resend\(|sendMagicLink|createUser\(/.test(server), false, "nothing sends mail or creates users");
  assert.match(server, /getUserById\(userId\)/, "the Auth identity is resolved by id");

  // The hashed token and the service-role client never reach a response.
  assert.equal(/hashedToken/.test(core), false, "the handler never sees the OTP");
  assert.equal(/action_link|actionLink/.test(server), false, "no link is built or returned");
  assert.equal(/console\.(log|info|debug)/.test(server + core), false, "nothing on the handoff path is logged");

  // The session is minted only after the entry decision said yes, on the redirect response.
  const decisionIndex = core.indexOf("deps.resolveEntry(");
  const sessionIndex = core.indexOf("deps.establishSession(");
  assert.ok(decisionIndex > -1 && sessionIndex > decisionIndex, "authorization precedes session establishment");
  assert.match(core, /session\.attachCookies\(response\)/);
});
