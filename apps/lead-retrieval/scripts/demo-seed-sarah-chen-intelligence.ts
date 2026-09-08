/**
 * Demo seed: populate lead_briefings + latest lead_conversations row for Sarah Chen so
 * exhibitor lead detail "AI Conversation Insights" + "Pre-Show Brief" render fully.
 *
 * Does NOT change schema or UI. Uses existing JSON shapes from briefing-content-json + page parsers.
 *
 * Run:
 *   ALLOW_DEMO_LEAD_INTELLIGENCE_SEED=1 npx tsx scripts/demo-seed-sarah-chen-intelligence.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (or .env.local).
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BriefingStoredContent } from "@/lib/import-wizard/briefing-content-json";
import type { Database, Json } from "@/types/database";

type AdminClient = ReturnType<typeof createClient<Database>>;

function requireGate(): void {
  if (process.env.ALLOW_DEMO_LEAD_INTELLIGENCE_SEED !== "1") {
    throw new Error(
      "Set ALLOW_DEMO_LEAD_INTELLIGENCE_SEED=1 to run this demo DB writer."
    );
  }
}

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => {
        const [key, ...rest] = l.split("=");
        let val = rest.join("=").trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        return [key.trim(), val];
      })
  );
}

function createServiceRoleClient(): AdminClient {
  const fileEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    fileEnv.NEXT_PUBLIC_SUPABASE_URL ??
    fileEnv.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Matches UI sections from buildPreShowBriefSections + exhibitorLeadBriefStoredContentHasRenderableAiBriefSections. */
function sarahChenBriefingContent(leadId: string): BriefingStoredContent {
  return {
    linkage: { published_lead_id: leadId },
    headline:
      "Sarah Chen steers event operations for GlobalTech Events’ flagship portfolio—registration integrity, exhibitor ROI reporting, and same-day lead velocity are board-visible metrics this quarter. She’s benchmarking SignalThread against stitched Zapier + Salesforce workflows and wants proof of CRM fidelity and booth-team adoption before fiscal commitments.",
    whyHere: [
      "VP Operations title with budget influence across registration tech, onsite logistics analytics, and post-show revenue attribution—she signs off on workflow tooling that touches Salesforce Opportunity stages.",
      "Pain surfaced on last week’s discovery call: ~23% of badge scans still lack buyer-grade emails by T+24h; RevOps is manually reconciling CSV exports while AE quota coverage slips in week-one follow-up.",
      "Highly quantitative communicator—responds to pipeline math, SLA-backed guarantees, and named references from hybrid SaaS + association verticals rather than generic ‘AI’ positioning.",
      "Buying context: FY26 renewal cycle for their legacy badge vendor overlaps with GlobalTech’s internal initiative to standardize one ‘golden thread’ from scan → enriched profile → CRM task owner.",
      "Stakeholder lens: champions booth teams’ ease-of-use; skeptical of tools that add cognitive load on noisy show floors or require overnight IT firewall carve-outs.",
      "Momentum: asked for a workflow sandbox tied to a sandbox Salesforce org and requested Security / SOC2 one-pager unprompted—signals serious evaluation lane vs casual vendor tourism.",
    ],
    questionsToAsk: [
      "Walk me through your current scan-to-CRM journey at hour +4 and hour +24—where do records stall or bounce back from validation rules?",
      "How do you score ‘lead quality’ today between badge provider feeds, enrichment vendors, and AE feedback loops?",
      "Which Salesforce objects must receive exhibitor interactions—Lead only, Contact + Opportunity, or custom Campaign Members—and who owns those mappings?",
      "What executive KPI are you defending on follow-up speed this quarter (median hours, % touched in 24h, pipeline influenced)?",
      "Where did your last pilot fail—change management, data hygiene, or integration depth—and what exit criteria would make SignalThread ‘safe to scale’?",
      "How do you segment exhibitors who should see automated drafts vs those requiring manual gatekeeping under brand/compliance policies?",
    ],
    talkingPoints: [
      {
        title: "Prove CRM fidelity without Salesforce rework",
        detail:
          "SignalThread writes enriched leads through governed mappings—duplicate rules and validation fire exactly as if RevOps keyed them—reducing the RevOps pushback Sarah cited when prior pilots created shadow spreadsheets.",
      },
      {
        title: "Operations SLA: scan → enriched → routed owner",
        detail:
          "Position deterministic enrichment + workflow orchestration so booth scans arrive as prioritized tasks with context Sarah’s teams already rated (intent tier, session footprint, competitive displacement hints)—no orphaned CSVs.",
      },
      {
        title: "ROI narrative tied to pipeline hygiene",
        detail:
          "Translate badge volumes into recovered AE capacity hours and uplift in % leads touched <24h—mirror language from GlobalTech’s investor deck on operational leverage.",
      },
      {
        title: "Change management for floor teams",
        detail:
          "Emphasize tablet-first UX, offline resilience, and coaching mode so Sarah can deputize booth captains without IT tickets—direct answer to her stakeholder-lens concern.",
      },
      {
        title: "Enterprise guardrails",
        detail:
          "Human review gates before outbound touches, audit trails per workflow run, and tenant-scoped separation align with her Security packet request—pair with SOC2 summary she asked for.",
      },
    ],
    signalsToWatch: [
      "Asks about webhook retries + dead-letter handling",
      "References ‘golden thread’ KPI twice",
      "Name-drops Salesforce Architect or MuleSoft alongside SignalThread",
      "Tests edge cases: duplicate scans, badge swaps, VIP list overrides",
      "Positive tone when discussing booth captain empowerment",
      "Hesitation when topics drift to mass outbound automation",
      "Brings RevOps counterpart into next meeting without prompting",
      "Requests CSV export parity for contingency reporting",
    ],
    competitorContext:
      "Sarah mentioned EvalWorks (pseudo-anonymized in transcript) still wins floor simplicity but lacks native Salesforce workflow branching; Zapier glue creates brittle OAuth tokens across GlobalTech’s EU + US instances. Position SignalThread as fewer moving parts with deeper exhibitor-native semantics—not another generic integration hub.",
    gaps: [
      {
        gap: "Exact Salesforce edition & API throttle posture",
        whyItMatters:
          "Bulk API limits and Shield encryption settings change integration design; misunderstanding here tanks POC timelines.",
        probe:
          "Can your Salesforce team confirm whether Person Accounts are enabled and whether API-intensive enrichment bursts land in a dedicated integration user?",
      },
      {
        gap: "GlobalTech’s enrichment vendor-of-record",
        whyItMatters:
          "Duplicate enrichment passes inflate costs and confuse attribution—SignalThread needs to snap to their approved data supplier contracts.",
        probe:
          "Which ZoomInfo or Cognism contract tier is approved today, and can SignalThread consume existing enrichment tokens vs provisioning parallel usage?",
      },
      {
        gap: "Event taxonomy across subsidiaries",
        whyItMatters:
          "Multi-brand exhibitors require Campaign hierarchies; workflows must tag scans by subsidiary without manual tagging at booth.",
        probe:
          "How are subsidiary-specific Campaign IDs represented on badges or registration payloads today?",
      },
      {
        gap: "Compliance stance on AI-generated outreach",
        whyItMatters:
          "Sarah paused when drafts were mentioned—legal may require manual approval workflows per region.",
        probe:
          "Which regions require legal-approved messaging templates before any AI-assisted outreach leaves GlobalTech systems?",
      },
    ],
  };
}

