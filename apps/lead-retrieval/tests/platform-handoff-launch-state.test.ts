// @lr area=security severity=P0 layer=unit category=local-only
/**
 * Browser-bound launch state for the Platform → Lead Retrieval handoff.
 *
 * The handoff token is a bearer credential, so redemption must be conditional on
 * state this browser established before the token existed. These tests pin the
 * shape of that state, its lifetime, its binding to the event, and the split
 * between the secret nonce (cookie only) and the public correlator (URL only).
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import test from "node:test";
import {
  LAUNCH_STATE_COOKIE,
  LAUNCH_STATE_PATH,
  LAUNCH_STATE_TTL_SECONDS,
  clearLaunchStateCookie,
  createLaunchState,
  isTopLevelNavigation,
  launchStateCookieSecure,
  launchStateCorrelator,
  launchStateCorrelatorMatches,
  launchStateMatches,
  parseLaunchState,
  readLaunchState,
  serializeLaunchState,
  setLaunchStateCookie
} from "../lib/platform/launch-state";

/** A minimal process.env for one assertion. LR's ProcessEnv augmentation requires NODE_ENV, so a partial view needs the cast. */
function env(vars: Record<string, string>): NodeJS.ProcessEnv {
  return { ...vars } as unknown as NodeJS.ProcessEnv;
}


const EVENT = "ae9942ba-5759-486b-b591-f1b5ed223370";
const NOW = new Date("2026-09-08T10:00:00Z");

test("a launch state is a fresh 256-bit nonce bound to one canonical event with a 120s lifetime", () => {
  const a = createLaunchState(EVENT, NOW);
  const b = createLaunchState(EVENT.toUpperCase(), NOW);
  assert.match(a.nonce, /^[0-9a-f]{64}$/);
  assert.notEqual(a.nonce, b.nonce, "every launch gets its own nonce");
  assert.equal(b.eventId, EVENT, "event id is normalized to lowercase");
  assert.equal(a.expiresAt, Math.floor(NOW.getTime() / 1000) + LAUNCH_STATE_TTL_SECONDS);
  assert.equal(LAUNCH_STATE_TTL_SECONDS, 120);
});

test("serialize/parse round-trips and enforces expiry server-side from the embedded timestamp", () => {
  const state = createLaunchState(EVENT, NOW);
  const raw = serializeLaunchState(state);
  assert.deepEqual(parseLaunchState(raw, NOW), { status: "PRESENT", state });
  const justBefore = new Date((state.expiresAt - 1) * 1000);
  assert.equal(parseLaunchState(raw, justBefore).status, "PRESENT");
  const atExpiry = new Date(state.expiresAt * 1000);
  assert.equal(parseLaunchState(raw, atExpiry).status, "EXPIRED", "expiry instant itself is expired");
});

test("malformed, tampered or absent state never parses as PRESENT", () => {
  const state = createLaunchState(EVENT, NOW);
  const raw = serializeLaunchState(state);
  assert.equal(parseLaunchState(undefined, NOW).status, "MISSING");
  assert.equal(parseLaunchState("", NOW).status, "MISSING");
  assert.equal(parseLaunchState("garbage", NOW).status, "INVALID");
  assert.equal(parseLaunchState(raw.replace(/^v1/, "v0"), NOW).status, "INVALID", "unknown version");
  assert.equal(parseLaunchState(raw.replace(state.nonce, "zz" + state.nonce.slice(2)), NOW).status, "INVALID", "non-hex nonce");
  assert.equal(parseLaunchState(raw.replace(EVENT, "not-a-uuid"), NOW).status, "INVALID", "event must be canonical");
  assert.equal(parseLaunchState(raw + ".extra", NOW).status, "INVALID", "extra segments");
  assert.equal(parseLaunchState(raw.replace(String(state.expiresAt), "9".repeat(13)), NOW).status, "INVALID", "expiry out of range");
});

test("state is bound to the event it was created for", () => {
  const state = createLaunchState(EVENT, NOW);
  assert.equal(launchStateMatches(state, EVENT), true);
  assert.equal(launchStateMatches(state, EVENT.toUpperCase()), true, "case-insensitive on canonical uuids");
  assert.equal(launchStateMatches(state, "7d6a9f0e-2f4c-4b1e-9a3d-1c2b3a4d5e6f"), false);
});

