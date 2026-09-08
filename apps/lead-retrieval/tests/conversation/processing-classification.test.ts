// @lr area=conversation-pipeline severity=P1 layer=unit category=local-only
/**
 * Conversation processing state machine and retry classification — plan §69.
 *
 * §69's sharpest requirement:
 *
 *   > **failure classification before retry** — retry eligibility derives from error
 *   > category, and a bulk reprocess is impossible without classification.
 *
 * ── Finding LR-PROD-012 ─────────────────────────────────────────────────────────
 *
 * There is no classification. `lead_conversations` stores `transcription_error` and
 * `synthesis_error` as **free text** (migrations 0013, 0090). There is no error category
 * column and no attempt counter. `leadConversationNeedsProcessing` returns `true` for any
 * `failed` status regardless of cause, so a permanently-failed record — zero-byte audio,
 * corrupt container, missing storage path — is eligible for retry forever, and a bulk
 * reprocess cannot tell "retry this" from "this will never succeed".
 *
 * One terminal case *is* handled: transcription completed with an empty transcript
 * returns `false`, so no-speech recordings do not retry-loop. That proves the concept was
 * understood; it was simply never generalised.
 *
 * Tests asserting the required behaviour are `.skip`ped with `KNOWN-DEFECT:` markers.
 * Tests documenting current behaviour run, so a fix turns them red.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  leadConversationNeedsProcessing,
  type LeadConversationProcessingSnapshot,
} from "../../lib/conversations/lead-conversation-needs-processing";
import {
  CONVERSATION_TRANSCRIPTION_STATUSES,
  CONVERSATION_SYNTHESIS_STATUSES,
  CONVERSATION_READINESS_STATUSES,
  CONVERSATION_LIFECYCLE,
  EMPTY_TRANSCRIPT_SYNTHESIS_ERROR,
  MISSING_STORAGE_TRANSCRIPTION_ERROR,
} from "../../lib/conversations/conversation-lifecycle";

const snapshot = (over: Partial<LeadConversationProcessingSnapshot> = {}): LeadConversationProcessingSnapshot => ({
  transcription_status: "completed",
  synthesis_status: "completed",
  transcript: "a real transcript",
  summary: "a real summary",
  ...over,
});

// ── status vocabularies ────────────────────────────────────────────────────────────

describe("status vocabularies are closed sets", () => {
  it("transcription statuses are exactly the four legal values", () => {
    assert.deepStrictEqual([...CONVERSATION_TRANSCRIPTION_STATUSES], ["pending", "processing", "completed", "failed"]);
  });

  it("synthesis statuses mirror transcription", () => {
    assert.deepStrictEqual([...CONVERSATION_SYNTHESIS_STATUSES], ["pending", "processing", "completed", "failed"]);
  });

  it("readiness uses `ready`, not `completed` — the vocabularies are deliberately different", () => {
    assert.deepStrictEqual([...CONVERSATION_READINESS_STATUSES], ["pending", "processing", "ready", "failed"]);
    assert.equal(CONVERSATION_READINESS_STATUSES.includes("completed" as never), false);
  });

  it("every lifecycle event name is unique", () => {
    assert.equal(new Set(CONVERSATION_LIFECYCLE).size, CONVERSATION_LIFECYCLE.length);
  });

  it("the lifecycle covers both terminal outcomes for each stage", () => {
    for (const stage of ["transcription", "synthesis"]) {
      assert.ok(CONVERSATION_LIFECYCLE.includes(`${stage}_completed` as never), `${stage} needs a completed event`);
      assert.ok(CONVERSATION_LIFECYCLE.includes(`${stage}_failed` as never), `${stage} needs a failed event`);
    }
  });

  it("no-speech is a first-class outcome, not an error", () => {
    // A recording with no speech is a valid result. Modelling it as a failure would put
    // silent recordings into the retry pool forever.
    assert.ok(CONVERSATION_LIFECYCLE.includes("no_speech" as never));
    assert.ok(CONVERSATION_LIFECYCLE.includes("skipped_no_speech" as never));
  });
});

// ── the retry gate as it behaves today ─────────────────────────────────────────────

describe("retry gate — states that must be reprocessed", () => {
  it("a pending transcription needs processing", () => {
    assert.equal(leadConversationNeedsProcessing(snapshot({ transcription_status: "pending" })), true);
  });

  it("an in-flight transcription needs processing, so an interrupted worker resumes", () => {
    assert.equal(leadConversationNeedsProcessing(snapshot({ transcription_status: "processing" })), true);
  });

  it("a completed transcription with a pending synthesis needs processing", () => {
    assert.equal(leadConversationNeedsProcessing(snapshot({ synthesis_status: "pending" })), true);
  });

  it("a completed synthesis with no summary needs processing — status alone is not proof", () => {
    assert.equal(leadConversationNeedsProcessing(snapshot({ summary: "" })), true);
    assert.equal(leadConversationNeedsProcessing(snapshot({ summary: null })), true);
    assert.equal(leadConversationNeedsProcessing(snapshot({ summary: "   " })), true, "whitespace is not a summary");
  });

  it("a null status needs processing rather than being treated as done", () => {
    assert.equal(leadConversationNeedsProcessing(snapshot({ transcription_status: null })), true);
  });

  it("status matching is case- and whitespace-insensitive", () => {
    assert.equal(leadConversationNeedsProcessing(snapshot({ transcription_status: " COMPLETED " })), false);
  });
});

describe("retry gate — states that must NOT be reprocessed", () => {
  it("a fully completed conversation is done", () => {
    assert.equal(leadConversationNeedsProcessing(snapshot()), false);
  });

  it("a completed transcription with an empty transcript is TERMINAL, not retried", () => {
    // The one classification that exists: no speech was detected, so re-running
    // transcription would produce the same empty result forever.
    assert.equal(leadConversationNeedsProcessing(snapshot({ transcript: "", synthesis_status: "pending" })), false);
    assert.equal(leadConversationNeedsProcessing(snapshot({ transcript: null, synthesis_status: "pending" })), false);
    assert.equal(leadConversationNeedsProcessing(snapshot({ transcript: "   ", synthesis_status: "pending" })), false);
  });

  it("the gate is idempotent — calling it twice gives the same answer", () => {
    const row = snapshot({ transcription_status: "failed" });
    assert.equal(leadConversationNeedsProcessing(row), leadConversationNeedsProcessing(row));
  });
});

// ── the classification gap ─────────────────────────────────────────────────────────

/**
 * The error categories §69 implies. Permanent failures must not be retried; transient
 * ones must. Today the gate cannot distinguish them because nothing records which is
 * which — the error is free text.
 */
