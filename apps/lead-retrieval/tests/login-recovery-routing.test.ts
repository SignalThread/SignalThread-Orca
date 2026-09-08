import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("/login server page renders the LoginPageClient wrapper (not LoginForm directly)", () => {
  const src = read("app/(public)/login/page.tsx");
  assert.match(src, /from "\.\/login-page-client"/);
  assert.match(src, /<LoginPageClient\b/);
  assert.doesNotMatch(
    stripComments(src),
    /<LoginForm\s*\/>/,
    "login page must not render LoginForm directly — client wrapper decides"
  );
});

test("LoginPageClient detects #type=recovery hash and switches to the reset password UI", () => {
  const src = read("app/(public)/login/login-page-client.tsx");
  const code = stripComments(src);

  assert.match(code, /window\.location\.hash/);
  assert.match(code, /isRecoveryHash\s*\(/);
  assert.match(code, /parseRecoveryHash\s*\(/);

  assert.match(code, /<RecoveryPasswordForm/);
  assert.match(code, /<LoginForm\b/);

  const recoveryIdx = code.indexOf("<RecoveryPasswordForm");
  const loginIdx = code.indexOf("<LoginForm");
  assert.ok(recoveryIdx !== -1 && loginIdx !== -1, "both forms must be conditionally renderable");
  assert.ok(
    recoveryIdx < loginIdx,
    "recovery branch must be evaluated before the default login form"
  );
});

test("LoginPageClient seeds Supabase session from hash tokens via setSession", () => {
  const src = stripComments(read("app/(public)/login/login-page-client.tsx"));
  assert.match(src, /supabase\.auth\.setSession\s*\(/);
  assert.match(
    src,
    /access_token\s*:\s*parsed\.accessToken/,
    "must pass parsed access_token to setSession"
  );
  assert.match(
    src,
    /refresh_token\s*:\s*parsed\.refreshToken/,
    "must pass parsed refresh_token to setSession"
  );
});

test("LoginPageClient treats setSession errors as an expired reset link", () => {
  const src = stripComments(read("app/(public)/login/login-page-client.tsx"));
  assert.match(src, /setSessionError/);
  assert.match(src, /expired/);
  assert.match(src, /Reset link expired/);
});

test("RecoveryPasswordForm calls supabase.auth.updateUser({ password }) on submit", () => {
  const src = stripComments(read("app/(public)/login/recovery-password-form.tsx"));
  assert.match(
    src,
    /supabase\.auth\.updateUser\s*\(\s*\{\s*password\s*:\s*newPassword\s*\}\s*\)/
  );
});

test("RecoveryPasswordForm redirects to the role-appropriate home after a successful password update", () => {
  const src = stripComments(read("app/(public)/login/recovery-password-form.tsx"));
  assert.match(src, /router\.replace\s*\(\s*roleHomePath\s*\(/);
  assert.match(src, /clearRecoveryHash\s*\(\s*\)/);
});

test("RecoveryPasswordForm clears the recovery hash from the URL on success", () => {
  const src = stripComments(read("app/(public)/login/recovery-password-form.tsx"));
  assert.match(src, /window\.history\.replaceState/);
  assert.match(src, /url\.pathname/);
  assert.doesNotMatch(
    src,
    /url\.hash/,
    "hash must not be preserved when cleaning the URL after password reset"
  );
});

test("RecoveryPasswordForm surfaces 'Reset link expired, request a new one.' for invalid/expired tokens", () => {
  const src = read("app/(public)/login/recovery-password-form.tsx");
  assert.match(src, /Reset link expired, request a new one\./);
  const code = stripComments(src);
  assert.match(code, /isInvalidOrExpiredTokenError\s*\(/);
  assert.match(code, /setExpired\s*\(\s*true\s*\)/);
});

test("recovery flow never logs tokens (no console.*(token) style leakage)", () => {
  const clientSrc = stripComments(read("app/(public)/login/login-page-client.tsx"));
  const formSrc = stripComments(read("app/(public)/login/recovery-password-form.tsx"));

  for (const src of [clientSrc, formSrc]) {
    const consoleCalls =
      src.match(/console\.(log|info|warn|error|debug)\s*\([^)]*\)/g) ?? [];
    for (const call of consoleCalls) {
      assert.doesNotMatch(
        call,
        /access_?[Tt]oken|refresh_?[Tt]oken|\bhash\b|\btokens?\b|parsed/,
        `console call must not include token/hash values: ${call}`
      );
    }
  }
});

test("recovery flow never calls supabase.auth.admin.* from the browser", () => {
  const clientSrc = stripComments(read("app/(public)/login/login-page-client.tsx"));
  const formSrc = stripComments(read("app/(public)/login/recovery-password-form.tsx"));
  for (const src of [clientSrc, formSrc]) {
    assert.doesNotMatch(src, /supabase\.auth\.admin/);
  }
});

test("LoginForm delegates role routing to the shared roleHomePath helper", () => {
  const src = stripComments(read("app/(public)/login/login-form.tsx"));
  assert.match(src, /from "\.\/role-home-path"/);
  assert.match(src, /roleHomePath\s*\(/);
});
