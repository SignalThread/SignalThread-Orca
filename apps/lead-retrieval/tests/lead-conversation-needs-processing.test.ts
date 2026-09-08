import test from "node:test";
import assert from "node:assert/strict";
import { leadConversationNeedsProcessing } from "../lib/conversations/lead-conversation-needs-processing";

test("needs processing when transcription not finished or failed", () => {
  assert.equal(
    leadConversationNeedsProcessing({
      transcription_status: "pending",
      synthesis_status: null,
      transcript: null,
      summary: null
    }),
    true
  );
  assert.equal(
    leadConversationNeedsProcessing({
      transcription_status: "processing",
      synthesis_status: null,
      transcript: null,
      summary: null
    }),
    true
  );
  assert.equal(
    leadConversationNeedsProcessing({
      transcription_status: "failed",
      synthesis_status: null,
      transcript: null,
      summary: null
    }),
    true
  );
});

test("needs processing when synthesis not complete (with transcript)", () => {
  assert.equal(
    leadConversationNeedsProcessing({
      transcription_status: "completed",
      synthesis_status: "pending",
      transcript: "hello",
      summary: null
    }),
    true
  );
  assert.equal(
    leadConversationNeedsProcessing({
      transcription_status: "completed",
      synthesis_status: "failed",
      transcript: "hello",
      summary: null
    }),
    true
  );
});

test("done when transcription complete + synthesis complete + summary", () => {
  assert.equal(
    leadConversationNeedsProcessing({
      transcription_status: "completed",
      synthesis_status: "completed",
      transcript: "hello",
      summary: "A summary"
    }),
    false
  );
});

test("terminal when completed transcription has no transcript (no retry loop)", () => {
  assert.equal(
    leadConversationNeedsProcessing({
      transcription_status: "completed",
      synthesis_status: null,
      transcript: null,
      summary: null
    }),
    false
  );
});

test("re-run when completed flag but summary missing", () => {
  assert.equal(
    leadConversationNeedsProcessing({
      transcription_status: "completed",
      synthesis_status: "completed",
      transcript: "x",
      summary: ""
    }),
    true
  );
});
