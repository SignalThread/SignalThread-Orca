// @lr area=api-contract severity=P0 layer=unit category=local-only
/**
 * Lead Retrieval's only runtime call to Platform: claiming a one-time handoff.
 *
 * Pins the wire contract (POST {PLATFORM_APP_URL}/api/launch/lead-retrieval/claim
 * with {handoff, event_id}), the trust boundary on the answer (three canonical
 * uuids for this product, nothing else), the mapping of Platform's status codes
 * to stable local reasons, and the safety of the configured base URL.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_CLAIM_TIMEOUT_MS,
  LEAD_RETRIEVAL_PRODUCT_KEY,
  buildPlatformLaunchUrl,
  claimPlatformHandoff,
  resolvePlatformAppUrl
} from "../lib/platform/platform-claim-client";

/** A minimal process.env for one assertion. LR's ProcessEnv augmentation requires NODE_ENV, so a partial view needs the cast. */
function env(vars: Record<string, string>): NodeJS.ProcessEnv {
  return { ...vars } as unknown as NodeJS.ProcessEnv;
}


const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const EVENT = "ae9942ba-5759-486b-b591-f1b5ed223370";
const CORRELATOR = "a".repeat(64);
const PROD_ENV = env({ PLATFORM_APP_URL: "https://platform.signalthread.ai", NODE_ENV: "production" });

type Call = { url: string; init: RequestInit };
function fakeFetch(status: number, body: unknown, calls: Call[] = []) {
  return {
    calls,
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" }
      });
    }
  };
}

test("the Platform base URL is server-only, must be HTTPS in production, and carries no query or fragment", () => {
  assert.equal(resolvePlatformAppUrl(env({})), null, "unconfigured is not launchable, not a guess");
  assert.equal(resolvePlatformAppUrl(PROD_ENV), "https://platform.signalthread.ai");
  assert.equal(
    resolvePlatformAppUrl(env({ PLATFORM_APP_URL: "https://platform.signalthread.ai/" })),
    "https://platform.signalthread.ai",
    "trailing slash trimmed"
  );
  assert.equal(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: "http://platform.example", NODE_ENV: "production" })), null, "plain HTTP refused in production");
  assert.equal(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: "http://localhost:3001", NODE_ENV: "development" })), "http://localhost:3001", "local dev may use HTTP");
  assert.equal(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: "https://p.example?x=1" })), null);
  assert.equal(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: "https://p.example#frag" })), null);
  assert.equal(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: "javascript:alert(1)" })), null);
  assert.equal(resolvePlatformAppUrl(env({ PLATFORM_APP_URL: "not a url" })), null);
  // Only the server-side name is honoured: no NEXT_PUBLIC_ fallback for the identity endpoint.
  assert.equal(resolvePlatformAppUrl(env({ NEXT_PUBLIC_PLATFORM_APP_URL: "https://platform.signalthread.ai" })), null);
});

test("the launch URL is Platform's launch route for lead-retrieval with only the event id and correlator", () => {
  assert.equal(
    buildPlatformLaunchUrl(EVENT.toUpperCase(), CORRELATOR, PROD_ENV),
    `https://platform.signalthread.ai/api/launch/lead-retrieval?event_id=${EVENT}&state=${CORRELATOR}`
  );
  assert.equal(buildPlatformLaunchUrl(EVENT, null, PROD_ENV), `https://platform.signalthread.ai/api/launch/lead-retrieval?event_id=${EVENT}`);
  assert.equal(buildPlatformLaunchUrl("not-a-uuid", CORRELATOR, PROD_ENV), null);
  assert.equal(buildPlatformLaunchUrl(EVENT, "not-a-correlator", PROD_ENV), null, "only SHA-256 hex may travel");
  assert.equal(buildPlatformLaunchUrl(EVENT, CORRELATOR, env({})), null);
  assert.equal(LEAD_RETRIEVAL_PRODUCT_KEY, "lead-retrieval");
});

