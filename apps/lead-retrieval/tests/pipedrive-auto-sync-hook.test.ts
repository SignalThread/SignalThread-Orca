import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the shared lead-capture chokepoint fires the Pipedrive auto-sync hook for every real capture path", () => {
  const src = read("lib/workflows/emit/non-fatal-lead-captured-emit.ts");
  assert.match(src, /import \{ attemptPipedriveAutoSyncEnqueue \} from "@\/lib\/integrations\/pipedrive\/auto-sync-hook"/);
  assert.match(src, /await attemptPipedriveAutoSyncEnqueue\(\{ leadId: emitInput\.leadId, companyId: emitInput\.companyId \}\)/);
});

test("the hook is independent of the workflow-automation emit — it runs before the emit's own try/catch, not nested inside it", () => {
  const src = read("lib/workflows/emit/non-fatal-lead-captured-emit.ts");
  const hookIndex = src.indexOf("attemptPipedriveAutoSyncEnqueue({");
  const tryIndex = src.indexOf("try {\n    const emitResult");
  assert.ok(hookIndex > 0 && tryIndex > 0);
  assert.ok(hookIndex < tryIndex, "the Pipedrive hook must run before the workflow emit's try block, not depend on its outcome");
});

test("the auto-sync hook never throws — every failure path is caught and logged, not rethrown", () => {
  const src = read("lib/integrations/pipedrive/auto-sync-hook.ts");
  assert.match(src, /try \{[\s\S]*catch \(error\) \{/);
  assert.equal(/throw /.test(src.slice(src.indexOf("try {"))), false);
});

test("the hook only enqueues when Pipedrive is connected for the company — it never syncs inline", () => {
  const src = read("lib/integrations/pipedrive/auto-sync-hook.ts");
  assert.match(src, /if \(!connection\.connected\) return;/);
  assert.equal(src.includes("syncLeadToPipedrive"), false, "the auto hook must only enqueue, never call the sync service directly");
  assert.match(src, /source: "auto"/);
});

test("the hook is only ever invoked at lead-capture time — it never queries or backfills historical leads", () => {
  const src = read("lib/integrations/pipedrive/auto-sync-hook.ts");
  assert.equal(/\.select\(|\.from\("leads"\)/.test(src), false, "the auto hook must not query the leads table itself");
});
