import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/**
 * Source contract: the workflow runtime — runner, registry, emit/trigger layer, all
 * step handlers, and the approval API routes — must NOT import any send / sync /
 * outbound-webhook module. Workflow campaign steps may create draft campaign messages,
 * but sending still happens only through explicit campaign send paths.
 *
 * If a future change accidentally pulls a send module into the workflow runtime, this
 * test fails. It runs as a static-source guard: it reads files; it does not execute
 * the route.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

const DISALLOWED_IMPORT_PATTERNS = [
  /from\s+["']@\/lib\/campaigns\/executeCampaignSend/,
  /from\s+["']@\/lib\/campaigns\/campaign-send-status/,
  /from\s+["']@\/lib\/integrations\/sendgrid/,
  /from\s+["']@sendgrid\/mail["']/,
  /from\s+["']@\/lib\/integrations\/webhook/,
  /from\s+["']@\/lib\/outbound/,
  /from\s+["']@\/lib\/webhooks/
];

/** Recursively gather all `.ts` files under `root`, excluding test files. */
function gatherTsFiles(root: string): string[] {
  const out: string[] = [];
  function walk(dir: string) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const stat = statSync(path);
      if (stat.isDirectory()) {
        walk(path);
      } else if (stat.isFile() && path.endsWith(".ts") && !path.endsWith(".test.ts")) {
        out.push(path);
      }
    }
  }
  walk(root);
  return out;
}

describe("Workflow runtime: no auto-send integrations", () => {
  const workflowDirs = [
    join(repoRoot, "lib", "workflows"),
    join(repoRoot, "app", "api", "internal", "workflow-tick"),
    join(repoRoot, "app", "api", "exhibitor", "generated-drafts")
  ];

  const allFiles = workflowDirs.flatMap((dir) => {
    try {
      return gatherTsFiles(dir);
    } catch {
      return [];
    }
  });

  it("scanned at least the expected workflow modules", () => {
    assert.ok(allFiles.length >= 10, `expected to scan >=10 workflow files, found ${allFiles.length}`);
  });

  for (const filePath of allFiles) {
    const relPath = filePath.replace(repoRoot + "/", "");
    it(`${relPath} does not import any send / blast-email / outbound webhook module`, () => {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of DISALLOWED_IMPORT_PATTERNS) {
        assert.equal(
          pattern.test(source),
          false,
          `${relPath} matched disallowed import ${pattern}`
        );
      }
    });
  }
});

describe("Workflow campaign draft creation stays draft-only", () => {
  it("the workflow draft persistence helper never marks messages as scheduled/sending/sent", () => {
    const source = readFileSync(
      join(repoRoot, "lib/campaigns/workflow-campaign-draft-persistence.ts"),
      "utf8"
    );
    const codeWithoutComments = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.match(codeWithoutComments, /status:\s*["']draft["']/);
    assert.doesNotMatch(codeWithoutComments, /status:\s*["']scheduled["']/);
    assert.doesNotMatch(codeWithoutComments, /status:\s*["']sending["']/);
    assert.doesNotMatch(codeWithoutComments, /status:\s*["']sent["']/);
  });
});
