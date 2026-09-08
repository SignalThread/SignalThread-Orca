import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const migrationSource = readFileSync(
  join(here, "..", "supabase", "migrations", "0051_import_batch_row_briefings_published_review_rls.sql"),
  "utf8"
);

describe("import_batch_row_briefings RLS for published batch review (exhibitor_admin)", () => {
  it("INSERT policy allows draft and published batches for company-scoped exhibitor roles", () => {
    assert.match(
      migrationSource,
      /import_batch_row_briefings_insert_exhibitor[\s\S]*?status in \('draft', 'published'\)/,
      "INSERT must allow published batches so ensureBriefingRowsForBatch succeeds after publish"
    );
    assert.match(
      migrationSource,
      /current_company_id\(\)/,
      "INSERT must remain scoped to exhibitor company"
    );
  });

  it("UPDATE policy allows draft and published for approvals and content refresh on published batches", () => {
    assert.match(
      migrationSource,
      /import_batch_row_briefings_update_exhibitor[\s\S]*?status in \('draft', 'published'\)/,
      "UPDATE must allow published batches for review/approve flows"
    );
  });

  it("wrong-scope batches are still excluded (batch must belong to current_company_id)", () => {
    const insertBlock = migrationSource.match(
      /create policy "import_batch_row_briefings_insert_exhibitor"[\s\S]*?\);/
    );
    assert.ok(insertBlock);
    assert.ok(
      insertBlock![0].includes("company_id = public.current_company_id()"),
      "INSERT policy must tie batch to current company"
    );
  });
});
