/**
 * Dev/test helper — seed a single workflow template that fires `enrich_lead` on lead capture.
 *
 *   npm exec tsx scripts/dev-seed-workflow-enrich-template.ts -- --companyId=<uuid> [--enable]
 *
 * Defaults:
 *   - `is_enabled = false` (capture path will not fire it). Pass `--enable` to enable.
 *   - `scope = 'any'`, `event_id = null` (matches all containers including null-container leads).
 *
 * Idempotent on a stable (company_id, name) pair: re-running updates `is_enabled` only
 * and leaves the existing template + step intact.
 *
 * NEVER call this in production. The script will refuse to run in production-flagged
 * environments unless `ALLOW_PROD_WORKFLOW_SEED=true` is set.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { ENRICH_LEAD_STEP_TYPE } from "@/lib/workflows/step-handlers/enrich-lead";

type CliArgs = {
  companyId: string;
  enable: boolean;
  name: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { name: "Dev: Enrich on capture" };
  for (const raw of argv.slice(2)) {
    const [key, value] = raw.startsWith("--") ? raw.slice(2).split("=") : [raw, ""];
    if (key === "companyId") args.companyId = String(value ?? "").trim();
    else if (key === "name") args.name = String(value ?? "").trim() || args.name;
    else if (key === "enable") args.enable = true;
  }
  if (!args.companyId) {
    throw new Error("Usage: dev-seed-workflow-enrich-template --companyId=<uuid> [--enable] [--name=...]");
  }
  return { companyId: args.companyId, enable: Boolean(args.enable), name: String(args.name) };
}

async function main() {
  const env = String(process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (env === "production" && String(process.env.ALLOW_PROD_WORKFLOW_SEED ?? "").trim().toLowerCase() !== "true") {
    throw new Error("Refusing to run dev seed in production without ALLOW_PROD_WORKFLOW_SEED=true.");
  }

  const args = parseArgs(process.argv);
  const supabase = createAdminClient();

  // Find an existing template with the same name; otherwise create one.
  const { data: existing, error: lookupError } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: unknown) => {
          eq: (col: string, val: unknown) => {
            maybeSingle: () => Promise<{
              data: { id: string; version: number } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
  })
    .from("workflow_templates")
    .select("id, version")
    .eq("company_id", args.companyId)
    .eq("name", args.name)
    .maybeSingle();

  if (lookupError) throw new Error(`Template lookup failed: ${lookupError.message}`);

  let templateId: string;
  if (existing?.id) {
    templateId = existing.id;
    const { error: enableError } = await (supabase as unknown as {
      from: (t: string) => {
        update: (patch: unknown) => {
          eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("workflow_templates")
      .update({ is_enabled: args.enable })
      .eq("id", templateId);
    if (enableError) throw new Error(`Template enable failed: ${enableError.message}`);
    console.log(`[dev-seed] reused existing template ${templateId}; is_enabled=${args.enable}`);
    return;
  }

  const { data: inserted, error: insertError } = await (supabase as unknown as {
    from: (t: string) => {
      insert: (row: unknown) => {
        select: (cols: string) => {
          maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("workflow_templates")
    .insert({
      company_id: args.companyId,
      name: args.name,
      description: "Dev seed: fires enrich_lead when a lead is captured.",
      trigger_event: "lead_captured",
      scope: "any",
      event_id: null,
      is_enabled: args.enable,
      version: 1
    })
    .select("id")
    .maybeSingle();

  if (insertError || !inserted?.id) {
    throw new Error(`Template insert failed: ${insertError?.message ?? "no row returned"}`);
  }
  templateId = inserted.id;

  const { error: stepInsertError } = await (supabase as unknown as {
    from: (t: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> };
  })
    .from("workflow_steps")
    .insert({
      template_id: templateId,
      step_index: 0,
      step_type: ENRICH_LEAD_STEP_TYPE,
      step_key: "enrich",
      params_jsonb: {},
      requires_approval: false
    });

  if (stepInsertError) throw new Error(`Step insert failed: ${stepInsertError.message}`);

  console.log(`[dev-seed] created template ${templateId} with 1 step (enrich_lead). is_enabled=${args.enable}`);
}

main().catch((error) => {
  console.error("[dev-seed] failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
