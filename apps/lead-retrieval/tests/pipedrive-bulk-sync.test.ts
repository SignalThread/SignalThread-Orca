import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("bulk-sync route processes each lead independently and never lets one enqueue failure abort the batch", () => {
  const src = read("app/api/integrations/pipedrive/bulk-sync/route.ts");
  // A per-item try/catch around the enqueue call, inside the loop over leadIds.
  assert.match(src, /for \(const leadId of leadIds/);
  assert.match(src, /try \{[\s\S]*?enqueuePipedriveSync\([\s\S]*?\}\s*catch \(error\) \{/);
  assert.match(src, /skipped\.push\(\{ leadId, reason: error instanceof Error/);
});

test("bulk-sync route does not call the Pipedrive HTTP client — it only enqueues", () => {
  const src = read("app/api/integrations/pipedrive/bulk-sync/route.ts");
  assert.equal(src.includes("syncLeadToPipedrive"), false);
  assert.match(src, /enqueuePipedriveSync/);
});

test("bulk-sync route caps the number of leads accepted in one request", () => {
  const src = read("app/api/integrations/pipedrive/bulk-sync/route.ts");
  assert.match(src, /MAX_BULK_LEAD_IDS/);
  assert.match(src, /leadIds\.length > MAX_BULK_LEAD_IDS/);
});

test("enqueuePipedriveSync: already-synced and already-syncing leads are excluded (no-op), not re-queued", () => {
  const src = read("lib/integrations/pipedrive/queue.ts");
  assert.match(src, /if \(existing\.data\?\.status === "synced"\) return "already_synced";/);
  assert.match(src, /if \(existing\.data\?\.status === "syncing" \|\| existing\.data\?\.status === "queued"\) return "already_syncing";/);
});

test("a failed lead is requeued with attempts reset, so bulk re-select acts as a retry", () => {
  const src = read("lib/integrations/pipedrive/queue.ts");
  assert.match(src, /status: "queued",\s*\n\s*attempts: 0,/);
});

test("the tick also self-heals due failed rows within the automatic-attempt cap, not only fresh queue entries", () => {
  const src = read("lib/integrations/pipedrive/queue.ts");
  assert.match(src, /claimRowInStatus\(supabase, "queued", nowIso\)\) \?\? \(await claimRowInStatus\(supabase, "failed", nowIso\)/);
});
