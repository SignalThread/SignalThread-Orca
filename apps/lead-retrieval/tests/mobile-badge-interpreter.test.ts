import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  executeBadgeInterpretation,
  normalizeBadgeInterpreterResponse,
  parseBadgeInterpreterRequest,
} from "@/lib/capture/badge-interpreter-core";

const request = parseBadgeInterpreterRequest({
  eventId: "event-1",
  lines: [
    { index: 0, text: "Joseph Colangelo" },
    { index: 1, text: "Bear Analytics" },
  ],
  localSuggestions: { full_name: "Bear Analytics" },
});

test("badge interpreter accepts only bounded indexed OCR input", () => {
  assert.ok(request);
  assert.equal(parseBadgeInterpreterRequest({ eventId: "event-1", lines: [] }), null);
  assert.equal(parseBadgeInterpreterRequest({ eventId: "event-1", lines: [{ index: 0, text: "" }] }), null);
});

test("Joe/Joseph badge fixture accepts grounded name and company recommendations and rejects inventions", () => {
  assert.ok(request);
  assert.equal(normalizeBadgeInterpreterResponse({ fields: {
    full_name: { value: "Invented Person", sourceLineIndexes: [0], confidence: 0.99 },
  } }, request.lines), null);
  assert.deepEqual(normalizeBadgeInterpreterResponse({ fields: {
    full_name: { value: "Joseph Colangelo", sourceLineIndexes: [0], confidence: 0.97 },
    company_text: { value: "Bear Analytics", sourceLineIndexes: [1], confidence: 0.95 },
  } }, request.lines), {
    fields: {
      full_name: { value: "Joseph Colangelo", sourceLineIndexes: [0], confidence: 0.97 },
      company_text: { value: "Bear Analytics", sourceLineIndexes: [1], confidence: 0.95 },
    },
  });
});

test("badge interpreter authorizes the authenticated user's event before provider invocation", async () => {
  assert.ok(request);
  const calls: string[] = [];
  const result = await executeBadgeInterpretation({
    principal: { userId: "user-1", companyId: "company-1" },
    request,
    assertEventAccess: async (userId, eventId) => { calls.push(`access:${userId}:${eventId}`); },
    interpret: async () => {
      calls.push("interpret");
      return { fields: {} };
    },
  });
  assert.deepEqual(result, { fields: {} });
  assert.deepEqual(calls, ["access:user-1:event-1", "interpret"]);
});

test("mobile route uses Sol with an eight-second no-retry budget and safe timing logs", () => {
  const route = readFileSync("app/api/mobile/capture/badge-interpret/route.ts", "utf8");
  const provider = readFileSync("lib/capture/badge-interpreter.ts", "utf8");
  const environmentTemplate = readFileSync(".env.example", "utf8");
  assert.match(route, /Bearer\\s\+\\S\+/);
  assert.match(route, /resolveApiSession/);
  assert.match(route, /assertEventIdAccessibleForUser/);
  assert.match(provider, /process\.env\.BADGE_INTERPRETER_OPENAI_MODEL/);
  assert.match(provider, /process\.env\.OPENAI_API_KEY/);
  assert.match(environmentTemplate, /^BADGE_INTERPRETER_OPENAI_MODEL=gpt-5\.6-sol$/m);
  assert.match(provider, /BADGE_INTERPRETER_PROVIDER_TIMEOUT_MS = 8_000/);
  assert.match(provider, /maxRetries: 0/);
  assert.match(provider, /reasoning: \{ effort: BADGE_INTERPRETER_OPENAI_REASONING_EFFORT \}/);
  assert.match(provider, /BADGE_INTERPRETER_OPENAI_REASONING_EFFORT = "medium"/);
  for (const marker of [
    "openai_started",
    "openai_completed elapsedMs=",
    "validation_complete elapsedMs=",
  ]) {
    assert.match(provider, new RegExp(`\\[badge-ai-backend\\] ${marker}`));
  }
  for (const marker of [
    "request_received",
    "auth_complete elapsedMs=",
    "request_complete totalMs=",
  ]) {
    assert.match(route, new RegExp(`\\[badge-ai-backend\\] ${marker}`));
  }
  assert.doesNotMatch(provider, /gpt-4|gpt-3|fallbackModel|EXPO_PUBLIC_|NEXT_PUBLIC_/);
});
