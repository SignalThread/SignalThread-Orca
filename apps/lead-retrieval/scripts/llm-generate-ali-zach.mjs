// Run:
// set -a; source .env.local; set +a; node --experimental-strip-types scripts/llm-generate-ali-zach.mjs

import { createClient } from "@supabase/supabase-js";
import { generateLeadDraftWithLLM } from "../lib/campaigns/llm-draft-generator.ts";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const targets = ["Ali Kamyab", "Zach Gossin"];
const { data: leads, error: leadsError } = await supabase
  .from("leads")
  .select(
    "id, full_name, company_id, event_id, job_title, enriched_job_title, enriched_company_size, enriched_industry, enriched_company_domain"
  )
  .in("full_name", targets);

if (leadsError) {
  console.error("Failed to load leads", leadsError);
  process.exit(1);
}

if (!leads || leads.length === 0) {
  console.error("No matching leads found");
  process.exit(1);
}

const companyIds = [...new Set(leads.map((lead) => lead.company_id).filter(Boolean))];
const eventIds = [...new Set(leads.map((lead) => lead.event_id).filter(Boolean))];

const { data: companies } = await supabase.from("companies").select("id, name").in("id", companyIds);
const { data: events } = await supabase.from("events").select("id, name").in("id", eventIds);
const companyById = new Map((companies ?? []).map((row) => [row.id, row.name]));
const eventById = new Map((events ?? []).map((row) => [row.id, row.name]));

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
    defaultPromptText: "We recently helped similar teams reduce manual effort by 40%.",
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
  const firstName = (lead.full_name || "").trim().split(/\s+/)[0] || "there";
  const fullName = lead.full_name || firstName;
  const companyText = companyById.get(lead.company_id) || lead.enriched_company_domain || "your company";
  const title = lead.enriched_job_title || lead.job_title || "your role";
  const companySize = lead.enriched_company_size || "company";
  const industry = lead.enriched_industry || "industry";
  const companyDomain = lead.enriched_company_domain || "";
  const eventName = lead.event_id ? eventById.get(lead.event_id) || "our event" : "our event";

  const generated = await generateLeadDraftWithLLM({
    subjectTemplate: "Following up from {{event}} - {{first_name}}",
    templateName: "Lead Intel",
    selectedSignals,
    recipientContext: {
      firstName,
      fullName,
      leadName: fullName,
      eventName,
      companyText,
      title,
      companySize,
      industry,
      companyDomain,
      leadCount: 1,
      isMultiLeadDraft: false
    }
  });

  console.log(
    JSON.stringify(
      {
        lead: fullName,
        subject: generated.subject,
        final_email_body: generated.body
      },
      null,
      2
    )
  );
}
