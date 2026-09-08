import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function databaseTypeSource(): string {
  return read("types/database.ts");
}

function tableBlock(tableName: string): string {
  const src = databaseTypeSource();
  const start = src.indexOf(`      ${tableName}: {`);
  assert.notEqual(start, -1, `types/database.ts should include table ${tableName}`);
  const nextMatch = /\n      [A-Za-z_][A-Za-z0-9_]*: \{/.exec(src.slice(start + 1));
  const next = nextMatch ? start + 1 + nextMatch.index : -1;
  return src.slice(start, next === -1 ? undefined : next);
}

function migrationSource(): string {
  // The active path holds the clean canonical baseline; the historical Admin
  // migrations that these assertions were written against live on as fixtures.
  const dirs = [join(root, "supabase", "migrations"), join(root, "test-fixtures", "legacy-lr-migrations")];
  return dirs
    .filter((dir) => existsSync(dir))
    .flatMap((dir) =>
      readdirSync(dir)
        .filter((file) => file.endsWith(".sql"))
        .sort()
        .map((file) => readFileSync(join(dir, file), "utf8"))
    )
    .join("\n\n");
}

function filesUnder(dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const path = join(abs, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      out.push(...filesUnder(join(dir, entry)));
    } else if (/\.(ts|tsx|sql)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

describe("schema contract: access and briefing columns", () => {
  it("import_batches exposes source/status fields used by import wizard and selected-lead brief workspaces", () => {
    const block = tableBlock("import_batches");
    const migrations = migrationSource();
    const service = read("lib/server/import-wizard/import-batch-service.ts");
    const selectedLeadService = read("lib/server/briefings/create-brief-workspace-from-leads.ts");

    for (const column of [
      "company_id",
      "status",
      "data_revision",
      "source_last_filename",
      "source_kind",
      "source_selected_lead_ids",
      "published_at",
      "discarded_at",
    ]) {
      assert.match(block, new RegExp(`${column}:`), `types should include import_batches.${column}`);
    }

    assert.match(migrations, /ALTER TABLE public\.import_batches[\s\S]*ADD COLUMN IF NOT EXISTS source_kind/i);
    assert.match(migrations, /ADD COLUMN IF NOT EXISTS source_selected_lead_ids/i);
    assert.match(migrations, /import_batches_one_import_file_draft_per_company/);
    assert.match(service, /source_kind/);
    assert.match(selectedLeadService, /source_kind:\s*"selected_leads"/);
  });

  it("event_users and users expose canonical access columns", () => {
    const eventUsers = tableBlock("event_users");
    const users = tableBlock("users");
    const migrations = migrationSource();
    const resolver = read("lib/server/company-event-access.ts");

    for (const column of ["user_id", "event_id", "exhibitor_company_id", "status", "permissions"]) {
      assert.match(eventUsers, new RegExp(`${column}:`), `types should include event_users.${column}`);
    }
    for (const column of ["role", "company_id", "event_access_mode"]) {
      assert.match(users, new RegExp(`${column}:`), `types should include users.${column}`);
    }

    assert.match(migrations, /ADD COLUMN IF NOT EXISTS event_access_mode/i);
    assert.match(migrations, /users_event_access_mode_check/);
    assert.match(resolver, /\.select\("id, role, company_id, event_access_mode"\)/);
    assert.match(resolver, /\.select\("event_id, permissions"\)/);
    assert.match(resolver, /\.eq\("exhibitor_company_id",\s*exhibitorCompanyId\)/);
  });

  it("leads, briefing rows, and approved brief sync fields are present", () => {
    const leads = tableBlock("leads");
    const rowBriefings = tableBlock("import_batch_row_briefings");
    const leadBriefings = tableBlock("lead_briefings");
    const selectedLeadService = read("lib/server/briefings/create-brief-workspace-from-leads.ts");
    const syncService = read("lib/server/import-wizard/import-batch-briefing-service.ts");

    for (const column of ["company_id", "event_id", "full_name", "email", "phone", "company_text", "status", "rating", "temperature"]) {
      assert.match(leads, new RegExp(`${column}:`), `types should include leads.${column}`);
    }
    assert.match(migrationSource(), /ALTER TABLE public\.leads[\s\S]*ADD COLUMN IF NOT EXISTS phone text NULL/i);
    assert.match(leads, /temperature:\s*string \| null/, "leads.temperature should be nullable for unassessed leads");
    assert.match(migrationSource(), /alter column temperature drop default/i);
    assert.match(migrationSource(), /alter column temperature drop not null/i);
    for (const column of ["batch_id", "batch_row_id", "content", "approval_status", "reviewed_at", "reviewed_by"]) {
      assert.match(rowBriefings, new RegExp(`${column}:`), `types should include import_batch_row_briefings.${column}`);
    }
    for (const column of ["lead_id", "company_id", "content", "approval_status"]) {
      assert.match(leadBriefings, new RegExp(`${column}:`), `types should include lead_briefings.${column}`);
    }

    assert.match(selectedLeadService, /linkage:\s*\{\s*published_lead_id:/);
    assert.match(syncService, /getPublishedLeadLinkageId/);
    assert.match(syncService, /\.from\("lead_briefings"\)[\s\S]*\.upsert\(/);
    assert.match(syncService, /approval_status:\s*approvalStatus/);
  });

  it("badge_templates references cannot appear without schema support for company_id and event_id", () => {
    const searchable = ["app", "lib", "components", "tests", "supabase", "types"];
    const references = searchable
      .flatMap(filesUnder)
      .filter((file) => !file.endsWith("schema-contract.test.ts"))
      .filter((file) => readFileSync(file, "utf8").includes("badge_templates"));

    if (references.length === 0) {
      assert.deepEqual(references, [], "this repo currently has no badge_templates surface/schema");
      return;
    }

    const badgeTemplates = tableBlock("badge_templates");
    assert.match(badgeTemplates, /company_id:/);
    assert.match(badgeTemplates, /event_id:/);
  });
});
