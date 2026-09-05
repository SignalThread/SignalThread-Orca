import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Regression guard for a credential leak.
 *
 * The form previously carried only an `onSubmit` handler, with no `method` and no
 * `action`. Before React hydrated -- or with JavaScript disabled or broken -- the
 * browser's default submission took over, and the default is a **GET to the
 * current URL with every named input appended as a query parameter**. That put
 * the password in the address bar, and from there into browser history, the
 * `Referer` sent on the next navigation, and any access log in front of the app.
 *
 * These assertions read the source rather than rendering, because the property
 * being protected is structural: it is about which submission path exists at all,
 * including the path taken when no JavaScript runs.
 */

const FORM = readFileSync("app/signin/signin-form.tsx", "utf8");
const ACTIONS = readFileSync("app/signin/actions.ts", "utf8");
const PAGE = readFileSync("app/signin/page.tsx", "utf8");

/**
 * Comments explain *why* enumeration is avoided and legitimately quote the phrases
 * being avoided, so behavioural assertions run against code with comments removed.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

const ACTIONS_CODE = codeOnly(ACTIONS);

test("the form submits through a server action, not a client-only handler", () => {
  assert.match(FORM, /action=\{formAction\}/, "submission must be a server action");
  assert.equal(
    /onSubmit=/.test(FORM),
    false,
    "an onSubmit-only form degrades to a GET when unhydrated",
  );
});

test("submission is POST by construction, with no GET path and no hydration mismatch", () => {
  // A server action has no GET form: React always submits it as POST, including
  // before hydration. An explicit `method` literal is deliberately NOT used --
  // React normalises the attribute to lower case on the client while emitting
  // upper case on the server, so any literal produces a hydration mismatch.
  assert.match(FORM, /action=\{formAction\}/);
  assert.equal(/method=/.test(FORM), false, "an explicit method attribute mismatches on hydration");
  assert.equal(/onSubmit=/.test(FORM), false, "an onSubmit-only form degrades to GET");
});

test("credential inputs are never carried in the URL", () => {
  // A GET submission would serialise every *named* control into the query string.
  // Both credential fields are named (password managers need that), so the only
  // safe guarantee is that no GET submission path exists.
  assert.match(FORM, /name="email"/);
  assert.match(FORM, /name="password"/);
  assert.equal(/method="get"/i.test(FORM), false);
  assert.equal(/formMethod="get"/i.test(FORM), false);
});

test("the return path travels in the body, not the query string", () => {
  assert.match(FORM, /type="hidden"\s+name="next"/);
});

test("the action runs on the server", () => {
  assert.match(ACTIONS, /^"use server";/m);
});

test("the action never echoes or logs the submitted credential", () => {
  // Any console call in this file risks capturing an address or password.
  assert.equal(/console\.(log|info|warn|error|debug)/.test(ACTIONS_CODE), false);
  // The Supabase error object can carry the submitted email; it must not surface.
  assert.equal(/return\s*\{\s*error:\s*(error|signInError)[.\s]/.test(ACTIONS_CODE), false);
  assert.equal(/\$\{\s*password\s*\}/.test(ACTIONS_CODE), false);
  assert.equal(/\$\{\s*email\s*\}/.test(ACTIONS_CODE), false);
});

test("invalid credentials fail safely and without account enumeration", () => {
  // One message for both "no such user" and "wrong password".
  const matches = ACTIONS_CODE.match(/did not match an account/g) ?? [];
  assert.equal(matches.length, 1, "exactly one shared failure message");
  assert.equal(
    /no such user|unknown email|user not found/i.test(ACTIONS_CODE),
    false,
    "no user-facing string may distinguish a missing account from a wrong password",
  );
});

test("a missing credential is rejected before any auth call", () => {
  const guardIndex = ACTIONS.indexOf("Enter your email and password.");
  const authIndex = ACTIONS.indexOf("signInWithPassword");
  assert.ok(guardIndex > 0 && authIndex > 0);
  assert.ok(guardIndex < authIndex, "the empty-input guard must precede the auth call");
});

test("the post-signin redirect cannot leave the origin", () => {
  assert.match(ACTIONS, /startsWith\("\/"\)/);
  assert.match(ACTIONS, /startsWith\("\/\/"\)/);
  assert.match(ACTIONS, /"\/home"/);
});

test("the sign-in page still ignores an off-origin ?next=", () => {
  assert.match(PAGE, /startsWith\("\/"\)/);
  assert.match(PAGE, /startsWith\("\/\/"\)/);
});

test("the pending and error UX survives the move to a server action", () => {
  assert.match(FORM, /useActionState/);
  assert.match(FORM, /disabled=\{pending\}/);
  assert.match(FORM, /role="alert"/);
  assert.match(FORM, /Signing in…/);
});
