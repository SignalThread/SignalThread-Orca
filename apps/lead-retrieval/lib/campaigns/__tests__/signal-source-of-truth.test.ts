import assert from "node:assert/strict";
import test from "node:test";
import {
  getRenderableSignalIds,
  resolveSelectedSignalIdsFromTokens
} from "../signal-source-of-truth.ts";

const LIBRARY_SIGNALS = [
  { id: "11111111-1111-4111-8111-111111111111", name: "AI Summary", updated_at: "2025-01-01T00:00:00.000Z" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Strategic Angle", updated_at: "2025-01-01T00:00:00.000Z" },
  { id: "33333333-3333-4333-8333-333333333333", name: "Company Context", updated_at: "2025-01-02T00:00:00.000Z" }
];

test("campaign builder renders only DB-provided signals", () => {
  const renderableIds = getRenderableSignalIds(LIBRARY_SIGNALS);

  assert.deepEqual(renderableIds, LIBRARY_SIGNALS.map((signal) => signal.id));
  assert.equal(LIBRARY_SIGNALS.some((signal) => signal.name === "Custom Insight Block"), false);
});

test("legacy selected names are resolved to ids and unknown names are dropped", () => {
  const resolvedIds = resolveSelectedSignalIdsFromTokens({
    selectedTokens: [
      "AI Summary",
      "Custom Insight Block",
      "22222222-2222-4222-8222-222222222222"
    ],
    librarySignals: LIBRARY_SIGNALS
  });

  assert.deepEqual(resolvedIds, [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222"
  ]);
});

test("Custom Insight Block appears only when included by API response", () => {
  const withCustomSignal = [
    ...LIBRARY_SIGNALS,
    { id: "44444444-4444-4444-8444-444444444444", name: "Custom Insight Block", updated_at: "2025-01-01T00:00:00.000Z" }
  ];

  const renderableIds = getRenderableSignalIds(withCustomSignal);
  assert.equal(renderableIds.includes("44444444-4444-4444-8444-444444444444"), true);
});

test("duplicate saved signal names collapse to one id when campaign mixes UUID + legacy name token", () => {
  const olderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const newerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const library = [
    { id: olderId, name: "Company Context", updated_at: "2025-01-01T00:00:00.000Z" },
    { id: newerId, name: "Company Context", updated_at: "2025-06-01T00:00:00.000Z" },
    { id: "11111111-1111-4111-8111-111111111111", name: "AI Summary", updated_at: "2025-01-01T00:00:00.000Z" }
  ];

  const resolved = resolveSelectedSignalIdsFromTokens({
    selectedTokens: [olderId, "Company Context"],
    librarySignals: library
  });

  assert.deepEqual(resolved, [olderId]);
});

test("when two duplicate-name ids are selected without explicit UUID preference, keep newest updated_at", () => {
  const olderId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const newerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const library = [
    { id: olderId, name: "Company Context", updated_at: "2025-01-01T00:00:00.000Z" },
    { id: newerId, name: "Company Context", updated_at: "2025-06-01T00:00:00.000Z" }
  ];

  const resolved = resolveSelectedSignalIdsFromTokens({
    selectedTokens: [olderId, newerId],
    librarySignals: library
  });

  assert.deepEqual(resolved, [newerId]);
});
