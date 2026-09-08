// Run:
// set -a; source .env.local; set +a; node --experimental-strip-types scripts/signal-generation-db-preview.mjs

import { createClient } from "@supabase/supabase-js";
import {
  buildSignalPromptSections,
  composeDraftSections,
  findPromptLeakage
} from "../lib/campaigns/signal-prompt-composer.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const targetNames = ["Ali Kamyab", "Zach Gossin"];

const { data: leads, error } = await supabase
  .from("leads")
  .select(
    "id, full_name, job_title, enriched_job_title, enriched_company_size, enriched_industry, enriched_company_domain, company_id, event_id"
  )
  .in("full_name", targetNames);

if (error) {
  console.error("Failed to load leads", error);
  process.exit(1);
}

if (!leads || leads.length === 0) {
  console.error("No matching leads found for Ali Kamyab / Zach Gossin");
  process.exit(1);
}

const companyIds = [...new Set(leads.map((lead) => lead.company_id).filter(Boolean))];
const eventIds = [...new Set(leads.map((lead) => lead.event_id).filter(Boolean))];

const { data: companies } = await supabase.from("companies").select("id, name").in("id", companyIds);
const { data: events } = await supabase.from("events").select("id, name").in("id", eventIds);

const companyNameById = new Map((companies ?? []).map((company) => [company.id, company.name]));
const eventNameById = new Map((events ?? []).map((event) => [event.id, event.name]));

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

for (const lead of leads) {
  const firstName = lead.full_name?.trim().split(/\s+/)[0] || "there";
  const context = {
    firstName,
    fullName: lead.full_name || firstName,
    leadName: lead.full_name || firstName,
    eventName: lead.event_id ? (eventNameById.get(lead.event_id) ?? "our event") : "our event",
    companyText: companyNameById.get(lead.company_id) || lead.enriched_company_domain || "your company",
    title: lead.enriched_job_title || lead.job_title || "your role",
    companySize: lead.enriched_company_size || "company",
    industry: lead.enriched_industry || "industry",
    companyDomain: lead.enriched_company_domain || "",
    leadCount: 1,
    isMultiLeadDraft: false
  };

  const sections = buildSignalPromptSections({
    selectedSignals,
    recipientContext: context,
    templateName: "Lead Intel"
  });
  const body = composeDraftSections(sections).join("\n");
  const leakMatches = findPromptLeakage(
    body,
    selectedSignals.filter((signal) => signal.category === "AI-Powered").map((signal) => signal.defaultPromptText)
  );

  console.log("========================================");
  console.log(`Lead: ${context.fullName}`);
  console.log(`Leak matches: ${leakMatches.length > 0 ? leakMatches.join(", ") : "none"}`);
  console.log(body);
}
