import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignalPromptSections,
  composeDraftSections,
  findPromptLeakage,
  hasPromptLeakage
} from "../signal-prompt-composer";
import type { SelectedSignalForGeneration } from "../signal-prompt-composer";

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
