import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  claimHandoff,
  isHandoffFresh,
  parseClaimRequest,
  resolveHandoffMaxAgeSeconds,
  type ClaimDeps,
  type VerifiedHandoff,
} from "./handoff-claim-core";
import type { LaunchAuthorization } from "./launch-decision";

/**
 * The claim path is what turns a one-time token into canonical context for a
 * product that owns its own auth authority (Pulse). These tests drive the pure
 * orchestration with fakes for GoTrue and the registry, so the order of checks,
 * the freshness bound, and the fact that context is *re-derived* rather than
 * carried by the token are all asserted directly.
 */

const USER = "bfccbd09-700c-4146-992f-8827f32aa6fd";
const ACME = "7437a82f-bdc9-425d-9f1c-5525930b43bd";
const EVENT = "ae9942ba-5759-486b-b591-f1b5ed223370";
const TOKEN = "pkce_0123456789abcdef0123456789abcdef";
const NOW = new Date("2026-09-05T12:00:00.000Z");

function authorized(): LaunchAuthorization {
  return { status: "AUTHORIZED", organizationId: ACME, eventId: EVENT, productKey: "pulse" };
}

type Calls = { verify: string[]; revoke: string[]; authorize: unknown[] };

function fakeDeps(o: {
  verified?: VerifiedHandoff | null | (() => VerifiedHandoff | null);
  decision?: LaunchAuthorization;
  now?: Date;
  maxAgeSeconds?: number;
} = {}): { deps: ClaimDeps; calls: Calls } {
  const calls: Calls = { verify: [], revoke: [], authorize: [] };
  const configured = o.verified;
  const verifiedFactory: () => VerifiedHandoff | null =
    typeof configured === "function"
      ? configured
      : () => (configured === undefined ? { userId: USER, issuedAt: new Date(NOW.getTime() - 5_000), accessToken: "at" } : configured);
  const deps: ClaimDeps = {
    verifyHandoff: async (token) => {
      calls.verify.push(token);
      return verifiedFactory();
    },
    revokeSession: async (at) => {
      calls.revoke.push(at);
    },
    authorize: async (input) => {
      calls.authorize.push(input);
      return o.decision ?? authorized();
    },
    now: () => o.now ?? NOW,
    maxAgeSeconds: o.maxAgeSeconds,
  };
  return { deps, calls };
}

const REQUEST = { productKey: "pulse", handoff: TOKEN, eventId: EVENT };

test("a valid, fresh token yields exactly the re-derived canonical context", async () => {
  const { deps, calls } = fakeDeps();
  const result = await claimHandoff(REQUEST, deps);
  assert.deepEqual(result, {
    status: "CLAIMED",
    platformUserId: USER,
    organizationId: ACME,
    eventId: EVENT,
    productKey: "pulse",
  });
  // Authorization ran for the verified user, this product, and the requested event.
  assert.deepEqual(calls.authorize, [{ userId: USER, productKey: "pulse", eventId: EVENT }]);
  // The verification session was revoked.
  assert.deepEqual(calls.revoke, ["at"]);
});

test("an invalid, expired or replayed token is refused before any authorization runs", async () => {
  const { deps, calls } = fakeDeps({ verified: null });
  const result = await claimHandoff(REQUEST, deps);
  assert.deepEqual(result, { status: "DENIED", reason: "HANDOFF_INVALID", httpStatus: 401 });
  assert.equal(calls.authorize.length, 0, "no registry read may happen for an unverified token");
});

test("a token is one-time: the second claim of the same token fails", async () => {
  // GoTrue rejects the second exchange; the fake models that by answering once.
  let remaining = 1;
  const { deps } = fakeDeps({
    verified: () => (remaining-- > 0 ? { userId: USER, issuedAt: NOW, accessToken: "at" } : null),
  });
  assert.equal((await claimHandoff(REQUEST, deps)).status, "CLAIMED");
  const replay = await claimHandoff(REQUEST, deps);
  assert.equal(replay.status === "DENIED" && replay.reason, "HANDOFF_INVALID");
});

test("a token older than the freshness bound is refused even though GoTrue accepted it", async () => {
  const { deps, calls } = fakeDeps({
    verified: { userId: USER, issuedAt: new Date(NOW.getTime() - 301_000), accessToken: "at" },
    maxAgeSeconds: 300,
  });
  const result = await claimHandoff(REQUEST, deps);
  assert.deepEqual(result, { status: "DENIED", reason: "HANDOFF_EXPIRED", httpStatus: 401 });
  assert.equal(calls.authorize.length, 0);
  assert.deepEqual(calls.revoke, ["at"], "the verification session is revoked on denial too");
});

test("a token with no issue timestamp fails closed", async () => {
  const { deps } = fakeDeps({ verified: { userId: USER, issuedAt: null, accessToken: "at" } });
  const result = await claimHandoff(REQUEST, deps);
  assert.equal(result.status === "DENIED" && result.reason, "HANDOFF_EXPIRED");
});

