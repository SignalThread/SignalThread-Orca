import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("app/api/events/import/create/route.ts", "utf8");
const serviceSource = readFileSync("src/server/services/event-import-builder.ts", "utf8");
const builderSource = readFileSync("app/(shell)/events/_components/new-event-builder.tsx", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("test-fixtures/legacy-orca-migrations/20260806120000_event_import_ledger/migration.sql", "utf8");

test("reviewed mappings, approval evidence, and one client idempotency key cross the create boundary", () => {
  assert.ok(routeSource.includes("workbookMappings: asArray(body.workbookMappings)"));
  assert.ok(routeSource.includes('idempotencyKey: typeof body.idempotencyKey === "string"'));
  assert.ok(routeSource.includes("approval,"));
  assert.ok(routeSource.includes("{ signal: request.signal }"));
  assert.ok(builderSource.includes("importIdempotencyKeyRef"));
  assert.ok(builderSource.includes("importIdempotencyKeyRef.current ?? crypto.randomUUID()"));
  assert.ok(builderSource.includes('evidence: "FINAL_REVIEW"'));
  assert.ok(builderSource.includes("omissionsAcknowledged"));
  assert.ok(builderSource.includes("workbookOmissions"));
  assert.ok(builderSource.includes("Reviewed data that will not be imported"));
  assert.ok(serviceSource.includes("IMPORT_OMISSIONS_NOT_ACKNOWLEDGED"));
});

test("the service claims an org-and-user-scoped intent and replays terminal outcomes", () => {
  assert.ok(serviceSource.includes("orgId_requestedByUserId_idempotencyKey"));
  assert.ok(serviceSource.includes("approvalEvidence: asJson(request.approval)"));
  assert.ok(serviceSource.includes("reviewedMappings: asJson(request.workbookMappings ?? [])"));
  assert.ok(serviceSource.includes("approvedPlan: asJson(request)"));
  assert.ok(serviceSource.includes('intent.status === "SUCCEEDED"'));
  assert.ok(serviceSource.includes("replayed: true"));
  assert.ok(serviceSource.includes('terminalStatus = error instanceof EventImportBuilderError && error.code === "IMPORT_CANCELED"'));
  assert.ok(serviceSource.includes("eventImportResult.upsert"));
  assert.ok(!serviceSource.includes("eventImportIntent.delete"));
  assert.ok(!serviceSource.includes("eventImportResult.delete"));
});

test("the Prisma schema and additive migration carry the import ledger contract", () => {
  {
    assert.ok(schema.includes("model EventImportIntent"));
    assert.ok(schema.includes("model EventImportResult"));
    assert.ok(schema.includes("@@unique([orgId, requestedByUserId, idempotencyKey])"));
    assert.ok(schema.includes("enum EventImportIntentStatus"));
    assert.ok(schema.includes("enum EventImportResultStatus"));
  }
  assert.ok(migration.includes("ADD VALUE IF NOT EXISTS 'VENDOR'"));
  assert.ok(migration.includes('CREATE TABLE "EventImportIntent"'));
  assert.ok(migration.includes('CREATE TABLE "EventImportResult"'));
  assert.ok(!migration.match(/(?:^|\n)\s*(?:DROP|TRUNCATE|DELETE)\b/));
});