const PERMANENT_FAILURES = [
  { label: "zero-byte recording", error: "Audio file is empty (0 bytes)." },
  { label: "corrupt container", error: "Could not decode audio container." },
  { label: "missing storage path", error: MISSING_STORAGE_TRANSCRIPTION_ERROR },
  { label: "empty transcript", error: EMPTY_TRANSCRIPT_SYNTHESIS_ERROR },
];

const TRANSIENT_FAILURES = [
  { label: "provider timeout", error: "Request to transcription provider timed out." },
  { label: "provider rate limit", error: "429 Too Many Requests" },
  { label: "provider 5xx", error: "503 Service Unavailable" },
];

describe("failure classification before retry (plan §69)", () => {
  // KNOWN-DEFECT: LR-PROD-012 — retry eligibility must derive from an error CATEGORY.
  // `lead_conversations` has `transcription_error` / `synthesis_error` as free text
  // (migrations 0013, 0090), no category column and no attempt counter, so the gate
  // cannot distinguish permanent from transient. Not fixed here: Brief §6.
  for (const { label, error } of PERMANENT_FAILURES) {
    it.skip(`KNOWN-DEFECT: LR-PROD-012 — a permanent failure (${label}) is not retried`, () => {
      const row = snapshot({ transcription_status: "failed", transcript: null });
      assert.equal(
        leadConversationNeedsProcessing({ ...row, transcription_error: error } as never),
        false,
        `"${error}" can never succeed on retry, so it must not stay eligible`
      );
    });
  }

  for (const { label } of TRANSIENT_FAILURES) {
    it(`a transient failure (${label}) is eligible for retry`, () => {
      // This half is correct today, and must stay correct after LR-PROD-012 is fixed.
      assert.equal(leadConversationNeedsProcessing(snapshot({ transcription_status: "failed" })), true);
    });
  }

  it("DOCUMENTED: every failure is retried regardless of cause (LR-PROD-012)", () => {
    for (const { error } of [...PERMANENT_FAILURES, ...TRANSIENT_FAILURES]) {
      const row = { ...snapshot({ transcription_status: "failed", transcript: null }), transcription_error: error };
      assert.equal(
        leadConversationNeedsProcessing(row as never),
        true,
        `"${error}" is currently eligible for retry — the gate never reads the error at all`
      );
    }
  });

  it("DOCUMENTED: the gate's input shape carries no error field to classify on (LR-PROD-012)", () => {
    // The snapshot type is the whole contract: four fields, none of them an error or a
    // category. Classification is not merely unimplemented — there is nowhere to put it.
    const keys = Object.keys(snapshot()).sort();
    assert.deepStrictEqual(keys, ["summary", "synthesis_status", "transcript", "transcription_status"]);
    assert.equal(keys.some((k) => /error|category|attempt|retry/.test(k)), false);
  });

  it("DOCUMENTED: a permanently-failed record is eligible forever, so bulk reprocess loops", () => {
    // Simulate ten reprocess passes over a record that can never succeed. Without an
    // attempt counter or a category, every pass re-queues it.
    const permanentlyBroken = snapshot({
      transcription_status: "failed",
      transcript: null,
      summary: null,
      synthesis_status: "failed",
    });
    const attempts = Array.from({ length: 10 }, () => leadConversationNeedsProcessing(permanentlyBroken));
    assert.deepStrictEqual(
      attempts,
      Array(10).fill(true),
      "ten passes, ten retries — nothing in the gate can ever terminate this"
    );
  });

  it("the no-speech terminal case shows classification IS achievable here", () => {
    // Contrast with the case above: this one terminates, because "completed with empty
    // transcript" is a recognised, classified outcome. Generalising that is the fix.
    const noSpeech = snapshot({ transcription_status: "completed", transcript: "", synthesis_status: "pending" });
    assert.equal(leadConversationNeedsProcessing(noSpeech), false);
  });
});

// ── canonical error strings ────────────────────────────────────────────────────────

describe("canonical error messages are stable", () => {
  it("the empty-transcript error explains the outcome rather than implying a fault", () => {
    assert.match(EMPTY_TRANSCRIPT_SYNTHESIS_ERROR, /no speech was detected/i);
  });

  it("the missing-storage error names the actual cause", () => {
    assert.match(MISSING_STORAGE_TRANSCRIPTION_ERROR, /storage path/i);
  });

  it("neither leaks a path, bucket, token or identifier", () => {
    // Plan §54: error strings reach logs and user-facing surfaces.
    for (const message of [EMPTY_TRANSCRIPT_SYNTHESIS_ERROR, MISSING_STORAGE_TRANSCRIPTION_ERROR]) {
      assert.doesNotMatch(message, /https?:\/\/|r2\.|s3\.|bearer|token|key=/i);
    }
  });
});