test("the token is bound to the product: a claim for a product the org lacks is denied", async () => {
  // Acme holds Orca and Pulse; a claim for a product it does not hold re-runs
  // authorization for *that* product and is refused. The token carries no product.
  const { deps, calls } = fakeDeps({
    decision: { status: "DENIED", reason: "PRODUCT_NOT_ENTITLED", hint: "" },
  });
  const result = await claimHandoff({ ...REQUEST, productKey: "housing" }, deps);
  assert.deepEqual(result, { status: "DENIED", reason: "PRODUCT_NOT_ENTITLED", httpStatus: 403 });
  assert.deepEqual(calls.authorize, [{ userId: USER, productKey: "housing", eventId: EVENT }]);
});

test("changing the event in the claim cannot enter an event the user could not launch", async () => {
  const { deps } = fakeDeps({ decision: { status: "DENIED", reason: "ORG_NOT_MEMBER", hint: "" } });
  const other = "11111111-2222-4333-8444-555555555555";
  const result = await claimHandoff({ ...REQUEST, eventId: other }, deps);
  assert.deepEqual(result, { status: "DENIED", reason: "ORG_NOT_MEMBER", httpStatus: 403 });
});

test("an archived or missing event denies at claim time as well", async () => {
  for (const [reason, httpStatus] of [["EVENT_NOT_LAUNCHABLE", 403], ["EVENT_NOT_FOUND", 404]] as const) {
    const { deps } = fakeDeps({ decision: { status: "DENIED", reason, hint: "" } });
    assert.deepEqual(await claimHandoff(REQUEST, deps), { status: "DENIED", reason, httpStatus });
  }
});

test("canonical user, organization and event come from verification and the registry, never the request", async () => {
  // The request names an event; the organization is not an input anywhere. The
  // returned organization is whatever authorization derived from the event.
  const { deps } = fakeDeps({
    decision: { status: "AUTHORIZED", organizationId: ACME, eventId: EVENT, productKey: "pulse" },
  });
  const result = await claimHandoff({ ...REQUEST, eventId: EVENT.toUpperCase() as string }, deps);
  assert.equal(result.status === "CLAIMED" && result.organizationId, ACME);
  assert.equal(result.status === "CLAIMED" && result.platformUserId, USER);
});

test("a failing revocation never changes the outcome", async () => {
  const { deps } = fakeDeps();
  deps.revokeSession = async () => {
    throw new Error("network");
  };
  assert.equal((await claimHandoff(REQUEST, deps)).status, "CLAIMED");
});

test("freshness bound: within window passes, beyond fails, skew of up to 30s is tolerated", () => {
  assert.equal(isHandoffFresh(new Date(NOW.getTime() - 299_000), NOW, 300), true);
  assert.equal(isHandoffFresh(new Date(NOW.getTime() - 301_000), NOW, 300), false);
  assert.equal(isHandoffFresh(new Date(NOW.getTime() + 20_000), NOW, 300), true);
  assert.equal(isHandoffFresh(new Date(NOW.getTime() + 60_000), NOW, 300), false);
  assert.equal(isHandoffFresh(new Date("not a date"), NOW, 300), false);
  assert.equal(isHandoffFresh(null, NOW, 300), false);
});

test("the freshness bound is short by default and capped at one hour", () => {
  assert.equal(resolveHandoffMaxAgeSeconds(undefined), 300);
  assert.equal(resolveHandoffMaxAgeSeconds("120"), 120);
  assert.equal(resolveHandoffMaxAgeSeconds("0"), 300);
  assert.equal(resolveHandoffMaxAgeSeconds("-5"), 300);
  assert.equal(resolveHandoffMaxAgeSeconds("86400"), 300);
  assert.equal(resolveHandoffMaxAgeSeconds("abc"), 300);
});

test("the request parser accepts only a token and a canonical event id", () => {
  assert.deepEqual(parseClaimRequest("pulse", { handoff: TOKEN, event_id: EVENT }), REQUEST);
  assert.deepEqual(parseClaimRequest("Pulse", { handoff: TOKEN, event_id: EVENT.toUpperCase() }), REQUEST);
  assert.equal(parseClaimRequest("pulse", null), null);
  assert.equal(parseClaimRequest("pulse", { handoff: TOKEN }), null);
  assert.equal(parseClaimRequest("pulse", { handoff: "short", event_id: EVENT }), null);
  assert.equal(parseClaimRequest("pulse", { handoff: TOKEN, event_id: "acme-2026" }), null);
  assert.equal(parseClaimRequest("pulse", { handoff: `${TOKEN} `, event_id: EVENT }), null);
  assert.equal(parseClaimRequest("../x", { handoff: TOKEN, event_id: EVENT }), null);
  // Tampering: a token with injected characters is rejected before GoTrue sees it.
  assert.equal(parseClaimRequest("pulse", { handoff: `${TOKEN}&x=1`, event_id: EVENT }), null);
});

