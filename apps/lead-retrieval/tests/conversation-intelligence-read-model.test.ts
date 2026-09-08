import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCanonicalConversationIntelligence,
  isNoSpeechConversation,
  selectCanonicalConversationIntelligence,
  type ConversationIntelligenceRecord
} from "@/lib/conversations/conversation-intelligence-read-model";

function conversation(
  partial: Partial<ConversationIntelligenceRecord> = {}
): ConversationIntelligenceRecord {
  return {
    id: "conversation-1",
    created_at: "2026-06-29T16:48:12Z",
    summary: "The lead needs a more reliable onsite capture workflow.",
    transcript: "We need the scanner to work offline.",
    sentiment: "positive",
    objections: [],
    next_steps: [],
    transcription_status: "completed",
    synthesis_status: "completed",
    ...partial
  };
}

describe("canonical conversation intelligence read model", () => {
  it("keeps the full structured conversation contract instead of reducing it to the legacy summary", () => {
    const view = buildCanonicalConversationIntelligence(
      conversation({
        priority_themes: ["Offline capture reliability"],
        pain_points: ["Venue connectivity"],
        buying_signals: ["Asked for an implementation plan"],
        competitors_mentioned: ["Cvent"]
      }),
      null
    );

    assert.equal(view?.schema, "structured");
    assert.deepEqual(view?.priority_themes, ["Offline capture reliability"]);
    assert.deepEqual(view?.pain_points, ["Venue connectivity"]);
    assert.deepEqual(view?.buying_signals, ["Asked for an implementation plan"]);
    assert.deepEqual(view?.competitors_mentioned, ["Cvent"]);
  });

  it("uses completed cumulative intelligence field-by-field and preserves conversation fallbacks", () => {
    const view = buildCanonicalConversationIntelligence(
      conversation({
        summary: "Persisted conversation summary.",
        objections: ["Security review required"],
        pain_points: ["Manual badge reconciliation"]
      }),
      {
        status: "completed",
        insights_json: {
          summary: "Cumulative summary.",
          priority_themes: ["Onsite operations"],
          objections: []
        }
      }
    );

    assert.equal(view?.source, "cumulative");
    assert.equal(view?.summary, "Cumulative summary.");
    assert.deepEqual(view?.priority_themes, ["Onsite operations"]);
    assert.deepEqual(view?.objections, ["Security review required"]);
    assert.deepEqual(view?.pain_points, ["Manual badge reconciliation"]);
  });

  it("prefers a prior completed synthesis over a newer failed or empty attempt", () => {
    const usable = conversation({ id: "usable", created_at: "2026-06-01T12:00:00Z" });
    const failed = conversation({
      id: "failed",
      created_at: "2026-07-01T12:00:00Z",
      summary: null,
      transcript: null,
      synthesis_status: "failed",
      synthesis_error: "Transcript is empty; no speech was detected."
    });

    assert.equal(selectCanonicalConversationIntelligence([failed, usable])?.id, "usable");
  });

  it("recognizes completed empty audio as no-speech rather than a provider-processing failure", () => {
    assert.equal(
      isNoSpeechConversation({
        transcription_status: "completed",
        synthesis_status: "failed",
        transcript: null,
        synthesis_error: "Transcript is empty; no speech was detected."
      }),
      true
    );
  });

  it("keeps legacy summaries and objections without fabricating structured fields", () => {
    const view = buildCanonicalConversationIntelligence(
      conversation({ objections: ["Budget timing"], next_steps: ["Schedule a review"] }),
      null
    );

    assert.equal(view?.schema, "legacy");
    assert.equal(view?.summary, "The lead needs a more reliable onsite capture workflow.");
    assert.deepEqual(view?.objections, ["Budget timing"]);
    assert.deepEqual(view?.next_steps, ["Schedule a review"]);
    assert.deepEqual(view?.priority_themes, []);
  });
});