test("the correlator is SHA-256 of the nonce and only the correlator may travel", () => {
  const state = createLaunchState(EVENT, NOW);
  const expected = createHash("sha256").update(state.nonce, "utf8").digest("hex");
  assert.equal(launchStateCorrelator(state), expected);
  assert.notEqual(launchStateCorrelator(state), state.nonce, "the secret never equals the public value");
  assert.equal(launchStateCorrelatorMatches(state, expected), true);
  assert.equal(launchStateCorrelatorMatches(state, expected.toUpperCase()), true, "hex case is not significant");
  assert.equal(launchStateCorrelatorMatches(state, state.nonce), false, "the nonce itself is not a valid correlator");
  assert.equal(launchStateCorrelatorMatches(state, expected.slice(0, 63) + (expected.endsWith("0") ? "1" : "0")), false);
  assert.equal(launchStateCorrelatorMatches(state, null), false);
  assert.equal(launchStateCorrelatorMatches(state, ""), false);
  assert.equal(launchStateCorrelatorMatches(state, "not-hex"), false);
  // A correlator for a *different* browser's state never matches this one.
  const other = createLaunchState(EVENT, NOW);
  assert.equal(launchStateCorrelatorMatches(state, launchStateCorrelator(other)), false);
});

test("the cookie is HttpOnly, host-only, SameSite=Lax, scoped to /platform-entry, and cleared with identical scope", () => {
  const state = createLaunchState(EVENT, NOW);
  const set = new NextResponse(null);
  setLaunchStateCookie(set, state);
  const written = set.cookies.get(LAUNCH_STATE_COOKIE);
  assert.ok(written);
  assert.equal(written.value, serializeLaunchState(state));
  assert.equal(written.path, LAUNCH_STATE_PATH);
  assert.equal(LAUNCH_STATE_PATH, "/platform-entry");
  assert.equal(written.httpOnly, true);
  assert.equal(written.sameSite, "lax");
  assert.equal(written.domain, undefined, "no Domain attribute: never a parent-domain cookie");
  assert.equal(written.maxAge, LAUNCH_STATE_TTL_SECONDS);

  const cleared = new NextResponse(null);
  clearLaunchStateCookie(cleared);
  const removed = cleared.cookies.get(LAUNCH_STATE_COOKIE);
  assert.ok(removed);
  assert.equal(removed.value, "");
  assert.equal(removed.maxAge, 0);
  assert.equal(removed.path, LAUNCH_STATE_PATH);
  assert.equal(removed.httpOnly, true);
  assert.equal(removed.sameSite, "lax");
});

test("Secure follows the deployment's own URL scheme, with production as the fallback", () => {
  assert.equal(launchStateCookieSecure(env({ NEXT_PUBLIC_SITE_URL: "https://lr.signalthread.ai" })), true);
  assert.equal(launchStateCookieSecure(env({ NEXT_PUBLIC_SITE_URL: "http://localhost:3003" })), false);
  assert.equal(launchStateCookieSecure(env({ NODE_ENV: "production" })), true);
  assert.equal(launchStateCookieSecure(env({ NODE_ENV: "development" })), false);
  assert.equal(launchStateCookieSecure(env({ NEXT_PUBLIC_SITE_URL: "nonsense", NODE_ENV: "production" })), true);
});

test("state is read back from the request cookie, and only top-level navigations count", () => {
  const state = createLaunchState(EVENT, NOW);
  const request = new NextRequest("https://lr.signalthread.ai/platform-entry", {
    headers: { cookie: `${LAUNCH_STATE_COOKIE}=${serializeLaunchState(state)}`, "sec-fetch-dest": "document" }
  });
  assert.deepEqual(readLaunchState(request, NOW), { status: "PRESENT", state });
  assert.equal(readLaunchState(new NextRequest("https://lr.signalthread.ai/platform-entry"), NOW).status, "MISSING");

  assert.equal(isTopLevelNavigation(request), true);
  assert.equal(isTopLevelNavigation(new NextRequest("https://lr.signalthread.ai/platform-entry")), true, "header absent: allowed");
  for (const dest of ["image", "iframe", "empty", "script", "style"]) {
    const sub = new NextRequest("https://lr.signalthread.ai/platform-entry", { headers: { "sec-fetch-dest": dest } });
    assert.equal(isTopLevelNavigation(sub), false, `${dest} is not a navigation`);
  }
});