test("an organization id in the claim body is ignored: it is not part of the parsed request", () => {
  const parsed = parseClaimRequest("pulse", { handoff: TOKEN, event_id: EVENT, organization_id: "9d2a1c3e-1111-4222-8333-444455556666" });
  assert.deepEqual(parsed, REQUEST);
  assert.equal("organizationId" in (parsed ?? {}), false);
});

// ---------------------------------------------------------------------------
// Structural guards over the wired implementation and the route.
// ---------------------------------------------------------------------------

const CLAIM = readFileSync("lib/server/handoff-claim.ts", "utf8");
const CORE = readFileSync("lib/server/handoff-claim-core.ts", "utf8");
const ROUTE = readFileSync("app/api/launch/[product]/claim/route.ts", "utf8");
const MIDDLEWARE = readFileSync("lib/supabase/middleware.ts", "utf8");
const REGISTRY = readFileSync("lib/server/product-registry.ts", "utf8");

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
}

test("verification happens before authorization, and authorization before any context is returned", () => {
  const verifyAt = CORE.indexOf("deps.verifyHandoff(");
  const freshAt = CORE.indexOf("isHandoffFresh(verified.issuedAt");
  const authAt = CORE.indexOf("deps.authorize(");
  const claimedAt = CORE.lastIndexOf('status: "CLAIMED"');
  assert.ok(verifyAt > 0 && freshAt > verifyAt && authAt > freshAt && claimedAt > authAt);
});

test("the token is exchanged with a throwaway anon client that persists nothing", () => {
  assert.match(CLAIM, /persistSession:\s*false/);
  assert.match(CLAIM, /autoRefreshToken:\s*false/);
  assert.match(CLAIM, /requirePlatformAuthConfig\(\)/, "anon key, never the service role, exchanges the token");
  assert.equal(/cookies\(\)|createServerClient|createPlatformServerClient/.test(codeOnly(CLAIM)), false,
    "no cookie jar may be attached to the verification session");
});

test("the verification session is revoked with the admin API", () => {
  assert.match(CLAIM, /admin\.auth\.admin\.signOut\(/);
});

test("only own-authority products may claim through Platform", () => {
  assert.match(CLAIM, /getProductAuthAuthority\(request\.productKey\)\s*!==\s*"own"/);
  assert.match(REGISTRY, /pulse:\s*"own"/);
  assert.match(REGISTRY, /"lead-retrieval":\s*"own"/);
  assert.match(REGISTRY, /orca:\s*"platform-core"/);
});

test("the claim route reads no Platform session and trusts only the token and event id", () => {
  const code = codeOnly(ROUTE);
  assert.equal(/requireUser|createPlatformServerClient|cookies/.test(code), false);
  assert.match(code, /parseClaimRequest\(product, body\)/);
  for (const forbidden of ["organization_id", "return_to", "product:", "next"]) {
    assert.equal(code.includes(`body.${forbidden}`) || code.includes(`searchParams.get("${forbidden}")`), false,
      `${forbidden} must never be read from the request`);
  }
  assert.match(ROUTE, /"Cache-Control":\s*"no-store"/);
});

test("the claim endpoint is the only /api/launch path reachable without a Platform session", () => {
  assert.match(MIDDLEWARE, /\/api\\\/launch\\\/\[a-z0-9-\]\+\\\/claim\$/);
});

test("the wired claim path is server-only and never logs", () => {
  assert.match(CLAIM, /^import "server-only";/m);
  for (const src of [CLAIM, CORE, ROUTE]) {
    assert.equal(/console\.(log|info|warn|error|debug)/.test(codeOnly(src)), false);
  }
});

test("Pulse's handoff URL carries the token to /platform-entry and no Supabase callback", async () => {
  const { buildProductHandoffUrl } = await import("./product-registry");
  const url = buildProductHandoffUrl({ productKey: "pulse", appUrl: "https://voice.signalthread.ai", hashedToken: TOKEN, eventId: EVENT });
  assert.equal(url, `https://voice.signalthread.ai/platform-entry?handoff=${TOKEN}&event_id=${EVENT}`);
  const orca = buildProductHandoffUrl({ productKey: "orca", appUrl: "https://orca.signalthread.ai", hashedToken: TOKEN, eventId: EVENT });
  assert.equal(
    orca,
    `https://orca.signalthread.ai/auth/callback?token_hash=${TOKEN}&type=magiclink&next=%2Fplatform-entry%3Fevent_id%3D${EVENT}`,
  );
  assert.equal(buildProductHandoffUrl({ productKey: "housing", appUrl: "https://h", hashedToken: TOKEN, eventId: EVENT }), null);
});
