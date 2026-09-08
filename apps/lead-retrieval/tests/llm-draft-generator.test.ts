import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLlmDraftPrompts,
  generateLeadDraftWithLLM,
  type DraftGenerationInput
} from "../lib/campaigns/llm-draft-generator";

const BASE_INPUT: DraftGenerationInput = {
  subjectTemplate: "Following up from {{event}} - {{first_name}}",
  templateName: "Lead Intel",
  recipientContext: {
    firstName: "Ali",
    fullName: "Ali Kamyab",
    leadName: "Ali Kamyab",
    eventName: "Tech Summit 2026",
    companyText: "CloudTech Solutions",
    title: "VP Product and Sales Engineering",
    companySize: "enterprise",
    industry: "software",
    companyDomain: "cloudtech.io",
    leadCount: 1,
    isMultiLeadDraft: false
  },
  selectedSignals: [
    {
      id: "sig-ai",
      name: "AI Summary",
      category: "AI-Powered",
      defaultPromptText: "Add Ali is being great to the email.",
      tone: ["Professional"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    },
    {
      id: "sig-context",
      name: "Company Context",
      category: "Contextual",
      defaultPromptText: "At a {company_size} {industry} company, {title} leaders prioritize scalable execution.",
      tone: ["Consultative"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    },
    {
      id: "sig-custom",
      name: "Custom Insight Block",
      category: "Custom",
      defaultPromptText: "We recently helped a similar SaaS organization reduce manual effort by 40%.",
      tone: ["Consultative"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    },
    {
      id: "sig-cta",
      name: "Suggested Next Step",
      category: "Call-to-Action",
      defaultPromptText: "Would you be open to a 20-minute walkthrough next week?",
      tone: ["Professional"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    }
  ]
};

test("buildLlmDraftPrompts groups signal categories into structured model payload", () => {
  const { systemPrompt, userPrompt, sections } = buildLlmDraftPrompts(BASE_INPUT);

  assert.ok(systemPrompt.includes("Return strict JSON only"));
  assert.ok(systemPrompt.includes("paragraph breaks"));
  assert.ok(systemPrompt.includes("AI intent items are guidance only"));
  assert.ok(userPrompt.includes("\"contextual_facts\""));
  assert.ok(userPrompt.includes("\"custom_blocks\""));
  assert.ok(userPrompt.includes("\"ai_powered_intents\""));
  assert.ok(userPrompt.includes("\"call_to_action\""));
  assert.ok(userPrompt.includes("\"body_structure\""));
  assert.ok(userPrompt.includes("\"subject_template\": \"Following up from Tech Summit 2026 - Ali\""));
  assert.equal(sections.callToAction?.endsWith("?"), true);
});

test("uses the server-provided sender identity and replaces a model's stale signature", async () => {
  const result = await generateLeadDraftWithLLM(
    { ...BASE_INPUT, senderName: "Sarah Meister" },
    {
      model: "mock-model",
      invokeModel: async () =>
        JSON.stringify({
          subject: "Following up from Tech Summit 2026 - Ali",
          body: "Hi Ali,\n\nThanks again for connecting.\n\nBest,\nAli"
        })
    }
  );

  assert.ok(result.body.endsWith("Best,\nSarah Meister"));
  assert.equal(result.body.includes("Best,\nAli"), false);
  const { userPrompt } = buildLlmDraftPrompts({ ...BASE_INPUT, senderName: "Sarah Meister" });
  assert.ok(userPrompt.includes('"display_name": "Sarah Meister"'));
});

test("uses the neutral sender fallback rather than a seeded person name", async () => {
  const result = await generateLeadDraftWithLLM(BASE_INPUT, {
    model: "mock-model",
    invokeModel: async () => JSON.stringify({ subject: "Follow-up", body: "Hi Ali,\n\nThank you." })
  });
  assert.ok(result.body.endsWith("Best,\nThe team"));
  assert.equal(result.body.includes("Best,\nAli"), false);
});

test("generateLeadDraftWithLLM parses model JSON and returns clean output", async () => {
  const result = await generateLeadDraftWithLLM(BASE_INPUT, {
    model: "mock-model",
    invokeModel: async () =>
      JSON.stringify({
        subject: "Following up from Tech Summit 2026 - Ali",
        body: "Hi Ali,\n\nIt was great meeting you at Tech Summit 2026. We recently helped a similar SaaS organization reduce manual effort by 40%.\n\nWould you be open to a 20-minute walkthrough next week?"
      })
  });

  assert.equal(result.subject, "Following up from Tech Summit 2026 - Ali");
  assert.ok(result.body.includes("reduce manual effort by 40%"));
  assert.ok(result.body.includes("\n\n"), "body must preserve paragraph breaks for preview");
  assert.ok(result.body.includes("Would you be open to a 20-minute walkthrough next week?"));
  assert.ok(result.body.endsWith("Best,\nThe team"));
  assert.ok(!result.body.includes("{company_size}"));
  assert.ok(!result.body.includes("{industry}"));
});

test("generateLeadDraftWithLLM enforces per-lead greeting for personalized drafts", async () => {
  const result = await generateLeadDraftWithLLM(BASE_INPUT, {
    model: "mock-model",
    invokeModel: async () =>
      JSON.stringify({
        subject: "Following up from Tech Summit 2026",
        body: "Thanks again for the chat at Tech Summit 2026. We can share concrete next steps."
      })
  });

  assert.ok(result.body.startsWith("Hi Ali,"), "Body must start with lead-specific greeting");
});

test("generateLeadDraftWithLLM rewrites wrong greeting to active lead first name", async () => {
  const result = await generateLeadDraftWithLLM(BASE_INPUT, {
    model: "mock-model",
    invokeModel: async () =>
      JSON.stringify({
        subject: "Following up from Tech Summit 2026",
        body: "Hi Zach,\n\nThanks again for connecting."
      })
  });

  assert.ok(result.body.startsWith("Hi Ali,"), "Greeting name should match recipient context");
});

test("generateLeadDraftWithLLM restores lead-specific subject when model drops first name", async () => {
  const result = await generateLeadDraftWithLLM(BASE_INPUT, {
    model: "mock-model",
    invokeModel: async () =>
      JSON.stringify({
        subject: "Following up from Tech Summit 2026",
        body: "Hi Ali,\n\nThanks again for connecting."
      })
  });

  assert.equal(result.subject, "Following up from Tech Summit 2026 - Ali");
});

test("generateLeadDraftWithLLM enforces group-safe greeting in broadcast mode", async () => {
  const groupInput: DraftGenerationInput = {
    ...BASE_INPUT,
    subjectTemplate: "Following up from {{event}}",
    recipientContext: {
      ...BASE_INPUT.recipientContext,
      firstName: "team",
      fullName: "team",
      leadName: "team",
      leadCount: 3,
      isMultiLeadDraft: true
    }
  };

  const result = await generateLeadDraftWithLLM(groupInput, {
    model: "mock-model",
    invokeModel: async () =>
      JSON.stringify({
        subject: "Following up from Tech Summit 2026",
        body: "Hi Ali,\n\nThanks again for connecting."
      })
  });

  assert.ok(result.body.startsWith("Hi team,"), "Group mode must not keep single-lead greeting");
  assert.equal(result.body.includes("Hi Ali"), false);
});

test("generateLeadDraftWithLLM rejects leaked AI-powered prompt text", async () => {
  await assert.rejects(
    () =>
      generateLeadDraftWithLLM(BASE_INPUT, {
        model: "mock-model",
        invokeModel: async () =>
          JSON.stringify({
            subject: "Following up from Tech Summit 2026 - Ali",
            body: "Add Ali is being great to the email."
          })
      }),
    /Prompt leakage detected/
  );
});

test("generateLeadDraftWithLLM rejects unresolved placeholders", async () => {
  await assert.rejects(
    () =>
      generateLeadDraftWithLLM(BASE_INPUT, {
        model: "mock-model",
        invokeModel: async () =>
          JSON.stringify({
            subject: "Following up from {event}",
            body: "At a {company_size} {industry} company..."
          })
      }),
    /unresolved placeholders/
  );
});