const DEMO_TRANSCRIPT = `
Rep: Sarah, thanks for walking us through the booth throughput metrics—what's waking you up at night between sessions?

Sarah Chen: Honestly it's the delta between scans and sales-ready records. We're capturing north of 18k badge touches across our flagship shows, but Salesforce still shows thousands sitting in limbo after day two. RevOps is duct-taping CSVs because enrichment fires inconsistently and validation rules bounce rows.

Rep: Where does it hurt most—speed or data fidelity?

Sarah Chen: Both. My AE leaders swear lead quality dropped once we parallelized two badge vendors. I need one orchestrated path: scan, enrich, route to owner with context that maps to our Opportunity stages—not another toolkit my ops analysts babysit.

Rep: How are you measuring ROI for exhibitors today?

Sarah Chen: We publish post-show dashboards—median follow-up hours, meetings booked, influenced pipeline—but CFO peers challenge us on attribution integrity. If SignalThread can tighten CRM fidelity and shorten first-touch SLA without spamming attendees, that's strategic.

Rep: What does success look like in Q3?

Sarah Chen: Pilot at Technology Expo North—95% of enriched leads land correctly under our Campaign hierarchy, no manual CSV interventions, and booth captains adopt without training overhead. Security paperwork must clear before we expand EU shows.

Rep: Any competitive angles you're weighing?

Sarah Chen: EvalWorks is painless on the floor but integration depth stalls when we want branching workflows per subsidiary. Zapier stacks jitter when OAuth tokens expire regionally. I want fewer brittle hops—not buzzwords.

Rep: Fair—we'll map Salesforce mappings with RevOps and keep drafts gated for legal review.

Sarah Chen: Perfect. Send the SOC2 summary and sandbox playbook—I’ll loop our Salesforce architect early next week.
`.trim();

