import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const service = readFileSync(
  join(process.cwd(), "lib/server/import-wizard/event-briefing-strategy-service.ts"),
  "utf8"
);
const route = readFileSync(join(process.cwd(), "app/api/exhibitor/briefing-setup/route.ts"), "utf8");
const client = readFileSync(join(process.cwd(), "components/exhibitor/briefing-setup-client.tsx"), "utf8");
const migration = readFileSync(join(process.cwd(), "test-fixtures/legacy-lr-migrations/0097_patch_event_briefing_strategy.sql"), "utf8");

test("strategy saves use an atomic server-side JSON patch, not replacement", () => {
  assert.match(service, /rpc\("patch_event_briefing_strategy"/);
  assert.doesNotMatch(service, /\.update\(\{ briefing_strategy:/);
  assert.match(migration, /COALESCE\(briefing_strategy, '\{\}'::jsonb\) \|\| \(p_patch - 'guardrails'\)/);
  assert.match(migration, /COALESCE\(briefing_strategy->'guardrails', '\{\}'::jsonb\) \|\| p_patch->'guardrails'/);
});

test("route validates partial patches and returns the confirmed canonical strategy", () => {
  assert.match(route, /parseEventBriefingStrategyPatch\(body\.strategy\)/);
  assert.match(route, /return NextResponse\.json\(\{ ok: true, strategy \}\)/);
  assert.match(route, /invalid_strategy_patch.*empty_strategy_patch/s);
});

test("autosave sends changed fields, serializes requests, and only marks saved after confirmation", () => {
  assert.match(client, /payloadForPut\(sentDraft, savedFoundationsRef\.current\)/);
  assert.match(client, /if \(saveInFlightRef\.current\) return saveInFlightRef\.current/);
  assert.match(client, /const confirmed = strategyFromApi\(json\.strategy\)/);
  assert.match(client, /baselineRef\.current = serializeFoundations\(confirmed\)/);
});
