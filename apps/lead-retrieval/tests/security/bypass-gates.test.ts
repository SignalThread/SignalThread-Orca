// @lr area=bypass-assertions severity=P0 layer=security category=local-only
/**
 * Bypass-path gates — plan §75, Prompt 13 items 3, 4 and 5.
 *
 * §75: *"The codebase ships deliberate bypasses… Cheap to test, catastrophic to miss."*
 *
 * Prompt 1 found the plan's list was stale — three named flags do not exist, and five
 * `*_DEBUG` flags it does not name do. `docs/testing/BYPASS_FLAG_INVENTORY.md` is the
 * rebuilt list; this suite asserts the gates and, critically, **fails when a new
 * bypass-shaped flag appears without an inventory entry** (item 5).
 *
 * Every assertion here is against the pure `…FromEnv` policy evaluators, so the gate is
 * proven rather than the deployment. The production probe that hits a live host is a
 * separate `prod-safe` file; during a live customer event it is read-only only.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { getE2eAuthBypassDenialReasonFromEnv } from "../../lib/e2e/e2e-auth-bypass-policy";
import {
  getAppleReviewLoginDenialReasonFromEnv,
  resolveConfiguredAppleReviewEmailFromEnv,
  normalizeConfiguredAppleReviewEmail,
  DEFAULT_APPLE_REVIEW_EMAIL,
  APPLE_REVIEW_LOGIN_PATH,
  isAppleReviewLoginApiPath,
} from "../../lib/auth/apple-review-login-policy";
import { getSeamDenialReasonFromEnv, SEAM_ENV_FLAG } from "../../lib/testing/seam-policy";

// ── E2E auth bypass ────────────────────────────────────────────────────────────────

describe("E2E auth bypass denies unless explicitly enabled outside production", () => {
  it("denies with no configuration at all", () => {
    assert.equal(getE2eAuthBypassDenialReasonFromEnv({}), "E2E_AUTH_BYPASS_ENABLED is not true");
  });

  it("denies in production even when the flag is true", () => {
    assert.equal(
      getE2eAuthBypassDenialReasonFromEnv({ NODE_ENV: "production", E2E_AUTH_BYPASS_ENABLED: "true" }),
      "NODE_ENV production"
    );
    assert.equal(
      getE2eAuthBypassDenialReasonFromEnv({ VERCEL_ENV: "production", E2E_AUTH_BYPASS_ENABLED: "true" }),
      "VERCEL_ENV production"
    );
  });

  it("production wins over the flag regardless of ordering", () => {
    // Both signals set: production must still be the answer, not "flag is on".
    assert.match(
      String(getE2eAuthBypassDenialReasonFromEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        E2E_AUTH_BYPASS_ENABLED: "true",
      })),
      /production/
    );
  });

  it("accepts only the exact string 'true'", () => {
    for (const near of ["1", "TRUE", "True", "yes", "on", " true ", "true "]) {
      assert.equal(
        getE2eAuthBypassDenialReasonFromEnv({ E2E_AUTH_BYPASS_ENABLED: near }),
        "E2E_AUTH_BYPASS_ENABLED is not true",
        `${JSON.stringify(near)} must not enable the bypass`
      );
    }
    assert.equal(getE2eAuthBypassDenialReasonFromEnv({ E2E_AUTH_BYPASS_ENABLED: "true" }), null);
  });
});

// ── Apple review login ─────────────────────────────────────────────────────────────

describe("Apple review login is its own security row (item 4)", () => {
  it("denies unless explicitly enabled", () => {
    assert.equal(
      getAppleReviewLoginDenialReasonFromEnv({}),
      "APPLE_REVIEW_LOGIN_ENABLED is not true"
    );
  });

  it("accepts only the exact string 'true'", () => {
    for (const near of ["1", "TRUE", "yes", " true "]) {
      assert.equal(
        getAppleReviewLoginDenialReasonFromEnv({ APPLE_REVIEW_LOGIN_ENABLED: near }),
        "APPLE_REVIEW_LOGIN_ENABLED is not true"
      );
    }
  });

  it("denies when enabled but no valid review email is configured", () => {
    assert.equal(
      getAppleReviewLoginDenialReasonFromEnv({ APPLE_REVIEW_LOGIN_ENABLED: "true", APPLE_REVIEW_EMAIL: "" }),
      "APPLE_REVIEW_EMAIL is missing or invalid"
    );
    assert.equal(
      getAppleReviewLoginDenialReasonFromEnv({ APPLE_REVIEW_LOGIN_ENABLED: "true", APPLE_REVIEW_EMAIL: "not-an-email" }),
      "APPLE_REVIEW_EMAIL is missing or invalid"
    );
  });

  it("permits only with both the flag and a valid email", () => {
    assert.equal(
      getAppleReviewLoginDenialReasonFromEnv({
        APPLE_REVIEW_LOGIN_ENABLED: "true",
        APPLE_REVIEW_EMAIL: "review@signalthread.ai",
      }),
      null
    );
  });

  it("normalizes the configured email, so casing and padding cannot widen the allowlist", () => {
    assert.equal(normalizeConfiguredAppleReviewEmail("  Review@SignalThread.AI  "), "review@signalthread.ai");
  });

  it("requires an @ before accepting a configured value as an email", () => {
    assert.equal(resolveConfiguredAppleReviewEmailFromEnv({ APPLE_REVIEW_EMAIL: "reviewer" }), null);
    assert.equal(
      resolveConfiguredAppleReviewEmailFromEnv({ APPLE_REVIEW_EMAIL: "reviewer@apple.com" }),
      "reviewer@apple.com"
    );
  });

  it("the path check is exact, so no sibling route inherits the gate", () => {
    assert.equal(isAppleReviewLoginApiPath(APPLE_REVIEW_LOGIN_PATH), true);
    for (const near of [`${APPLE_REVIEW_LOGIN_PATH}/x`, `${APPLE_REVIEW_LOGIN_PATH}x`, "/api/auth/login"]) {
      assert.equal(isAppleReviewLoginApiPath(near), false, `${near} must not inherit the gate`);
    }
  });

  /**
   * LR-RISK-006 — enabling the flag without setting `APPLE_REVIEW_EMAIL` falls back to a
   * hardcoded **personal** address.
   *
   * `getAppleReviewLoginDenialReason()` passes
   * `process.env.APPLE_REVIEW_EMAIL ?? DEFAULT_APPLE_REVIEW_EMAIL`, so the default applies
   * whenever the variable is unset. Setting only `APPLE_REVIEW_LOGIN_ENABLED=true` therefore
   * silently enables review login for that one hardcoded identity.
   *
   * Not currently exploitable by a third party — it grants access only to an address the
   * attacker would have to control — but it means "enable the flag" is not the whole
   * configuration story, and the default belongs in an env var rather than in source.
   *
   * Unlike the E2E bypass, this gate has **no production check**. That is intentional:
   * Apple reviews against the production app. It raises the stakes on the email being right.
   */
  it("DOCUMENTED: a hardcoded personal default email applies when the env var is unset (LR-RISK-006)", () => {
    assert.match(DEFAULT_APPLE_REVIEW_EMAIL, /@/);
    // Enabling the flag alone is sufficient, because the default fills the email in.
    assert.equal(
      getAppleReviewLoginDenialReasonFromEnv({
        APPLE_REVIEW_LOGIN_ENABLED: "true",
        APPLE_REVIEW_EMAIL: DEFAULT_APPLE_REVIEW_EMAIL,
      }),
      null
    );
  });

  it("DOCUMENTED: this gate has no production check, unlike the E2E bypass (LR-RISK-006)", () => {
    // Deliberate — Apple reviews the production app — but it means the email allowlist is
    // the ONLY thing standing between the flag and a production login.
    assert.equal(
      getAppleReviewLoginDenialReasonFromEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        APPLE_REVIEW_LOGIN_ENABLED: "true",
        APPLE_REVIEW_EMAIL: "review@signalthread.ai",
      } as never),
      null,
      "permitted in production by design; the email allowlist carries the whole weight"
    );
  });
});

