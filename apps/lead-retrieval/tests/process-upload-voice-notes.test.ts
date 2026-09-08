
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("processConversationUpload declares voice-note sync flag on params type", () => {
  const src = readFileSync(path.join(root, "lib/conversations/process-upload.ts"), "utf8");
  assert.match(
    src,
    /voiceNoteContextConversationSync\?:\s*boolean[\s\S]*sync_voice_notes_from_conversation/
  );
});

test("after transcript persist, conversation synthesis path unchanged for legacy uploads", () => {
  const src = readFileSync(path.join(root, "lib/conversations/process-upload.ts"), "utf8");
  const idxVoice = src.indexOf("voiceNoteContextConversationSync");
  const idxSynthesisStarted = src.indexOf("[conversations/upload] synthesis started");
  assert.ok(idxVoice >= 0 && idxSynthesisStarted > idxVoice);
});

test("processConversationUpload uses shared sales intelligence contract for synthesis", () => {
  const src = readFileSync(path.join(root, "lib/conversations/process-upload.ts"), "utf8");
  assert.match(src, /buildConversationInsightPrompt/);
  assert.match(src, /CONVERSATION_INSIGHT_JSON_SCHEMA/);
  assert.match(src, /parseConversationInsightJson/);
  assert.doesNotMatch(src, /Analyze this sales conversation transcript and return STRICT JSON only/);
});
