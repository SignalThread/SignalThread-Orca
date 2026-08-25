import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Phase 1 schema guardrails for the Email Marketing MVP. These pin the
 * schema/migration invariants only; services, routes, SendGrid provider,
 * webhooks, and UI are intentionally out of Phase 1 and not asserted here.
 *
 * See docs/schema-proposals/marketing-email-mvp.md and
 * docs/marketing-sendgrid-integration.md.
 */

const SCHEMA = "prisma/schema.prisma";
const MIGRATIONS_DIR = "test-fixtures/legacy-orca-migrations";

const MARKETING_MODELS = [
  "MarketingPlan",
  "MarketingCampaign",
  "MarketingAudience",
  "MarketingAudienceRecipient",
  "MarketingEmailSend",
  "MarketingEmailSendRecipient",
  "MarketingEmailEvent",
  "MarketingSuppression",
  "MarketingKpiSnapshot",
];

const MARKETING_ENUMS = [
  "MarketingCampaignStatus",
  "MarketingEmailSendStatus",
  "MarketingEmailRecipientStatus",
  "MarketingEmailEventType",
  "MarketingSuppressionReason",
  "MarketingSuppressionSource",
];

function readSchema(path: string): string {
  return readFileSync(path, "utf8");
}

function extractModelBlock(schema: string, modelName: string): string {
  const marker = `model ${modelName} {`;
  const start = schema.indexOf(marker);
  assert.notEqual(start, -1, `${modelName} must exist in the schema`);
  const end = schema.indexOf("\n}", start);
  assert.notEqual(end, -1, `${modelName} block must be closed`);
  return schema.slice(start, end);
}

function findMarketingMigration(): string {
  const dir = readdirSync(MIGRATIONS_DIR).find((entry) => entry.includes("marketing_email_mvp"));
  assert.ok(dir, "expected the marketing_email_mvp migration directory");
  return readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
}

function findScheduledLifecycleMigration(): string {
  const dir = readdirSync(MIGRATIONS_DIR).find((entry) => entry.includes("marketing_scheduled_email_lifecycle"));
  assert.ok(dir, "expected the marketing_scheduled_email_lifecycle migration directory");
  return readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
}

test("marketing migration is strictly additive", () => {
  const sql = findMarketingMigration().toUpperCase();
  for (const forbidden of ["DROP TABLE", "DROP COLUMN", "RENAME COLUMN", "DELETE FROM", "TRUNCATE"]) {
    assert.equal(sql.includes(forbidden), false, `marketing migration must stay additive (${forbidden})`);
  }
});

test("marketing migration creates every model table and enum type", () => {
  const sql = findMarketingMigration();
  for (const model of MARKETING_MODELS) {
    assert.ok(sql.includes(`CREATE TABLE "${model}"`), `migration must create table ${model}`);
  }
  for (const enumName of MARKETING_ENUMS) {
    assert.ok(sql.includes(`CREATE TYPE "${enumName}"`), `migration must create enum ${enumName}`);
  }
});

test("marketing models avoid JSON blobs for core KPI, recipient, send, and event data", () => {
  const schema = readSchema(SCHEMA);
  for (const model of MARKETING_MODELS) {
    const block = extractModelBlock(schema, model);
    assert.equal(block.includes("Json"), false, `${model} must not use JSON blobs`);
  }
});

test("marketing send content uses bodyHtml/bodyText and KPI revenue uses revenueAmountCents", () => {
  const schema = readSchema(SCHEMA);
  const send = extractModelBlock(schema, "MarketingEmailSend");
  assert.ok(send.includes("bodyHtml"), "MarketingEmailSend must use bodyHtml for MVP content");
  assert.ok(send.includes("bodyText"), "MarketingEmailSend must use bodyText for MVP content");
  assert.ok(send.includes("scheduledSendAt"), "MarketingEmailSend must persist scheduledSendAt");

  const kpi = extractModelBlock(schema, "MarketingKpiSnapshot");
  assert.ok(kpi.includes("revenueAmountCents"), "MarketingKpiSnapshot must use revenueAmountCents");
});

test("marketing scheduled email lifecycle persists cancellation, failure, and attempt metadata", () => {
  const schema = readSchema(SCHEMA);
  const send = extractModelBlock(schema, "MarketingEmailSend");

  for (const field of ["canceledAt", "canceledByUserId", "failureReason", "sendAttemptCount", "lastAttemptedAt"]) {
    assert.ok(send.includes(field), `MarketingEmailSend must include ${field}`);
  }
  assert.ok(send.includes("@@index([eventId, status, scheduledSendAt])"));

  const sql = findScheduledLifecycleMigration();
  for (const column of [
    '"canceledAt"',
    '"canceledByUserId"',
    '"failureReason"',
    '"sendAttemptCount"',
    '"lastAttemptedAt"',
  ]) {
    assert.ok(sql.includes(column), `scheduled lifecycle migration must add ${column}`);
  }
});

test("MarketingEmailSendRecipient is the frozen sent-to record with a per-send unique key", () => {
  const schema = readSchema(SCHEMA);
  const block = extractModelBlock(schema, "MarketingEmailSendRecipient");
  assert.ok(block.includes("@@unique([emailSendId, normalizedEmail])"), "send recipients must be unique per send");
  assert.ok(block.includes("sourceAudienceRecipientId"), "send recipients keep a soft provenance pointer");
});

test("marketing source-of-truth: does not reuse EventIntegrationMetric, SpeakerEmailLog, or Notification", () => {
  const schema = readSchema(SCHEMA);
  for (const model of MARKETING_MODELS) {
    const block = extractModelBlock(schema, model);
    for (const forbidden of ["EventIntegrationMetric", "SpeakerEmailLog", "Notification"]) {
      assert.equal(
        block.includes(forbidden),
        false,
        `${model} must not reference ${forbidden} (marketing owns its own source of truth)`,
      );
    }
  }
});

test("marketing models and enums are present in the canonical Prisma schema", () => {
  const schema = readSchema(SCHEMA);
  for (const model of MARKETING_MODELS) {
    assert.ok(schema.includes(`model ${model} {`), `schema must define ${model}`);
  }
  for (const enumName of MARKETING_ENUMS) {
    assert.ok(schema.includes(`enum ${enumName} {`), `schema must define ${enumName}`);
  }
});
