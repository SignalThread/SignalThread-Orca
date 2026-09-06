import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Security contract for Orca's auth callback as a cross-subdomain handoff receiver.
 *
 * The callback turns a one-time token into a real session, so its refusals matter
 * as much as its success path. Assertions read the source because the properties
 * are structural: which token types are accepted, which destinations are allowed,
 * and which credentials are involved.
 */

const CALLBACK = readFileSync("app/auth/callback/route.ts", "utf8");
const CONFIG = readFileSync("next.config.ts", "utf8");

function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}
const CODE = codeOnly(CALLBACK);

test("the exchange uses anon credentials only, never a service-role key", () => {
  assert.match(CODE, /anonKey/);
  assert.equal(/SERVICE_ROLE|service_role/.test(CODE), false,
    "a product app must never hold the Platform service-role key");
});

test("the handoff is exchanged through Platform Core Auth, not custom logic", () => {
  assert.match(CODE, /verifyOtp/);
  assert.equal(/jsonwebtoken|jose|createHmac|createSign/.test(CODE), false, "no custom token verification");
});

test("account-lifecycle token types stay rejected under Platform Core", () => {
  // signup / recovery / email_change are identity operations Platform Core owns.
  assert.match(CODE, /LEGACY_ONLY_OTP_TYPES/);
  for (const t of ["signup", "recovery", "email_change"]) {
    assert.ok(CALLBACK.includes(`"${t}"`), `${t} must be enumerated as legacy-only`);
  }
});

test("an unrecognised token type is refused", () => {
  assert.match(CODE, /isVerifyOtpType/);
});

test("only same-origin relative continuations are honoured", () => {
  assert.match(CODE, /function safeContinuation/);
  assert.match(CODE, /startsWith\("\/"\)/);
  assert.match(CODE, /startsWith\("\/\/"\)/);
  // "/\evil.com" is treated as absolute by some parsers; it must be rejected too.
  assert.match(CODE, /\\\\/);
  assert.match(CODE, /DEFAULT_CONTINUATION/);
});

test("every redirect is relative, preserving the request host", () => {
  // An absolute URL rebuilt from the request normalises the host, which would send
  // the user to a different origin than the one whose cookies were just set.
  assert.equal(/NextResponse\.redirect\(new URL\(/.test(CODE), false,
    "absolute redirects lose the request host");
  assert.match(CODE, /function relativeRedirect/);
});

test("malformed, expired and replayed handoffs are indistinguishable to the caller", () => {
  // GoTrue returns one error for all three; distinguishing them would be an oracle.
  const failures = CODE.match(/auth_failed/g) ?? [];
  assert.equal(failures.length, 1, "one shared failure path");
});

test("the handoff surface suppresses the referrer and forbids caching", () => {
  assert.match(CODE, /"Referrer-Policy":\s*"no-referrer"/);
  assert.match(CODE, /"Cache-Control":\s*"no-store/);
  // Config headers are applied after route handlers, so the stricter policy must
  // also be declared in next.config or the global value silently wins.
  assert.match(CONFIG, /source:\s*"\/auth\/callback"/);
  assert.match(CONFIG, /no-referrer/);
});

test("no token material is logged", () => {
  assert.equal(/console\.(log|info|warn|error|debug)/.test(CODE), false);
  assert.equal(/\$\{\s*tokenHash\s*\}/.test(CODE), false);
});

test("stale organization context is cleared when a new session is established", () => {
  // A handoff can switch identity; carrying the previous org selection forward
  // would let context outlive the session it belonged to.
  assert.match(CODE, /maxAge: 0/);
});

test("framework config cannot silently override the callback referrer policy", () => {
  // next.config headers() entries are applied AFTER route handlers, so a global
  // Referrer-Policy wins over one set on the response. During implementation this
  // silently downgraded the callback to strict-origin-when-cross-origin while a
  // one-time handoff token sat in the query string. The narrower config entry is
  // what actually enforces it; this pins the entry and its ordering.
  assert.match(CONFIG, /source:\s*"\/:path\*"/, "a global header rule exists");
  assert.match(CONFIG, /source:\s*"\/auth\/callback"/, "a narrower callback rule exists");
  assert.ok(
    CONFIG.indexOf('"/:path*"') < CONFIG.indexOf('"/auth/callback"'),
    "the callback rule must come after the global rule to win",
  );
  const block = CONFIG.slice(CONFIG.indexOf('"/auth/callback"'));
  assert.match(block, /no-referrer/);
});