async function main(): Promise<void> {
  requireGate();
  const supabase = createServiceRoleClient() as unknown as AdminClient;

  const email = "sarah.chen@globalevents.com".toLowerCase();
  const { data: rows, error: qErr } = await supabase
    .from("leads")
    .select("id, company_id, full_name, email, company_text")
    .ilike("email", email)
    .ilike("company_text", "%GlobalTech%");

  if (qErr) throw new Error(qErr.message);
  const list = (rows ?? []) as Array<{
    id: string;
    company_id: string;
    full_name: string | null;
    email: string | null;
    company_text: string | null;
  }>;

  const narrow = list.filter(
    (r) =>
      String(r.full_name ?? "")
        .toLowerCase()
        .includes("sarah") && String(r.full_name ?? "").toLowerCase().includes("chen")
  );

  const candidates = narrow.length > 0 ? narrow : list;
  if (candidates.length === 0) {
    throw new Error(`No lead found for ${email} + company GlobalTech. Rows scanned: ${list.length}`);
  }
  if (candidates.length > 1) {
    console.warn(
      "Multiple candidates; using first:",
      candidates.map((c) => `${c.id} ${c.full_name} ${c.company_text}`)
    );
  }

  const lead = candidates[0]!;
  console.info("[demo-seed] lead:", {
    id: lead.id,
    company_id: lead.company_id,
    full_name: lead.full_name,
    email: lead.email,
    company_text: lead.company_text,
  });

  const content = sarahChenBriefingContent(lead.id) as unknown as Json;

  const { data: briefRow, error: briefErr } = await supabase
    .from("lead_briefings")
    .upsert(
      {
        lead_id: lead.id,
        company_id: lead.company_id,
        content,
        approval_status: "approved",
      },
      { onConflict: "lead_id" }
    )
    .select("id")
    .single();

  if (briefErr) throw new Error(`lead_briefings upsert: ${briefErr.message}`);
  console.info("[demo-seed] lead_briefings.id:", briefRow?.id);

  const convPatch = {
    transcript: DEMO_TRANSCRIPT,
    transcription_status: "completed",
    transcription_error: null,
    transcribed_at: new Date().toISOString(),
    summary:
      "Sarah Chen articulated acute operational pain around scan-to-CRM latency at GlobalTech Events—duplicate badge vendors and brittle Zapier paths leave thousands of touches unreconciled while RevOps resorts to CSV patches. She framed success as Salesforce-faithful records, subsidiary-aware Campaign hierarchies, and booth-simple UX, with Security/SOC2 clearance as a gate for EU expansion. Tone stayed constructive and specifics-heavy; she volunteered next steps (sandbox + Salesforce architect) signaling qualified evaluation momentum.",
    sentiment: "Positive — pragmatic buyer focused on operational rigor",
    objections: [
      "Worried parallel badge vendors corrupted lead quality and overwhelmed validation rules.",
      "Skeptical of AI-heavy outbound—needs human/legal gates before messaging scales.",
      "Past pilots failed when integrations looked good in demos but broke under bulk API + regional OAuth realities.",
      "Pressure from CFO peers on attribution integrity—won’t greenlight unless CRM fidelity is provable in dashboards.",
    ],
    next_steps: [
      "Provision sandbox Salesforce org mapping pack covering Campaign hierarchy + subsidiary IDs within 5 business days.",
      "Deliver SOC2 summary plus data-flow diagram Sarah requested before EU subsidiary workflows.",
      "Coordinate joint session with GlobalTech Salesforce architect and RevOps to validate API user strategy.",
      "Publish pilot scorecard template tying median hours-to-first-touch and % leads Salesforce-clean at T+24h.",
      "Share anonymized hybrid-event reference story emphasizing CRM fidelity—not generic AI claims.",
    ],
    synthesis_status: "completed",
    synthesized_at: new Date().toISOString(),
    synthesis_error: null,
  };

  // Table may be absent from generated Database types; service client still supports it at runtime.
  const sb = supabase as unknown as {
    from: (t: string) => ReturnType<AdminClient["from"]>;
  };

  const { data: existingConv, error: selErr } = await sb
    .from("lead_conversations")
    .select("id")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) throw new Error(`lead_conversations select: ${selErr.message}`);

  if (existingConv?.id) {
    const { error: upErr } = await sb.from("lead_conversations").update(convPatch).eq("id", existingConv.id);
    if (upErr) throw new Error(`lead_conversations update: ${upErr.message}`);
    console.info("[demo-seed] updated lead_conversations:", existingConv.id);
  } else {
    const { data: ins, error: insErr } = await sb
      .from("lead_conversations")
      .insert({
        lead_id: lead.id,
        storage_path: `conversations/${lead.id}/demo-intelligence-seed.placeholder`,
        content_type: "text/demo",
        created_at: new Date().toISOString(),
        ...convPatch,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(`lead_conversations insert: ${insErr.message}`);
    console.info("[demo-seed] inserted lead_conversations:", ins?.id);
  }

  console.info("[demo-seed] done — open /exhibitor/leads/" + lead.id);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
