/**
 * DEV ONLY: Upsert a recognizable `lead_briefings` row so the exhibitor lead detail
 * "AI Brief" tab (`app/(app)/exhibitor/leads/[leadId]/page.tsx`) renders populated sections.
 *
 * Canonical datastore: table `lead_briefings` (columns: lead_id, company_id, content jsonb, approval_status).
 * Content shape: {@link BriefingStoredContent} in `lib/import-wizard/briefing-content-json.ts`.
 *
 * The page reads the same row the server component queries:
 *   .from("lead_briefings").select("id, content, approval_status, updated_at")
 *   .eq("lead_id", lead.id).eq("company_id", companyId)
 *
 * Lead id must match the URL segment `/exhibitor/leads/[leadId]` — pass `--lead-id` from the address bar,
 * or resolve via `--email` (and optional disambiguators).
 *
 * Run:
 *   ALLOW_DEV_LEAD_BRIEFING_SEED=1 npx tsx scripts/dev-seed-exhibitor-lead-ai-brief.ts --lead-id=<uuid>
 *
 * Or (example: LeadID teas / lead@test.com / SPS):
 *   ALLOW_DEV_LEAD_BRIEFING_SEED=1 npx tsx scripts/dev-seed-exhibitor-lead-ai-brief.ts --email=lead@test.com --company-text=SPS
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
 * (same contract as `lib/supabase/admin.ts` / createAdminClient).
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";
import type { BriefingStoredContent } from "@/lib/import-wizard/briefing-content-json";
import type { Database, Json } from "@/types/database";

type AdminClient = ReturnType<typeof createClient<Database>>;

function requireDevGate(): void {
  if (process.env.ALLOW_DEV_LEAD_BRIEFING_SEED !== "1") {
    throw new Error(
      "Refusing to run: set ALLOW_DEV_LEAD_BRIEFING_SEED=1 (dev-only guard; avoids accidental prod writes)."
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

/** Mirrors `createAdminClient()` env contract without importing `server-only`. */
function createServiceRoleClient(): AdminClient {
  const fileEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    fileEnv.NEXT_PUBLIC_SUPABASE_URL ??
    fileEnv.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (.env.local or env).");
  }
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

function devBriefingContent(leadId: string): BriefingStoredContent {
  return {
    linkage: { published_lead_id: leadId },
    companySnapshot: { name: "DEV TEST — SPS (company snapshot)" },
    whyHere: ["DEV TEST: This lead is evaluating SignalThread for event operations."],
    talkingPoints: [
      {
        title: "DEV TEST point 1",
        detail: "DEV TEST supporting copy for point 1 (title + detail required by lead detail page).",
      },
      {
        title: "DEV TEST point 2",
        detail: "DEV TEST supporting copy for point 2 (title + detail required by lead detail page).",
      },
    ],
    questionsToAsk: ["DEV TEST question 1"],
    competitorContext: "DEV TEST: Competitor context block for AI Brief tab.",
    signalsToWatch: ["DEV TEST signal 1"],
    gaps: [
      {
        gap: "DEV TEST unknown 1",
        whyItMatters: "DEV TEST why this gap matters for the rep.",
        probe: "DEV TEST probe question to close the gap.",
      },
    ],
  };
}

async function resolveLead(
  supabase: AdminClient,
  args: Record<string, string>
): Promise<{ id: string; company_id: string; full_name: string | null; email: string | null }> {
  const leadId = String(args["lead-id"] ?? "").trim();
  if (leadId) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, company_id, full_name, email")
      .eq("id", leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`No lead found for --lead-id=${leadId}`);
    return data;
  }

  const email = String(args.email ?? "").trim().toLowerCase();
  if (!email) {
    throw new Error("Provide --lead-id=<uuid> (from /exhibitor/leads/[leadId]) or --email=...");
  }

  let q = supabase.from("leads").select("id, company_id, full_name, email, company_text").ilike("email", email);

  const companyId = String(args["company-id"] ?? "").trim();
  if (companyId) {
    q = q.eq("company_id", companyId);
  }

  const companyText = String(args["company-text"] ?? "").trim();
  if (companyText) {
    q = q.ilike("company_text", `%${companyText}%`);
  }

  const { data: rows, error: rErr } = await q;
  if (rErr) throw new Error(rErr.message);
  const list = (rows ?? []) as Array<{
    id: string;
    company_id: string;
    full_name: string | null;
    email: string | null;
    company_text: string | null;
  }>;

  if (list.length === 0) {
    throw new Error(`No lead matched email=${email} (and filters). Try --lead-id from the URL.`);
  }
  if (list.length > 1) {
    throw new Error(
      `Multiple leads matched email=${email}. Pass --company-id=<uuid> or --company-text=... to disambiguate, or use --lead-id= from the URL.\n` +
        `Candidates: ${list.map((r) => `${r.id} company=${r.company_id} name=${r.full_name}`).join("; ")}`
    );
  }

  const row = list[0]!;
  return {
    id: row.id,
    company_id: row.company_id,
    full_name: row.full_name,
    email: row.email,
  };
}

async function main(): Promise<void> {
  requireDevGate();
  const args = parseArgs(process.argv.slice(2));
  const supabase = createServiceRoleClient();

  const lead = await resolveLead(supabase, args);
  const content = devBriefingContent(lead.id) as unknown as Json;

  const { data, error } = await supabase
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

  if (error) {
    console.error("[dev-seed-exhibitor-lead-ai-brief] upsert failed:", error.message);
    process.exit(1);
  }

  console.info("[dev-seed-exhibitor-lead-ai-brief] upsert ok");
  console.info("[dev-seed-exhibitor-lead-ai-brief] lead_briefings.id:", data?.id);
  console.info("[dev-seed-exhibitor-lead-ai-brief] lead_id (exact):", lead.id);
  console.info("[dev-seed-exhibitor-lead-ai-brief] company_id (exact):", lead.company_id);
  if (lead.full_name || lead.email) {
    console.info("[dev-seed-exhibitor-lead-ai-brief] lead:", {
      full_name: lead.full_name,
      email: lead.email,
    });
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
