import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const migrationSource = readFileSync(
  join(here, "..", "supabase", "migrations", "0048_lead_briefings_exhibitor_admin_rls.sql"),
  "utf8"
);

describe("lead_briefings RLS allows exhibitor_admin sync writes", () => {
  it("select policy includes exhibitor_admin", () => {
    assert.ok(
      /for select[\s\S]*?current_role\(\) in \('exhibitor', 'exhibitor_admin'\)/.test(
        migrationSource
      ),
      "select policy must include exhibitor_admin"
    );
  });

  it("insert policy includes exhibitor_admin", () => {
    assert.ok(
      /for insert[\s\S]*?current_role\(\) in \('exhibitor', 'exhibitor_admin'\)/.test(
        migrationSource
      ),
      "insert policy must include exhibitor_admin"
    );
  });

  it("update policy includes exhibitor_admin in using and with check", () => {
    assert.ok(
      /for update[\s\S]*?using \([\s\S]*?current_role\(\) in \('exhibitor', 'exhibitor_admin'\)/.test(
        migrationSource
      ),
      "update using clause must include exhibitor_admin"
    );
    assert.ok(
      /with check \([\s\S]*?current_role\(\) in \('exhibitor', 'exhibitor_admin'\)/.test(
        migrationSource
      ),
      "update with check clause must include exhibitor_admin"
    );
  });
});
