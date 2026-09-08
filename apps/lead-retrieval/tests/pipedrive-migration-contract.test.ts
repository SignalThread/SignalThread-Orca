import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DEFAULT_PIPEDRIVE_SETUP_SETTINGS,
  toPipedriveSetupPersistenceRow
} from "../lib/integrations/pipedrive/setup-core";

const migration = readFileSync(
  new URL("../test-fixtures/legacy-lr-migrations/0101_pipedrive_integration_settings.sql", import.meta.url),
  "utf8"
);

test("migration 0101 is re-runnable against an existing environment", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.pipedrive_integration_settings/);
  assert.match(
    migration,
    /DROP TRIGGER IF EXISTS pipedrive_integration_settings_set_updated_at\s+ON public\.pipedrive_integration_settings;/
  );
  assert.match(migration, /^BEGIN;$/m);
  assert.match(migration, /^COMMIT;$/m);
});

test("migration 0101 performs no destructive operation on existing data", () => {
  // The only DROP is the guarded trigger re-create above.
  const drops = migration.match(/\bDROP\b[^\n]*/gi) ?? [];
  assert.deepEqual(
    drops.map((line) => line.trim()),
    ["DROP TRIGGER IF EXISTS pipedrive_integration_settings_set_updated_at"]
  );
  for (const forbidden of [/\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i, /\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i]) {
    assert.equal(forbidden.test(migration), false, `migration must not contain ${forbidden}`);
  }
});

test("explicit constraint names never collide with Postgres column-check auto-names", () => {
  // Postgres names a column-level CHECK `<table>_<column>_check`. A table-level
  // constraint reusing that name makes the migration fail on a fresh database.
  const columnChecks = [...migration.matchAll(/^\s{2}(\w+)\s+\w[^,]*?\bCHECK\b/gm)].map((m) => m[1]);
  assert.ok(columnChecks.includes("owner_mode"), "expected an inline owner_mode CHECK");
  const explicitNames = [...migration.matchAll(/CONSTRAINT\s+(\w+)\s+CHECK/g)].map((m) => m[1]);
  for (const column of columnChecks) {
    assert.equal(
      explicitNames.includes(`pipedrive_integration_settings_${column}_check`),
      false,
      `explicit constraint collides with the auto-name for column "${column}"`
    );
  }
  assert.ok(explicitNames.includes("pipedrive_integration_settings_owner_selection_check"));
  assert.ok(explicitNames.includes("pipedrive_integration_settings_deal_destination_check"));
});

test("one settings record per company, cascading from its company", () => {
  assert.match(
    migration,
    /company_id uuid PRIMARY KEY REFERENCES public\.companies \(id\) ON DELETE CASCADE/
  );
});

test("SQL defaults match the application's default settings", () => {
  const defaults = DEFAULT_PIPEDRIVE_SETUP_SETTINGS;
  assert.equal(defaults.destinationType, "lead");
  assert.match(migration, /destination_type text NOT NULL DEFAULT 'lead'/);
  for (const [column, value] of [
    ["create_person", defaults.createPerson],
    ["create_organization", defaults.createOrganization],
    ["create_follow_up_activity", defaults.createFollowUpActivity],
    ["match_person_by_email", defaults.matchPersonByEmail],
    ["match_organization_by_name_or_domain", defaults.matchOrganizationByNameOrDomain]
  ] as const) {
    assert.equal(value, true);
    assert.match(migration, new RegExp(`${column} boolean NOT NULL DEFAULT true`));
  }
  assert.equal(defaults.ownerMode, "connected_user");
  assert.match(migration, /owner_mode text NOT NULL DEFAULT 'connected_user'/);
  assert.equal(defaults.pipelineId, null);
  assert.equal(defaults.stageId, null);
  assert.equal(defaults.ownerUserId, null);
});

// send_conversation_synopsis / send_generated_email_draft were added to this table by the
// additive 0102 migration rather than rewriting 0101, so column coverage is checked against
// both migrations together.
const migration0102 = readFileSync(
  new URL("../test-fixtures/legacy-lr-migrations/0102_pipedrive_lead_sync.sql", import.meta.url),
  "utf8"
);

test("every persisted column exists in the migration and no credential column does", () => {
  const row = toPipedriveSetupPersistenceRow("11111111-1111-1111-1111-111111111111", {
    ...DEFAULT_PIPEDRIVE_SETUP_SETTINGS,
    destinationType: "deal",
    pipelineId: "7",
    stageId: "42",
    ownerMode: "selected_user",
    ownerUserId: "99"
  });
  for (const column of Object.keys(row)) {
    const definedSomewhere = new RegExp(`\\b${column}\\b`).test(migration) || new RegExp(`\\b${column}\\b`).test(migration0102);
    assert.ok(definedSomewhere, `migration is missing column ${column}`);
  }
  for (const forbidden of ["access_token", "refresh_token", "client_secret", "api_domain"]) {
    assert.equal(forbidden in row, false);
    assert.equal(migration.includes(`${forbidden}_encrypted`), false);
  }
  // Credentials stay in the service-role-only companion table from 0100.
  assert.match(migration, /integration_connection_secrets/);
});

test("the settings table is service-role only", () => {
  assert.match(migration, /ALTER TABLE public\.pipedrive_integration_settings ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.pipedrive_integration_settings FROM anon, authenticated/);
  assert.match(
    migration,
    /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.pipedrive_integration_settings TO service_role/
  );
  assert.equal(/CREATE POLICY/i.test(migration), false);
});
