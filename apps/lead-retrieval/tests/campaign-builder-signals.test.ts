import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getRenderableSignalIds,
  resolveSelectedSignalIdsFromTokens
} from "../lib/campaigns/signal-source-of-truth";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const defaultSignal = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Company Context",
  updated_at: "2026-06-07T10:00:00.000Z"
};

test("campaign builder requests default/global signals for exhibitor draft selection", () => {
  const builder = read("components/campaigns/campaign-builder.tsx");
  const route = read("app/api/signals/route.ts");
  const data = read("lib/data/signals.ts");

  assert.match(builder, /includeDefaults:\s*"1"/);
  assert.match(route, /const includeDefaults = url\.searchParams\.get\("includeDefaults"\) === "1"/);
  assert.match(route, /includeDefaults,/);
  assert.match(data, /if \(!options\.includeDefaults\)/);
  assert.match(data, /\.eq\("signal_scope", "default"\)/);
  assert.match(data, /Promise\.all\(\[companyQuery, defaultQuery\]\)/);
});

test("campaign builder can render and select an available default signal", () => {
  const renderable = getRenderableSignalIds([defaultSignal]);
  assert.deepEqual(renderable, [defaultSignal.id]);

  const selected = resolveSelectedSignalIdsFromTokens({
    selectedTokens: ["Company Context"],
    librarySignals: [defaultSignal]
  });
  assert.deepEqual(selected, [defaultSignal.id]);
});

test("campaign builder selection populates raw signal content and enables draft generation", () => {
  const builder = read("components/campaigns/campaign-builder.tsx");

  assert.match(builder, /const selectedSignalRecords = useMemo/);
  assert.match(builder, /rawSignalContentById/);
  assert.match(builder, /<EmailSignalBlock/);
  assert.match(builder, /disabled=\{!canEditDraft \|\| selectedCount === 0 \|\| selectedSignalIds\.length === 0 \|\| generatingDraft\}/);
  assert.match(builder, /onSelectSignals=\{\(signalNames\) => \{/);
  assert.match(builder, /setSelectedSignalIds\(signalIds\)/);
});
