import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isDashboardRole,
  stripErrorParamFromUrl
} from "../app/(public)/login/role-home-path";
import { ROLE_NOT_CONFIGURED_MESSAGE } from "../app/(public)/login/login-form";
import { APP_ONLY_RESET_SUCCESS_MESSAGE } from "../app/(public)/login/recovery-password-form";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("isDashboardRole returns true only for platform/organizer/exhibitor (incl. exhibitor_viewer) roles", () => {
  assert.equal(isDashboardRole("platform_admin"), true);
  assert.equal(isDashboardRole("organizer_admin"), true);
  assert.equal(isDashboardRole("event_organizer"), true);
  assert.equal(isDashboardRole("organizer"), true);
  assert.equal(isDashboardRole("exhibitor_admin"), true);
  assert.equal(isDashboardRole("exhibitor_viewer"), true);
  assert.equal(isDashboardRole("EXHIBITOR_VIEWER"), true);

  assert.equal(isDashboardRole("viewer"), false);
  assert.equal(isDashboardRole("exhibitor"), false);
  assert.equal(isDashboardRole(""), false);
  assert.equal(isDashboardRole(null), false);
  assert.equal(isDashboardRole(undefined), false);
});

test("login page does NOT render the role-not-configured banner from server/URL state", () => {
  const src = read("app/(public)/login/page.tsx");
  assert.doesNotMatch(
    src,
    new RegExp(
      ROLE_NOT_CONFIGURED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ),
    "server page must not render the role-not-configured banner at all — login form owns it"
  );
  assert.doesNotMatch(
    src,
    /roleError\s*\?\s*\(/,
    "server page must not conditionally render a banner based on URL ?error=role"
  );
});

test("login page forwards initialRoleError to the client wrapper instead of rendering a banner", () => {
  const src = stripComments(read("app/(public)/login/page.tsx"));
  assert.match(src, /initialRoleError\s*=\s*.*error.*===\s*"role"/);
  assert.match(
    src,
    /<LoginPageClient\s+initialRoleError=\{\s*initialRoleError\s*\}/
  );
});

test("login page no longer redirects authed-unknown-role users back to /login?error=role", () => {
  const src = stripComments(read("app/(public)/login/page.tsx"));
  assert.doesNotMatch(
    src,
    /redirect\(\s*"\/login\?error=role"\s*\)/,
    "server page must not self-redirect to ?error=role — that creates stale banner loops"
  );
});

test("LoginPageClient threads initialRoleError down to the LoginForm", () => {
  const src = stripComments(read("app/(public)/login/login-page-client.tsx"));
  assert.match(src, /initialRoleError\s*\??\s*:\s*boolean/);
  assert.match(
    src,
    /<LoginForm\s+initialRoleError=\{\s*initialRoleError\s*\}\s*\/>/
  );
});

test("LoginForm initializes roleNotConfigured state from the initialRoleError prop", () => {
  const src = stripComments(read("app/(public)/login/login-form.tsx"));
  assert.match(src, /initialRoleError\s*\??\s*:\s*boolean/);
  assert.match(
    src,
    /useState<boolean>\s*\(\s*initialRoleError\s*\)/,
    "banner state must be initialized from the prop, not from URL on every render"
  );
});

test("LoginForm strips ?error=role from the URL on mount (flash, not persistent)", () => {
  const src = stripComments(read("app/(public)/login/login-form.tsx"));
  assert.match(src, /stripRoleErrorFromUrl\s*\(\s*\)/);
  assert.match(src, /useEffect\s*\(/);
  assert.match(src, /window\.history\.replaceState/);
  assert.match(src, /stripErrorParamFromUrl\s*\(\s*window\.location\.href\s*\)/);
});

test("stripErrorParamFromUrl removes only the error param, preserves path/other params/hash", () => {
  assert.equal(stripErrorParamFromUrl("/login?error=role"), "/login");
  assert.equal(stripErrorParamFromUrl("/login?error=role&reset=1"), "/login?reset=1");
  assert.equal(stripErrorParamFromUrl("/login?reset=1&error=role"), "/login?reset=1");
  assert.equal(
    stripErrorParamFromUrl("/login?error=role#section"),
    "/login#section"
  );
  assert.equal(stripErrorParamFromUrl("/login"), "/login");
  assert.equal(stripErrorParamFromUrl("/login?reset=1"), "/login?reset=1");
  assert.equal(
    stripErrorParamFromUrl("https://app.example.com/login?error=role"),
    "https://app.example.com/login"
  );
});

test("LoginForm banner render is driven only by local state, not by URL", () => {
  const src = stripComments(read("app/(public)/login/login-form.tsx"));
  assert.match(src, /\{roleNotConfigured\s*\?/);
  assert.doesNotMatch(
    src,
    /searchParams\.get\(\s*"error"\s*\)/,
    "banner must not re-read the URL each render"
  );
});

test("LoginForm clears the banner when user edits email or verification code", () => {
  const src = stripComments(read("app/(public)/login/login-form.tsx"));
  const emailHandler = src.match(/onEmailChange\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\};/)?.[0];
  const otpHandler = src.match(/onOtpChange\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\};/)?.[0];
  assert.ok(emailHandler, "onEmailChange handler must exist");
  assert.ok(otpHandler, "onOtpChange handler must exist");
  assert.match(emailHandler!, /setRoleNotConfigured\(\s*false\s*\)/);
  assert.match(otpHandler!, /setRoleNotConfigured\(\s*false\s*\)/);
});

test("LoginForm uses email OTP send + verify and resolves role via shared helper", () => {
  const src = stripComments(read("app/(public)/login/login-form.tsx"));
  assert.match(src, /signInWithOtp\s*\(\s*\{/);
  assert.match(src, /shouldCreateUser\s*:\s*false/);
  assert.match(src, /verifyOtp\s*\(\s*\{/);
  assert.match(src, /type\s*:\s*["']email["']/);

  assert.match(src, /resolveRoleAndNavigate/);
  assert.match(src, /if\s*\(\s*!isDashboardRole\s*\(/);
  assert.match(src, /await\s+supabase\.auth\.signOut\s*\(/);
  assert.match(src, /setRoleNotConfigured\(\s*true\s*\)/);
  assert.match(src, /router\.replace\s*\(\s*roleHomePath\s*\(/);
});

test("LoginForm submit resets the banner before OTP send or verification (no carryover)", () => {
  const src = stripComments(read("app/(public)/login/login-form.tsx"));
  assert.match(src, /onSubmit\s*=\s*async/);
  assert.match(src, /event\.preventDefault\(\)\s*;\s*setRoleNotConfigured\(\s*false\s*\)/);
});

test("RecoveryPasswordForm shows the mobile-app success copy for app-only users, not the role-not-configured warning", () => {
  const src = read("app/(public)/login/recovery-password-form.tsx");
  assert.match(
    src,
    new RegExp(
      APP_ONLY_RESET_SUCCESS_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    )
  );

  const code = stripComments(src);
  assert.match(code, /isDashboardRole\s*\(/);
  assert.match(code, /setAppOnlySuccess\s*\(\s*true\s*\)/);

  const appOnlyBranch = code
    .split("if (!isDashboardRole")[1]
    ?.split("router.replace")[0];
  assert.ok(appOnlyBranch, "app-only branch must exist before the dashboard redirect");
  assert.match(appOnlyBranch!, /signOut\s*\(/);
  assert.doesNotMatch(
    appOnlyBranch!,
    /roleHomePath/,
    "app-only branch must NOT route through roleHomePath (would land on /login?error=role)"
  );

  assert.doesNotMatch(
    code,
    new RegExp(
      ROLE_NOT_CONFIGURED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ),
    "recovery form must never surface the role-not-configured warning"
  );
});

test("role-not-configured banner message constant is exported and rendered exactly once", () => {
  const src = read("app/(public)/login/login-form.tsx");
  assert.match(src, /export const ROLE_NOT_CONFIGURED_MESSAGE\s*=/);
  const occurrences = src.match(
    new RegExp(
      ROLE_NOT_CONFIGURED_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    )
  );
  assert.equal(occurrences?.length, 1, "message literal should appear once (at the constant definition)");
});
