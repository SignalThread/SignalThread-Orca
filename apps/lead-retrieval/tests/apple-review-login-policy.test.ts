/**
 * Apple Review login policy (no live Supabase calls).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  APPLE_REVIEW_LOGIN_PATH,
  DEFAULT_APPLE_REVIEW_EMAIL,
  getAppleReviewLoginDenialReasonFromEnv,
  getAppleReviewUserRowDenialReason,
  isAppleReviewLoginApiPath,
  isAppleReviewLoginRequestEmailValid,
  normalizeConfiguredAppleReviewEmail
} from "@/lib/auth/apple-review-login-policy";

const REVIEW_LOWER = normalizeConfiguredAppleReviewEmail(DEFAULT_APPLE_REVIEW_EMAIL);

test("1: disabled when env flag is false", () => {
  assert.equal(
    getAppleReviewLoginDenialReasonFromEnv({
      APPLE_REVIEW_LOGIN_ENABLED: "false",
      APPLE_REVIEW_EMAIL: DEFAULT_APPLE_REVIEW_EMAIL
    }),
    "APPLE_REVIEW_LOGIN_ENABLED is not true"
  );
});

test("1b: denied when ENABLED missing entirely", () => {
  assert.match(
    String(
      getAppleReviewLoginDenialReasonFromEnv({
        APPLE_REVIEW_EMAIL: DEFAULT_APPLE_REVIEW_EMAIL
      })
    ),
    /APPLE_REVIEW_LOGIN_ENABLED/
  );
});

test("denied when configured email invalid", () => {
  assert.match(
    String(
      getAppleReviewLoginDenialReasonFromEnv({
        APPLE_REVIEW_LOGIN_ENABLED: "true",
        APPLE_REVIEW_EMAIL: "   "
      })
    ),
    /APPLE_REVIEW_EMAIL/
  );
});

test("2: rejects wrong or missing requested email vs configured gate", () => {
  assert.equal(isAppleReviewLoginRequestEmailValid(REVIEW_LOWER, "other@test.com"), false);
  assert.equal(isAppleReviewLoginRequestEmailValid(REVIEW_LOWER, undefined), false);
  assert.equal(isAppleReviewLoginRequestEmailValid(REVIEW_LOWER, null), false);
  assert.equal(isAppleReviewLoginRequestEmailValid(REVIEW_LOWER, ""), false);
  assert.equal(isAppleReviewLoginRequestEmailValid(REVIEW_LOWER, "   "), false);
});

test("2b: accepts exact review email (case-insensitive)", () => {
  assert.equal(
    isAppleReviewLoginRequestEmailValid(REVIEW_LOWER, DEFAULT_APPLE_REVIEW_EMAIL),
    true
  );
  assert.equal(
    isAppleReviewLoginRequestEmailValid(REVIEW_LOWER, " Kamyab.Ali+app@gmail.com "),
    true
  );
});

test("3: rejects privileged roles", () => {
  assert.equal(
    getAppleReviewUserRowDenialReason({
      userId: "uuid-1",
      role: "platform_admin"
    }),
    "privileged role blocked"
  );
  assert.equal(
    getAppleReviewUserRowDenialReason({
      userId: "uuid-1",
      role: "organizer_admin"
    }),
    "privileged role blocked"
  );
});

test("3b: rejects other non-demo roles under exhibitor-mobile gate", () => {
  assert.equal(
    getAppleReviewUserRowDenialReason({
      userId: "uuid-1",
      role: "company_admin"
    }),
    "role not allowed for Apple review demo"
  );
});

test("4: succeeds (policy) only for exhibitor_admin / exhibitor_viewer IDs", () => {
  assert.equal(
    getAppleReviewUserRowDenialReason({ userId: "uuid-1", role: "exhibitor_admin" }),
    null
  );
  assert.equal(
    getAppleReviewUserRowDenialReason({ userId: "uuid-2", role: "exhibitor_viewer" }),
    null
  );
});

test("4b: missing user id rejects", () => {
  assert.equal(
    getAppleReviewUserRowDenialReason({ userId: "", role: "exhibitor_admin" }),
    "missing user"
  );
});

test("middleware exposes Apple review PATH passthrough pairing", () => {
  assert.equal(APPLE_REVIEW_LOGIN_PATH, "/api/auth/apple-review-login");
  assert.equal(isAppleReviewLoginApiPath("/api/auth/apple-review-login"), true);

  const src = readFileSync(
    path.join(process.cwd(), "lib/supabase/middleware.ts"),
    "utf8"
  );
  assert.match(src, /isAppleReviewLoginApiPath\(pathname\)/);
  assert.match(src, /isAppleReviewLoginRuntimeEnabled\(\)/);
});

test("route module references policy + POST handler", () => {
  const src = readFileSync(
    path.join(process.cwd(), "app/api/auth/apple-review-login/route.ts"),
    "utf8"
  );
  assert.match(src, /isAppleReviewLoginRequestEmailValid/);
  assert.match(src, /getAppleReviewUserRowDenialReason/);
});
