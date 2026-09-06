import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isValidLaunchState, readLaunchState } from "./launch-state-relay";
import { buildProductHandoffUrl } from "./product-registry";

/**
 * The relayed correlator: Platform carries a product's browser-bound launch state
 * through authorization and hands it back unchanged, without ever letting it
 * influence a decision.
 */

const TOKEN = "pkce_0123456789abcdef0123456789abcdef";
const EVENT = "ae9942ba-5759-486b-b591-f1b5ed223370";
/** What Pulse sends: SHA-256 of the secret it keeps in its own HttpOnly cookie. */
const STATE = "9f2c4a7b1e8d0f36a5c9b2e4d7f1a3c68b0d5e9f2a4c7b1e8d0f36a5c9b2e4d7";

test("an opaque, bounded, unreserved-character value is accepted", () => {
  assert.equal(isValidLaunchState(STATE), true);
  assert.equal(isValidLaunchState("A".repeat(16)), true);
  assert.equal(isValidLaunchState("A".repeat(256)), true);
  assert.equal(isValidLaunchState("abc-DEF_123.~"), false, "too short to be unguessable");
});

test("anything that would not survive a byte-identical round trip is refused", () => {
  for (const bad of [
    "",
    "A".repeat(15),
    "A".repeat(257),
    `${STATE} `,
    `${STATE}&handoff=x`,
    `${STATE}/../..`,
    `${STATE}%20`,
    "a b c d e f g h i j",
    "<script>alert(1)</script>",
    null,
    undefined,
    42,
    {},
  ]) {
    assert.equal(isValidLaunchState(bad as unknown), false, JSON.stringify(bad));
  }
});

test("absent, valid and malformed are distinguished, so a bound launch never silently loses its state", () => {
  assert.deepEqual(readLaunchState(null), { status: "ABSENT" });
  assert.deepEqual(readLaunchState(""), { status: "ABSENT" });
  assert.deepEqual(readLaunchState(STATE), { status: "VALID", state: STATE });
  assert.deepEqual(readLaunchState("nope"), { status: "MALFORMED" });
});

test("the correlator is echoed back byte-identical on an own-authority handoff", () => {
  const url = buildProductHandoffUrl({ productKey: "pulse", appUrl: "https://voice.signalthread.ai", hashedToken: TOKEN, eventId: EVENT, launchState: STATE });
  assert.equal(url, `https://voice.signalthread.ai/platform-entry?handoff=${TOKEN}&event_id=${EVENT}&state=${STATE}`);
  assert.equal(new URL(url!).searchParams.get("state"), STATE, "round-trips unchanged");
});

test("a launch without a correlator still hands off, unchanged from before", () => {
  const url = buildProductHandoffUrl({ productKey: "pulse", appUrl: "https://voice.signalthread.ai", hashedToken: TOKEN, eventId: EVENT });
  assert.equal(url, `https://voice.signalthread.ai/platform-entry?handoff=${TOKEN}&event_id=${EVENT}`);
  assert.equal(new URL(url!).searchParams.has("state"), false);
});

test("a malformed correlator yields no handoff URL at all, rather than one without it", () => {
  assert.equal(
    buildProductHandoffUrl({ productKey: "pulse", appUrl: "https://voice.signalthread.ai", hashedToken: TOKEN, eventId: EVENT, launchState: "short" }),
    null,
  );
});

test("a platform-core product's callback URL is untouched by the relay", () => {
  // Orca shares this app's auth authority; it has no separate browser binding to
  // correlate, so no `state` may appear in its callback.
  const url = buildProductHandoffUrl({ productKey: "orca", appUrl: "https://orca.signalthread.ai", hashedToken: TOKEN, eventId: EVENT, launchState: STATE });
  assert.equal(new URL(url!).searchParams.has("state"), false);
  assert.match(url!, /\/auth\/callback\?token_hash=/);
  assert.equal(url!.includes(STATE), false);
});

// ---------------------------------------------------------------------------
// Structural: the correlator must never reach a decision.
// ---------------------------------------------------------------------------

const LAUNCH = readFileSync("app/api/launch/[product]/route.ts", "utf8");
const AUTHZ = readFileSync("lib/server/product-launch.ts", "utf8");
const DECISION = readFileSync("lib/server/launch-decision.ts", "utf8");
const CLAIM_CORE = readFileSync("lib/server/handoff-claim-core.ts", "utf8");
const CLAIM_ROUTE = readFileSync("app/api/launch/[product]/claim/route.ts", "utf8");
const RELAY = readFileSync("lib/server/launch-state-relay.ts", "utf8");

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
}

test("authorization never receives the correlator", () => {
  assert.match(LAUNCH, /authorizeProductLaunch\(\{ userId: user\.id, productKey, eventId \}\)/);
  for (const source of [AUTHZ, DECISION]) {
    assert.equal(/launchState|searchParams\.get\("state"\)|\bstate\b\s*[:,)]/.test(codeOnly(source)), false,
      "the authorization path must not mention a launch correlator");
  }
});

test("the correlator is read before the sign-in bounce and applied only after authorization", () => {
  const readAt = LAUNCH.indexOf("readLaunchState(request.nextUrl.searchParams.get(\"state\"))");
  const bounceAt = LAUNCH.indexOf("signIn.searchParams.set(\"next\"");
  const authorizeAt = LAUNCH.indexOf("authorizeProductLaunch(");
  const mintAt = LAUNCH.indexOf("mintProductHandoff(");
  assert.ok(readAt > 0 && bounceAt > readAt, "the sign-in bounce must be able to preserve it");
  assert.ok(authorizeAt > readAt && mintAt > authorizeAt, "authorization still precedes minting");
  // The only use downstream is the mint's relay argument.
  const afterAuthorize = LAUNCH.slice(authorizeAt);
  assert.match(afterAuthorize, /launchState: launchState\.status === "VALID" \? launchState\.state : null/);
});

test("the correlator is never stored, compared, or logged by Platform", () => {
  for (const source of [RELAY, LAUNCH]) {
    const code = codeOnly(source);
    assert.equal(/console\.(log|info|warn|error|debug)/.test(code), false);
    assert.equal(/\.from\(|insert\(|upsert\(|localStorage|redis|cache\.set/.test(code), false,
      "a correlator must not be persisted anywhere");
  }
  // No comparison of the value against anything: Platform cannot know the secret.
  assert.equal(/timingSafeEqual|createHash|=== *state\b/.test(codeOnly(RELAY)), false);
});

test("the claim endpoint neither accepts nor returns a correlator", () => {
  // Claiming re-derives everything from the token and the registry; correlation is
  // finished by then and belongs entirely to the product.
  for (const source of [CLAIM_CORE, CLAIM_ROUTE]) {
    assert.equal(/launchState|"state"|'state'/.test(codeOnly(source)), false);
  }
});
