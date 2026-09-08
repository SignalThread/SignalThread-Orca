import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignalPromptSections,
  composeDraftSections,
  findPromptLeakage,
  hasPromptLeakage,
  type SelectedSignalForGeneration
} from "../lib/campaigns/signal-prompt-composer";

function buildDraftForFixture(signals: SelectedSignalForGeneration[]) {
  const sections = buildSignalPromptSections({
    selectedSignals: signals,
    recipientContext: {
      firstName: "Jane",
      fullName: "Jane Rivera",
      leadName: "Jane Rivera",
      eventName: "Tech Summit 2026",
      companyText: "DataFlow",
      title: "CTO",
      companySize: "mid-market",
      industry: "fintech",
      companyDomain: "dataflow.com",
      leadCount: 1,
      isMultiLeadDraft: false
    },
    templateName: "Lead Intel"
  });

  return {
    sections,
    body: composeDraftSections(sections).join("\n")
  };
}

test("fixture: behavioral properties hold for AI/context/custom/cta mix", () => {
  const signals: SelectedSignalForGeneration[] = [
    {
      id: "1",
      name: "AI Summary",
      category: "AI-Powered",
      defaultPromptText: "Add Jane is being great to the email.",
      tone: ["Professional"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    },
    {
      id: "2",
      name: "Context",
      category: "Contextual",
      defaultPromptText: "Recipient is CTO focused on automation reliability.",
      tone: ["Professional"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    },
    {
      id: "3",
      name: "Custom proof",
      category: "Custom",
      defaultPromptText: "We recently helped a similar SaaS organization reduce manual effort by 40%.",
      tone: ["Consultative"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    },
    {
      id: "4",
      name: "CTA",
      category: "Call-to-Action",
      defaultPromptText: "Ask for a 20-minute walkthrough next week.",
      tone: ["Professional"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    }
  ];

  const { sections, body } = buildDraftForFixture(signals);

  assert.ok(!body.includes("Add Jane is being great to the email."));
  assert.ok(body.includes("reduce manual effort by 40%"));
  assert.ok(body.trim().endsWith("?"), "CTA should remain the final ask at the end");
  assert.ok(sections.contextualFacts.some((line) => /recipient|context|cto/i.test(line)));
  assert.equal(hasPromptLeakage(body), false);
  assert.deepEqual(
    findPromptLeakage(body, signals.filter((signal) => signal.category === "AI-Powered").map((signal) => signal.defaultPromptText)),
    []
  );
  assert.ok(!body.includes("Additionally,"));
  assert.ok(!body.includes("Also,"));
});

test("fixtures: Ali + Jane contextual placeholders resolve before model invocation", () => {
  const signals: SelectedSignalForGeneration[] = [
    {
      id: "ctx-1",
      name: "Company Context",
      category: "Contextual",
      defaultPromptText: "At a {company_size} {industry} company, {title} leaders value execution clarity.",
      tone: ["Consultative"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    },
    {
      id: "custom-1",
      name: "Proof",
      category: "Custom",
      defaultPromptText: "For {full_name} at {company}, this follow-up keeps things practical.",
      tone: ["Professional"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    }
  ];

  const aliSections = buildSignalPromptSections({
    selectedSignals: signals,
    recipientContext: {
      firstName: "Ali",
      fullName: "Ali Kamyab",
      leadName: "Ali Kamyab",
      eventName: "Demo Tech Expo",
      companyText: "CloudTech Solutions",
      title: "VP Product and Sales Engineering",
      companySize: "enterprise",
      industry: "software",
      companyDomain: "cloudtech.io",
      leadCount: 1,
      isMultiLeadDraft: false
    },
    templateName: "Lead Intel"
  });

  const janeSections = buildSignalPromptSections({
    selectedSignals: signals,
    recipientContext: {
      firstName: "Jane",
      fullName: "Jane Gossin",
      leadName: "Jane Gossin",
      eventName: "Demo Tech Expo",
      companyText: "DataFlow Inc",
      title: "Director of Operations",
      companySize: "mid-market",
      industry: "fintech",
      companyDomain: "dataflow.io",
      leadCount: 1,
      isMultiLeadDraft: false
    },
    templateName: "Lead Intel"
  });

  const aliText = [aliSections.contextualFacts.join(" "), aliSections.customBlocks.join(" ")].join(" ");
  const janeText = [janeSections.contextualFacts.join(" "), janeSections.customBlocks.join(" ")].join(" ");

  assert.equal(/\{[^{}]+\}|\{\{[^{}]+\}\}/.test(aliText), false);
  assert.equal(/\{[^{}]+\}|\{\{[^{}]+\}\}/.test(janeText), false);
  assert.ok(aliText.includes("enterprise software"));
  assert.ok(janeText.includes("mid-market fintech"));
});

test("group mode contextual and AI intent lines stay audience-level (no single lead names)", () => {
  const signals: SelectedSignalForGeneration[] = [
    {
      id: "ai-1",
      name: "Strategic Angle",
      category: "AI-Powered",
      defaultPromptText: "Add Ali is being great to the email.",
      tone: ["Professional"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    },
    {
      id: "ctx-1",
      name: "Company Context",
      category: "Contextual",
      defaultPromptText: "Recipient is VP Engineering focused on scalable execution.",
      tone: ["Consultative"],
      visibility: "global",
      roleScope: null,
      templateScope: null
    }
  ];

  const sections = buildSignalPromptSections({
    selectedSignals: signals,
    recipientContext: {
      firstName: "team",
      fullName: "team",
      leadName: "team",
      eventName: "Demo Tech Expo",
      companyText: "your organization",
      title: "leaders like you",
      companySize: "organizations",
      industry: "industry",
      companyDomain: "",
      leadCount: 2,
      isMultiLeadDraft: true
    },
    templateName: "Lead Intel"
  });

  const joined = `${sections.aiIntents.join(" ")} ${sections.contextualFacts.join(" ")}`.toLowerCase();
  assert.equal(joined.includes("ali"), false);
  assert.ok(joined.includes("selected audience"));
});
