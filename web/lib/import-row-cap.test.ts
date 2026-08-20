import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  MAX_IMPORT_ROWS,
  exceedsImportRowLimit,
  importRowLimitError,
} from "@/lib/import";

// Regression for the import row-cap safety backstop: server import routes accept a
// client-parsed rows array, so each must reject oversized payloads with a stable
// error instead of processing an unbounded number of rows.
test("exceedsImportRowLimit only trips above the cap", () => {
  assert.equal(exceedsImportRowLimit(0), false);
  assert.equal(exceedsImportRowLimit(1), false);
  assert.equal(exceedsImportRowLimit(MAX_IMPORT_ROWS), false, "cap itself is allowed");
  assert.equal(exceedsImportRowLimit(MAX_IMPORT_ROWS + 1), true);
});

test("importRowLimitError returns a stable, informative payload", () => {
  const payload = importRowLimitError(MAX_IMPORT_ROWS + 5);
  assert.equal(payload.code, "TOO_MANY_ROWS");
  assert.match(payload.error, new RegExp(String(MAX_IMPORT_ROWS)));
  assert.match(payload.error, /10005/);
});

// Wiring check: every server import route that accepts a client-parsed rows array
// must enforce the cap. Mirrors the repo's source-assertion regression tests.
test("all section import routes enforce the row cap", () => {
  const appDir = join(process.cwd(), "app", "api", "events");
  const guardedRoutes = [
    join(appDir, "[eventId]", "attendees", "imports", "route.ts"),
    join(appDir, "[eventId]", "directory", "imports", "route.ts"),
    join(appDir, "[eventId]", "speakers", "import", "route.ts"),
    join(appDir, "[eventId]", "matrix-rows", "import", "route.ts"),
    join(appDir, "[eventId]", "timeline-items", "import", "route.ts"),
    join(appDir, "[eventId]", "budget", "import", "route.ts"),
  ];
  for (const routePath of guardedRoutes) {
    const source = readFileSync(routePath, "utf8");
    assert.match(source, /exceedsImportRowLimit/, `${routePath} must call exceedsImportRowLimit`);
    assert.match(source, /status: 413/, `${routePath} must return 413 when the cap is exceeded`);
  }

  const eventBuilderRoute = readFileSync(
    join(appDir, "import", "create", "route.ts"),
    "utf8",
  );
  assert.match(eventBuilderRoute, /importRowCount/, "event builder must cap the combined reviewed plan");
  assert.match(eventBuilderRoute, /exceedsImportRowLimit\(importRowCount\)/);
  assert.match(eventBuilderRoute, /413/);

  // Marketing recipients enforces the same ceiling via its zod schema.
  const marketingHelpers = readFileSync(
    join(appDir, "[eventId]", "marketing", "_lib", "route-helpers.ts"),
    "utf8",
  );
  assert.match(marketingHelpers, /MAX_IMPORT_ROWS/, "marketing import must bound rows by MAX_IMPORT_ROWS");
});
