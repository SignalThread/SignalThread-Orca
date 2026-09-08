// Run:
// node --experimental-strip-types scripts/signal-generation-preview-fixture.mjs

import {
  buildSignalPromptSections,
  composeDraftSections,
  hasPromptLeakage
} from "../lib/campaigns/signal-prompt-composer.ts";

const selectedSignals = [
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
    defaultPromptText: "At a {company_size} {industry} company, {title} teams prioritize scalable execution.",
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
];

const fixtures = [
  {
    leadName: "Ali Kamyab",
    firstName: "Ali",
    fullName: "Ali Kamyab",
    title: "VP Product and Sales Engineering",
    companyText: "CloudTech Solutions",
    companySize: "mid-market",
    industry: "SaaS",
    companyDomain: "cloudtech.io",
    eventName: "Tech Summit 2026"
  },
  {
    leadName: "Zach Gossin",
    firstName: "Zach",
    fullName: "Zach Gossin",
    title: "CTO",
    companyText: "DataFlow Systems",
    companySize: "enterprise",
    industry: "Data Infrastructure",
    companyDomain: "dataflow.com",
    eventName: "Tech Summit 2026"
  }
];

for (const fixture of fixtures) {
  const sections = buildSignalPromptSections({
    selectedSignals,
    recipientContext: {
      ...fixture,
      leadCount: 1,
      isMultiLeadDraft: false
    },
    templateName: "Lead Intel"
  });

  const body = composeDraftSections(sections).join("\n");
  console.log("========================================");
  console.log(`Lead: ${fixture.fullName}`);
  console.log(`Leakage detected: ${hasPromptLeakage(body) ? "YES" : "NO"}`);
  console.log(body);
}