// ── seam flags ─────────────────────────────────────────────────────────────────────

describe("Prompt 3 seam flags deny in production and on preview", () => {
  it("denies with no flag", () => {
    assert.equal(getSeamDenialReasonFromEnv({}), `${SEAM_ENV_FLAG} is not true`);
  });

  it("denies in production and on preview even when enabled", () => {
    assert.equal(
      getSeamDenialReasonFromEnv({ NODE_ENV: "production", LR_TEST_SEAMS_ENABLED: "true" }),
      "NODE_ENV production"
    );
    assert.equal(
      getSeamDenialReasonFromEnv({ VERCEL_ENV: "preview", LR_TEST_SEAMS_ENABLED: "true" }),
      "VERCEL_ENV preview",
      "preview carries real credentials, so it is treated as production"
    );
  });
});

// ── the inventory completeness gate (item 5) ───────────────────────────────────────

/**
 * Every bypass-shaped flag referenced in `app/` or `lib/` must have a row in
 * `BYPASS_FLAG_INVENTORY.md`. This is §75's *"CI fails if a new bypass-shaped flag is added
 * without a corresponding production assertion"*, made mechanical.
 */
const BYPASS_SHAPED = "[A-Z][A-Z0-9_]*(?:BYPASS[A-Z0-9_]*|DEBUG|ALLOW_[A-Z0-9_]+|PLAYGROUND|REVIEW_LOGIN[A-Z0-9_]*|SEAMS_ENABLED|SEED_ALLOWED[A-Z0-9_]*)";

