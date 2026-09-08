import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));

const migrationSource = readFileSync(
  join(here, "..", "test-fixtures", "legacy-lr-migrations", "0040_import_batch_row_briefings_exhibitor_admin_rls.sql"),
  "utf8"
);

const queueRouteSource = readFileSync(
  join(here, "..", "app", "api", "exhibitor", "import-wizard", "batches", "[batchId]", "briefing-queue", "route.ts"),
  "utf8"
);

const rowRouteSource = readFileSync(
  join(here, "..", "app", "api", "exhibitor", "import-wizard", "batches", "[batchId]", "briefing-rows", "[rowId]", "route.ts"),
  "utf8"
);

const approveAllRouteSource = readFileSync(
  join(here, "..", "app", "api", "exhibitor", "import-wizard", "batches", "[batchId]", "briefing-rows", "approve-all", "route.ts"),
  "utf8"
);

describe("import_batch_row_briefings RLS for exhibitor_admin", () => {
  it("migration 0040 grants INSERT to exhibitor_admin", () => {
    assert.ok(
      migrationSource.includes("for insert"),
      "migration must replace the INSERT policy"
    );
    assert.ok(
      migrationSource.includes("('exhibitor', 'exhibitor_admin')"),
      "INSERT policy must allow exhibitor_admin"
    );
  });

  it("migration 0040 grants SELECT to exhibitor_admin", () => {
    assert.ok(
      migrationSource.includes("for select"),
      "migration must replace the SELECT policy"
    );
    assert.ok(
      /for select[\s\S]*?('exhibitor', 'exhibitor_admin')/.test(migrationSource),
      "SELECT policy must allow exhibitor_admin"
    );
  });

  it("migration 0040 grants UPDATE to exhibitor_admin", () => {
    assert.ok(
      migrationSource.includes("for update"),
      "migration must replace the UPDATE policy"
    );
    assert.ok(
      /for update[\s\S]*?('exhibitor', 'exhibitor_admin')/.test(migrationSource),
      "UPDATE policy must allow exhibitor_admin"
    );
  });

  it("migration 0040 grants DELETE to exhibitor_admin", () => {
    assert.ok(
      migrationSource.includes("for delete"),
      "migration must replace the DELETE policy"
    );
    assert.ok(
      /for delete[\s\S]*?('exhibitor', 'exhibitor_admin')/.test(migrationSource),
      "DELETE policy must allow exhibitor_admin"
    );
  });
});

describe("briefing routes return structured 403 for RLS errors", () => {
  it("briefing-queue route maps RLS error to 403", () => {
    assert.ok(
      queueRouteSource.includes("permission_denied"),
      "queue route must return permission_denied code"
    );
    assert.ok(
      queueRouteSource.includes("row-level security"),
      "queue route must detect RLS error pattern"
    );
  });

  it("briefing-rows/[rowId] route maps RLS error to 403", () => {
    assert.ok(
      rowRouteSource.includes("permission_denied"),
      "row route must return permission_denied code"
    );
    assert.ok(
      rowRouteSource.includes("row-level security"),
      "row route must detect RLS error pattern"
    );
  });

  it("briefing-rows/approve-all route maps RLS error to 403", () => {
    assert.ok(
      approveAllRouteSource.includes("permission_denied"),
      "approve-all route must return permission_denied code"
    );
    assert.ok(
      approveAllRouteSource.includes("row-level security"),
      "approve-all route must detect RLS error pattern"
    );
  });
});
