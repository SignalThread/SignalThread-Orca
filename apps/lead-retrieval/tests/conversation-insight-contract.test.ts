import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConversationInsightPrompt,
  CONVERSATION_INSIGHT_JSON_SCHEMA,
  normalizeConversationInsightPayload,
  parseConversationInsightJson
} from "@/lib/conversations/conversation-insight-contract";

const alexMorganCalibrationTranscript = [
  "Alex Morgan, Director of Revenue Operations at Northstar Operations, said their event reps use multiple disconnected tools.",
  "By the time notes make it into the CRM, half the context is gone.",
  "They compared traditional lead retrieval tools to something from ten years ago.",
  "Reps do not want to spend thirty seconds typing after every booth conversation.",
  "They need AI to capture conversation context, intent, competitor mentions, and follow-up suggestions.",
  "Offline reliability matters because convention center internet is unreliable.",
  "Managers need visibility into which reps are having quality conversations and whether follow-up happens after the event.",
  "They are evaluating this quarter and budget is allocated, but adoption will fail if the workflow feels typing-heavy."
].join(" ");

test("conversation insight prompt is calibrated for operational sales intelligence", () => {
  const prompt = buildConversationInsightPrompt({
    transcriptTitle: "Transcript:",
    transcript: alexMorganCalibrationTranscript
  });

  assert.match(prompt, /enterprise sales intelligence/i);
  assert.match(prompt, /RevOps/i);
  assert.match(prompt, /operational pains/i);
  assert.match(prompt, /workflow_constraints/);
  assert.match(prompt, /technical_constraints/);
  assert.match(prompt, /management_visibility_needs/);
  assert.match(prompt, /problem_severity/);
  assert.match(prompt, /buying_intent/);
  assert.match(prompt, /priority_themes/);
  assert.match(prompt, /half the context is gone/);
  assert.match(prompt, /convention center internet is unreliable/);
  assert.match(prompt, /typing-heavy/);
  assert.match(prompt, /Avoid phrases such as "modern AI-driven platform"/);
});

test("conversation insight schema requires independent severity and intent dimensions", () => {
  assert.deepEqual(
    CONVERSATION_INSIGHT_JSON_SCHEMA.required.slice(0, 4),
    ["summary", "sentiment", "problem_severity", "buying_intent"]
  );
  assert.ok(CONVERSATION_INSIGHT_JSON_SCHEMA.required.includes("operational_pains"));
  assert.ok(CONVERSATION_INSIGHT_JSON_SCHEMA.required.includes("adoption_risks"));
  assert.ok(CONVERSATION_INSIGHT_JSON_SCHEMA.required.includes("management_visibility_needs"));
});

test("normalizer exposes process concerns and adoption risks through legacy objections", () => {
  const normalized = normalizeConversationInsightPayload({
    summary: "Alex described severe context loss before CRM entry.",
    sentiment: "engaged but operationally strained",
    problem_severity: "high",
    buying_intent: "active evaluation this quarter",
    objections: [],
    business_process_concerns: ["follow-up quality varies by rep"],
    adoption_risks: ["reps resist typing-heavy workflows"],
    technical_constraints: ["offline reliability matters at large venues"]
  });

  assert.deepEqual(normalized.objections, [
    "Business/process concern: follow-up quality varies by rep",
    "Adoption risk: reps resist typing-heavy workflows",
    "Technical/environmental constraint: offline reliability matters at large venues"
  ]);
  assert.ok(normalized.pain_points.includes("follow-up quality varies by rep"));
  assert.ok(normalized.pain_points.includes("offline reliability matters at large venues"));
});

test("parser keeps richer structured fields for cumulative insight JSON", () => {
  const parsed = parseConversationInsightJson(
    JSON.stringify({
      summary: "Alex described context loss, typing friction, offline risk, and weak manager visibility.",
      sentiment: "engaged and interested",
      problem_severity: "high operational pain",
      buying_intent: "active evaluation with budget allocated",
      objections: [],
      next_steps: ["Demonstrate offline reliability and mobile note capture speed."],
      competitors_mentioned: [],
      pain_points: [],
      feature_requests: ["AI-generated conversation summaries"],
      buying_signals: ["evaluating this quarter", "budget allocated"],
      operational_pains: ["half the context is gone before CRM entry"],
      workflow_constraints: ["reps do not want to spend thirty seconds typing"],
      technical_constraints: ["convention center internet is unreliable"],
      desired_outcomes: ["capture conversation context and competitor mentions"],
      adoption_risks: ["typing-heavy workflows will not be adopted"],
      management_visibility_needs: ["see which reps are having quality conversations"],
      business_process_concerns: ["follow-up quality varies by rep"],
      product_objections: [],
      rep_behavior_patterns: ["rep follow-up quality varies"],
      priority_themes: [
        "conversational context loss",
        "lightweight rep workflow",
        "offline reliability"
      ]
    })
  );

  assert.equal(parsed.problem_severity, "high operational pain");
  assert.equal(parsed.buying_intent, "active evaluation with budget allocated");
  assert.ok(parsed.operational_pains.includes("half the context is gone before CRM entry"));
  assert.ok(parsed.objections.some((item) => item.includes("typing-heavy workflows")));
  assert.deepEqual(parsed.priority_themes.slice(0, 2), [
    "conversational context loss",
    "lightweight rep workflow"
  ]);
});
