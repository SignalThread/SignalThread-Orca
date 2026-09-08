import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { LEAD_TEMPERATURE_VALUES } from "../lib/leads/temperature";
import {
  assertProdCanariesEnabled,
  DEFAULT_CANARY_R2_PREFIX,
  getCanaryR2Prefix,
  PROD_CANARY_FLAG,
  requireCanaryTestEmail,
  requireEnv
} from "../scripts/canaries/prod-canary-common";
import {
  buildLiveDbCanaryInsertPayload,
  buildLiveDbCanaryUpdatePayload,
  formatLiveDbCanaryMutationError
} from "../scripts/canaries/run-prod-canaries";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as {
  scripts?: Record<string, string>;
};

test("production canaries require the single RUN_PROD_CANARIES opt-in flag", () => {
  assert.throws(
    () => assertProdCanariesEnabled({}),
    new RegExp(`Set ${PROD_CANARY_FLAG}=1`)
  );
  assert.doesNotThrow(() => assertProdCanariesEnabled({ RUN_PROD_CANARIES: "1" }));
  assert.throws(() => assertProdCanariesEnabled({ RUN_PROD_CANARIES: "true" }), /Refusing to run/);
});

test("production canary env helpers fail clearly for missing secrets", () => {
  assert.throws(() => requireEnv("OPENAI_API_KEY", {}), /OPENAI_API_KEY is required/);
  assert.throws(() => requireCanaryTestEmail({}), /CANARY_TEST_EMAIL is required/);
  assert.throws(() => requireCanaryTestEmail({ CANARY_TEST_EMAIL: "not-an-email" }), /must be an email address/);
  assert.equal(requireCanaryTestEmail({ CANARY_TEST_EMAIL: "Canary@Test.Example" }), "canary@test.example");
  assert.equal(getCanaryR2Prefix({}), DEFAULT_CANARY_R2_PREFIX);
  assert.equal(getCanaryR2Prefix({ CANARY_R2_PREFIX: "canary/custom" }), "canary/custom/");
});

test("package exposes canary lane separately from deterministic full suite", () => {
  const scripts = packageJson.scripts ?? {};
  assert.equal(scripts["test:canary:setup"], "node --import tsx scripts/canaries/setup-prod-canary.ts");
  assert.equal(scripts["test:canary"], "node --import tsx scripts/canaries/run-prod-canaries.ts all");
  assert.equal(scripts["test:canary:openai"], "node --import tsx scripts/canaries/run-prod-canaries.ts openai");
  assert.equal(scripts["test:canary:sendgrid"], "node --import tsx scripts/canaries/run-prod-canaries.ts sendgrid");
  assert.equal(scripts["test:canary:r2"], "node --import tsx scripts/canaries/run-prod-canaries.ts r2");
  assert.equal(scripts["test:canary:audio"], "node --import tsx scripts/canaries/run-prod-canaries.ts audio");
  assert.equal(scripts["test:canary:live-db"], "node --import tsx scripts/canaries/run-prod-canaries.ts live-db");
  assert.doesNotMatch(scripts["test:full"] ?? "", /canary/i);
});

test("canary scripts use RUN_PROD_CANARIES and do not introduce legacy opt-in flags", () => {
  const runner = readFileSync("scripts/canaries/run-prod-canaries.ts", "utf8");
  const setup = readFileSync("scripts/canaries/setup-prod-canary.ts", "utf8");
  const common = readFileSync("scripts/canaries/prod-canary-common.ts", "utf8");
  const legacyAudio = readFileSync("scripts/conversation-audio-canary.ts", "utf8");
  const combined = [runner, setup, common, legacyAudio].join("\n");

  assert.match(combined, /RUN_PROD_CANARIES/);
  assert.doesNotMatch(combined, /ALLOW_PROD_CANARY|RUN_PROVIDER_CANARIES|JOURNEY_LIVE_DB/);
});

test("live-db canary payload uses production-allowed lead status and temperature values", () => {
  const resources = {
    companyId: "company-canary",
    eventId: "event-canary",
    exhibitorUserId: "user-canary",
    testEmail: "canary@example.test",
    r2Prefix: "canaries/lead-retrieval/"
  };
  const insertPayload = buildLiveDbCanaryInsertPayload({
    resources,
    fullName: "CANARY_DO_NOT_DELETE live-db test",
    email: "canary-live-db@example.test"
  });
  const updatePayload = buildLiveDbCanaryUpdatePayload();
  const allowedStatuses = ["new", "follow_up", "closed"];

  assert.ok(LEAD_TEMPERATURE_VALUES.some((value) => value === insertPayload.temperature));
  assert.ok(LEAD_TEMPERATURE_VALUES.some((value) => value === updatePayload.temperature));
  assert.equal(insertPayload.temperature, "cold");
  assert.equal(updatePayload.temperature, "warm");
  assert.ok(allowedStatuses.includes(insertPayload.status));
  assert.ok(allowedStatuses.includes(updatePayload.status));
});

test("live-db canary mutation errors identify failed payload field without secret values", () => {
  const message = formatLiveDbCanaryMutationError(
    "insert",
    {
      message: 'new row for relation "leads" violates check constraint "leads_temperature_allowed_check"',
      code: "23514"
    },
    {
      status: "new",
      temperature: "Cold",
      rating: 1,
      priority_score: 1,
      company_id: "company-secret-ish",
      event_id: "event-secret-ish",
      owner_user_id: "user-secret-ish"
    }
  );

  assert.match(message, /field=temperature/);
  assert.match(message, /allowed_temperature_values=hot,warm,cold/);
  assert.match(message, /allowed_status_values=new,follow_up,closed/);
  assert.match(message, /"company_id":"set"/);
  assert.doesNotMatch(message, /company-secret-ish|event-secret-ish|user-secret-ish/);
});
