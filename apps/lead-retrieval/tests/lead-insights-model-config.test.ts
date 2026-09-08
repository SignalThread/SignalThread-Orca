import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("lead insights model helper is server-only and defaults to gpt-4.1", () => {
  const src = readFileSync(
    path.join(root, "lib/server/lead-insights/modelConfig.ts"),
    "utf8"
  );

  assert.match(src, /import "server-only";/);
  assert.match(src, /LEAD_INSIGHTS_OPENAI_MODEL/);
  assert.match(src, /gpt-4\.1/);
});

test("lead insights generation avoids the server-only model config for playground runs only", () => {
  const src = readFileSync(
    path.join(root, "lib/voice-notes/server/leadInsightsGeneration.ts"),
    "utf8"
  );

  assert.match(src, /ALLOW_LEAD_INSIGHTS_PLAYGROUND/);
  assert.match(src, /LEAD_INSIGHTS_OPENAI_MODEL/);
  assert.match(src, /gpt-4\.1/);
  assert.match(src, /modelConfig/);
});