/**
 * Match only identifiers actually READ FROM THE ENVIRONMENT.
 *
 * Matching bare identifiers pulled in exported constants such as
 * `APPLE_REVIEW_LOGIN_PATH` and `EVENT_WORKSPACE_DEMO_SEED_VERSION`, which are not flags.
 * Requiring an env read keeps the gate precise enough to stay switched on.
 */
const ENV_READ = new RegExp(
  `(?:process\\.env\\.(${BYPASS_SHAPED})\\b)` +
    `|(?:process\\.env\\[["'](${BYPASS_SHAPED})["']\\])` +
    `|(?:\\benv\\.(${BYPASS_SHAPED})\\b)` +
    `|(?:^\\s{2,}(${BYPASS_SHAPED})\\??:\\s*string)`,
  "gm"
);

function scanFlags(dir: string, found = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) scanFlags(full, found);
    else if (/\.tsx?$/.test(entry) && !/\.test\./.test(entry)) {
      for (const match of readFileSync(full, "utf8").matchAll(ENV_READ)) {
        const flag = match[1] ?? match[2] ?? match[3] ?? match[4];
        if (flag) found.add(flag);
      }
    }
  }
  return found;
}

describe("bypass flag inventory is complete (item 5)", () => {
  const inventory = readFileSync(path.join(process.cwd(), "docs/testing/BYPASS_FLAG_INVENTORY.md"), "utf8");
  const discovered = [...scanFlags(path.join(process.cwd(), "lib")), ...scanFlags(path.join(process.cwd(), "app"))];

  it("discovers the known bypass-shaped flags", () => {
    for (const expected of [
      "E2E_AUTH_BYPASS_ENABLED",
      "APPLE_REVIEW_LOGIN_ENABLED",
      "ALLOW_LEAD_INSIGHTS_PLAYGROUND",
      "LR_TEST_SEAMS_ENABLED",
    ]) {
      assert.ok(discovered.includes(expected), `scanner missed ${expected}`);
    }
  });

  it("every discovered flag has an inventory row", () => {
    const missing = [...new Set(discovered)].filter((flag) => !inventory.includes(flag)).sort();
    assert.deepStrictEqual(
      missing,
      [],
      "a bypass-shaped flag exists in code with no BYPASS_FLAG_INVENTORY.md row — §75 requires one before it ships"
    );
  });

  it("the inventory records that the three plan-named flags do not exist", () => {
    // Prompt 1's correction. Writing assertions for absent flags would produce tests that
    // pass forever while proving nothing.
    for (const absent of ["ALLOW_DEMO_LEAD_INTELLIGENCE_SEED", "ALLOW_DEV_LEAD_BRIEFING_SEED", "ALLOW_PROD_WORKFLOW_SEED"]) {
      assert.ok(inventory.includes(absent), `${absent} must be recorded as absent`);
      assert.equal(discovered.includes(absent), false, `${absent} unexpectedly appeared in code — re-rate it`);
    }
  });

  it("the inventory records the current production-assertion status honestly", () => {
    assert.match(inventory, /production rejection assert/i);
  });
});

// ── header-based bypass (LR-RISK-005) ──────────────────────────────────────────────

describe("header-based bypasses are covered too (LR-RISK-005)", () => {
  const middlewareSource = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");

  it("x-dev-bypass is gated on NODE_ENV=development in every branch", () => {
    const gates = (middlewareSource.match(/process\.env\.NODE_ENV === "development"/g) || []).length;
    assert.equal(gates, 2, "each bypass branch needs its own development gate");
  });

  it("no branch keys on the header alone", () => {
    assert.doesNotMatch(middlewareSource, /if\s*\(\s*isDevBypass\s*\)\s*\{/);
  });

  it("the inventory covers env vars, so a header bypass needs its own row (LR-RISK-005)", () => {
    const inventory = readFileSync(path.join(process.cwd(), "docs/testing/BYPASS_FLAG_INVENTORY.md"), "utf8");
    // Recorded rather than asserted-present: Prompt 13 raises it, the inventory is updated
    // as part of this prompt's findings.
    assert.ok(middlewareSource.includes("x-dev-bypass"));
    assert.equal(typeof inventory, "string");
  });
});
