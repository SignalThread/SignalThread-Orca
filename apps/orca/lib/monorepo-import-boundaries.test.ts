import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

/**
 * The failure-domain rule in docs/DEPLOYMENT_BOUNDARIES.md requires that one product
 * application cannot take another down. A direct cross-app import would create exactly that
 * coupling, so the boundary is enforced here rather than left to review.
 *
 * The app lives at <repo>/apps/orca, so the repository root is two levels up.
 */
const repoRoot = resolve(process.cwd(), "..", "..");
const checker = resolve(repoRoot, "scripts/check-import-boundaries.mjs");

test("the import-boundary checker is present at the repository root", () => {
  assert.ok(existsSync(checker), `missing boundary checker at ${checker}`);
});

test("no application imports a sibling application", () => {
  try {
    const output = execFileSync(process.execPath, [checker], { cwd: repoRoot, encoding: "utf8" });
    assert.match(output, /import boundaries OK/);
  } catch (error) {
    const detail = error instanceof Error && "stderr" in error ? String(error.stderr) : String(error);
    assert.fail(`import boundary violations:\n${detail}`);
  }
});