test("a successful claim posts the token to Platform's claim route and returns the canonical context", async () => {
  const { fetch, calls } = fakeFetch(200, {
    platform_user_id: USER.toUpperCase(),
    organization_id: ORG,
    event_id: EVENT,
    product: "lead-retrieval"
  });
  const result = await claimPlatformHandoff({ handoff: "tok_123", eventId: EVENT }, { fetch, env: PROD_ENV });
  assert.deepEqual(result, {
    ok: true,
    context: { platformUserId: USER, platformOrganizationId: ORG, platformEventId: EVENT }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://platform.signalthread.ai/api/launch/lead-retrieval/claim");
  assert.equal(calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { handoff: "tok_123", event_id: EVENT });
  assert.equal(calls[0].init.redirect, "error", "a redirected claim endpoint is never followed");
  assert.equal(calls[0].init.cache, "no-store");
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers["content-type"], "application/json");
  assert.equal("authorization" in headers || "cookie" in headers, false, "no credentials travel to Platform");
});

test("Platform's status codes map to stable local reasons and its reason code is preserved when well-formed", async () => {
  const claim = (status: number, body: unknown) =>
    claimPlatformHandoff({ handoff: "tok", eventId: EVENT }, { fetch: fakeFetch(status, body).fetch, env: PROD_ENV });

  assert.deepEqual(await claim(401, { reason: "HANDOFF_INVALID" }), { ok: false, reason: "HANDOFF_INVALID", platformReason: "HANDOFF_INVALID" });
  assert.deepEqual(await claim(401, { reason: "HANDOFF_EXPIRED" }), { ok: false, reason: "HANDOFF_EXPIRED", platformReason: "HANDOFF_EXPIRED" });
  assert.deepEqual(await claim(401, {}), { ok: false, reason: "HANDOFF_INVALID" });
  assert.deepEqual(await claim(403, { reason: "NOT_ENTITLED" }), { ok: false, reason: "PLATFORM_DENIED", platformReason: "NOT_ENTITLED" });
  assert.deepEqual(await claim(404, { reason: "EVENT_NOT_FOUND" }), { ok: false, reason: "PLATFORM_DENIED", platformReason: "EVENT_NOT_FOUND" });
  assert.deepEqual(await claim(400, { reason: "INVALID_REQUEST" }), { ok: false, reason: "PLATFORM_DENIED", platformReason: "INVALID_REQUEST" });
  assert.deepEqual(await claim(403, { reason: "<script>" }), { ok: false, reason: "PLATFORM_DENIED" }, "malformed reason codes are dropped");
  assert.deepEqual(await claim(500, { reason: "INTERNAL_ERROR" }), { ok: false, reason: "PLATFORM_UNAVAILABLE" });
  assert.deepEqual(await claim(302, undefined), { ok: false, reason: "PLATFORM_UNAVAILABLE" });
});

test("the claim answer is trusted only for its shape: this product, three canonical uuids", async () => {
  const claim = (body: unknown) =>
    claimPlatformHandoff({ handoff: "tok", eventId: EVENT }, { fetch: fakeFetch(200, body).fetch, env: PROD_ENV });
  const good = { platform_user_id: USER, organization_id: ORG, event_id: EVENT, product: "lead-retrieval" };

  assert.deepEqual(await claim({ ...good, product: "pulse" }), { ok: false, reason: "PLATFORM_UNAVAILABLE" }, "another product's claim is unusable");
  assert.deepEqual(await claim({ ...good, product: undefined }), { ok: false, reason: "PLATFORM_UNAVAILABLE" });
  assert.deepEqual(await claim({ ...good, platform_user_id: "ali@example.com" }), { ok: false, reason: "PLATFORM_UNAVAILABLE" }, "an email is never an identity");
  assert.deepEqual(await claim({ ...good, organization_id: "acme" }), { ok: false, reason: "PLATFORM_UNAVAILABLE" }, "a slug is never an identity");
  assert.deepEqual(await claim({ ...good, event_id: 42 }), { ok: false, reason: "PLATFORM_UNAVAILABLE" });
  assert.deepEqual(await claim("not json object"), { ok: false, reason: "PLATFORM_UNAVAILABLE" });
  assert.deepEqual(await claim(null), { ok: false, reason: "PLATFORM_UNAVAILABLE" });
});

test("no configured Platform means nothing is sent; a network failure or timeout is PLATFORM_UNAVAILABLE", async () => {
  const { fetch, calls } = fakeFetch(200, {});
  assert.deepEqual(await claimPlatformHandoff({ handoff: "tok", eventId: EVENT }, { fetch, env: env({}) }), {
    ok: false,
    reason: "PLATFORM_NOT_CONFIGURED"
  });
  assert.equal(calls.length, 0);

  const failing = async () => {
    throw new Error("ECONNREFUSED");
  };
  assert.deepEqual(await claimPlatformHandoff({ handoff: "tok", eventId: EVENT }, { fetch: failing, env: PROD_ENV }), {
    ok: false,
    reason: "PLATFORM_UNAVAILABLE"
  });

  const hanging = (_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  const started = Date.now();
  assert.deepEqual(await claimPlatformHandoff({ handoff: "tok", eventId: EVENT }, { fetch: hanging, env: PROD_ENV, timeoutMs: 20 }), {
    ok: false,
    reason: "PLATFORM_UNAVAILABLE"
  });
  assert.ok(Date.now() - started < DEFAULT_CLAIM_TIMEOUT_MS, "the configured timeout, not the default, bounded the wait");
});

test("the client holds no Platform Core credentials and never opens a Platform Core session", () => {
  const source = readFileSync("lib/platform/platform-claim-client.ts", "utf8");
  assert.equal(/createClient|createServerClient|@supabase/.test(source), false, "no Supabase client toward Platform");
  assert.equal(/SERVICE_ROLE|PLATFORM_CORE_SUPABASE|verifyOtp|exchangeCodeForSession/.test(source), false);
});
