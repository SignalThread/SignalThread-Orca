import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const source = readFileSync(
  join(process.cwd(), "lib/server/import-wizard/import-batch-service.ts"),
  "utf8"
);

test("final publish validates persisted rows and mappings before changing the batch status", () => {
  const validationAt = source.indexOf('if (action === "publish") {\n    const mapping');
  const statusUpdateAt = source.indexOf('.from("import_batches")\n    .update(patch as never)');
  assert.ok(validationAt >= 0, "publish must derive canonical validation");
  assert.ok(statusUpdateAt >= 0 && validationAt < statusUpdateAt, "validation must precede publish status mutation");
  assert.match(source, /if \(!validation\.continueAllowed\) \{\s*throw new Error\("batch_validation_failed"\)/);
});
