import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("compat insights regenerate route exists and queues cumulative insight regeneration", () => {
  const src = readFileSync(
    path.join(root, "app/api/leads/[leadId]/insights/regenerate/route.ts"),
    "utf8"
  );
  assert.match(src, /canReadExhibitorLeadsInContext/);
  assert.match(src, /assertEventIdAccessibleForUser/);
  assert.match(src, /buildLeadInsightRegenerationPrompt/);
  assert.match(src, /CONVERSATION_INSIGHT_JSON_SCHEMA/);
  assert.match(src, /parseConversationInsightJson/);
  assert.match(src, /getLeadInsightsOpenAIModel/);
  assert.match(src, /from\("lead_voice_notes"\)/);
  assert.match(src, /from\("lead_cumulative_insights"\)/);
  assert.match(src, /status:\s*"completed"/);
  assert.doesNotMatch(src, /const INSIGHT_MODEL =/);
});
