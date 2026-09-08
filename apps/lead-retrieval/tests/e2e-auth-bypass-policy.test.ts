/**
 * Unit tests for Playwright-only E2E auth bypass policy (no production weakening).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  E2E_AUTH_BYPASS_PATH,
  getE2eAuthBypassDenialReasonFromEnv,
  isE2eAuthBypassApiPath
} from "@/lib/e2e/e2e-auth-bypass-policy";
import { isSeededE2eAuthEmail } from "@/lib/e2e/e2e-seeded-auth-emails";

test("policy FromEnv: denied when E2E_AUTH_BYPASS_ENABLED is not true", () => {
  assert.match(
    String(
      getE2eAuthBypassDenialReasonFromEnv({
        NODE_ENV: "development",
        VERCEL_ENV: undefined,
        E2E_AUTH_BYPASS_ENABLED: undefined
      })
    ),
    /E2E_AUTH_BYPASS_ENABLED/
  );
});

test("policy FromEnv: denied in NODE_ENV production even if flag is true", () => {
  assert.match(
    String(
      getE2eAuthBypassDenialReasonFromEnv({
        NODE_ENV: "production",
        VERCEL_ENV: undefined,
        E2E_AUTH_BYPASS_ENABLED: "true"
      })
    ),
    /NODE_ENV/
  );
});

test("policy FromEnv: denied on Vercel production env", () => {
  assert.match(
    String(
      getE2eAuthBypassDenialReasonFromEnv({
        NODE_ENV: "development",
        VERCEL_ENV: "production",
        E2E_AUTH_BYPASS_ENABLED: "true"
      })
    ),
    /VERCEL_ENV/
  );
});

test("policy FromEnv: enabled only when flag true and non-production envs", () => {
  assert.equal(
    getE2eAuthBypassDenialReasonFromEnv({
      NODE_ENV: "development",
      VERCEL_ENV: "preview",
      E2E_AUTH_BYPASS_ENABLED: "true"
    }),
    null
  );
  assert.equal(
    getE2eAuthBypassDenialReasonFromEnv({
      NODE_ENV: "development",
      VERCEL_ENV: undefined,
      E2E_AUTH_BYPASS_ENABLED: "true"
    }),
    null
  );
});

test("middleware wires e2e bypass passthrough next to api auth rules", () => {
  const src = readFileSync(
    path.join(process.cwd(), "lib/supabase/middleware.ts"),
    "utf8"
  );
  assert.match(src, /isE2eAuthBypassApiPath\(pathname\)/);
  assert.match(src, /isE2eAuthBypassRuntimeEnabled\(\)/);
});

test("bypass route exists and gates on getE2eAuthBypassDenialReason", () => {
  const src = readFileSync(
    path.join(process.cwd(), "app/api/e2e/auth-bypass/route.ts"),
    "utf8"
  );
  assert.match(src, /getE2eAuthBypassDenialReason/);
  assert.match(src, /isSeededE2eAuthEmail/);
});

test("seeded auth allowlist includes kamyab local bypass email only through the existing non-production gate", () => {
  assert.equal(isSeededE2eAuthEmail("kamyab.ali+ex@gmail.com"), true);
  assert.equal(isSeededE2eAuthEmail("KAMYAB.ALI+EX@GMAIL.COM"), true);
  assert.match(
    String(
      getE2eAuthBypassDenialReasonFromEnv({
        NODE_ENV: "production",
        VERCEL_ENV: undefined,
        E2E_AUTH_BYPASS_ENABLED: "true"
      })
    ),
    /NODE_ENV/
  );
});

test("stable bypass API path constant", () => {
  assert.equal(E2E_AUTH_BYPASS_PATH, "/api/e2e/auth-bypass");
  assert.equal(isE2eAuthBypassApiPath("/api/e2e/auth-bypass"), true);
  assert.equal(isE2eAuthBypassApiPath("/api/e2e/auth-bypass/extra"), true);
  assert.equal(isE2eAuthBypassApiPath("/api/other"), false);
});
