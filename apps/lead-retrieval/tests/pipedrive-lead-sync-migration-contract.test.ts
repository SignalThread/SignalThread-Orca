import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/0102_pipedrive_lead_sync.sql", import.meta.url),
  "utf8"
);

test("migration 0102 is re-runnable against an existing environment", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS send_conversation_synopsis/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS send_generated_email_draft/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.pipedrive_lead_syncs/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_pipedrive_lead_syncs_queue/);
  assert.match(
    migration,
    /DROP TRIGGER IF EXISTS pipedrive_lead_syncs_set_updated_at\s+ON public\.pipedrive_lead_syncs;/
  );
  assert.match(migration, /^BEGIN;$/m);
  assert.match(migration, /^COMMIT;$/m);
});

test("migration 0102 performs no destructive operation on existing data", () => {
  const drops = migration.match(/\bDROP\b[^\n]*/gi) ?? [];
  assert.deepEqual(
    drops.map((line) => line.trim()),
    ["DROP TRIGGER IF EXISTS pipedrive_lead_syncs_set_updated_at"]
  );
  for (const forbidden of [/\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i, /\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i]) {
    assert.equal(forbidden.test(migration), false, `migration must not contain ${forbidden}`);
  }
});

test("new settings columns default to true, matching DEFAULT_PIPEDRIVE_SETUP_SETTINGS", () => {
  assert.match(migration, /send_conversation_synopsis boolean NOT NULL DEFAULT true/);
  assert.match(migration, /send_generated_email_draft boolean NOT NULL DEFAULT true/);
});

test("one sync row per company/lead pair, cascading from both", () => {
  assert.match(migration, /company_id uuid NOT NULL REFERENCES public\.companies \(id\) ON DELETE CASCADE/);
  assert.match(migration, /lead_id uuid NOT NULL REFERENCES public\.leads \(id\) ON DELETE CASCADE/);
  assert.match(
    migration,
    /CONSTRAINT pipedrive_lead_syncs_company_lead_unique UNIQUE \(company_id, lead_id\)/
  );
});

test("status/source/action enums are constrained", () => {
  assert.match(migration, /status text NOT NULL DEFAULT 'queued' CHECK \(status IN \('queued', 'syncing', 'synced', 'failed'\)\)/);
  assert.match(migration, /source text NOT NULL DEFAULT 'manual' CHECK \(source IN \('manual', 'bulk', 'test', 'auto'\)\)/);
  for (const column of ["person_action", "organization_action"]) {
    assert.match(migration, new RegExp(`${column} text CHECK \\(${column} IN \\('created', 'matched', 'reused', 'skipped'\\)\\)`));
  }
  for (const column of ["destination_action", "synopsis_note_action", "email_draft_note_action", "activity_action"]) {
    assert.match(migration, new RegExp(`${column} text CHECK \\(${column} IN \\('created', 'reused', 'skipped'\\)\\)`));
  }
});

test("every provider record id column the sync service writes exists in the migration", () => {
  for (const column of [
    "pipedrive_person_id",
    "pipedrive_organization_id",
    "pipedrive_destination_id",
    "synopsis_note_id",
    "email_draft_note_id",
    "activity_id",
    "attempts",
    "last_error",
    "next_attempt_at",
    "requested_by_user_id",
    "synced_at"
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`), `migration is missing column ${column}`);
  }
});

test("the sync table is service-role only", () => {
  assert.match(migration, /ALTER TABLE public\.pipedrive_lead_syncs ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.pipedrive_lead_syncs FROM anon, authenticated/);
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.pipedrive_lead_syncs TO service_role/
  );
  assert.equal(/CREATE POLICY/i.test(migration), false);
});
