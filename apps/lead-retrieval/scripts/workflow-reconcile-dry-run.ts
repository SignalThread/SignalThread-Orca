/**
 * Local-only verifier for the strict lead workflow reconciler.
 *
 * Usage:
 *   npm run workflow:reconcile:dry-run -- \
 *     --companyId <company-id> \
 *     --eventId <event-id> \
 *     --sinceIso 2026-06-09T00:00:00.000Z \
 *     --untilIso 2026-06-10T00:00:00.000Z \
 *     --limit 50
 *
 * Safe-create mode is intentionally harder to invoke:
 *   npm run workflow:reconcile:dry-run -- \
 *     --mode safe-create \
 *     --confirmSafeCreate \
 *     --companyId <company-id> \
 *     --eventId <event-id> \
 *     --sinceIso 2026-06-09T00:00:00.000Z \
 *     --untilIso 2026-06-10T00:00:00.000Z \
 *     --limit 50
 *
 * The script never calls /api/internal/workflow-tick. Default mode is dry-run.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import type { Database } from "@/types/database";
import { reconcileRecentLeadCapturedWorkflows } from "@/lib/workflows/reconcile/lead-workflow-reconciler";

type Args = {
  mode: "dry-run" | "safe-create";
  confirmSafeCreate: boolean;
  companyId: string;
  eventId: string;
  sinceIso: string;
  untilIso: string;
  limit: number;
};

type PartialArgs = Partial<Record<keyof Args, string>>;

function parseArgs(): Args {
  const rawArgs = process.argv.slice(2);
  const parsed: PartialArgs = {};

  for (let index = 0; index < rawArgs.length; index += 1) {
    const raw = String(rawArgs[index] ?? "");
    if (!raw.startsWith("--")) {
      throw new Error(`Unexpected argument: ${raw}`);
    }

    const withoutPrefix = raw.slice(2);
    if (withoutPrefix.includes("=")) {
      const [key, ...rest] = withoutPrefix.split("=");
      setArg(parsed, key, rest.join("="));
      continue;
    }

    const value = rawArgs[index + 1];
    if (withoutPrefix === "confirmSafeCreate" && (!value || String(value).startsWith("--"))) {
      setArg(parsed, withoutPrefix, "true");
      continue;
    }
    if (!value || String(value).startsWith("--")) {
      throw new Error(`Missing value for --${withoutPrefix}`);
    }
    setArg(parsed, withoutPrefix, String(value));
    index += 1;
  }

  const companyId = requireString(parsed.companyId, "companyId");
  const eventId = requireString(parsed.eventId, "eventId");
  const sinceIso = requireIso(parsed.sinceIso, "sinceIso");
  const untilIso = requireIso(parsed.untilIso, "untilIso");
  const limit = requireLimit(parsed.limit);
  const mode = (parsed.mode ?? "dry-run").trim();
  if (mode !== "dry-run" && mode !== "safe-create") {
    throw new Error("--mode must be dry-run or safe-create");
  }
  const confirmSafeCreate = parseBooleanFlag(parsed.confirmSafeCreate);
  if (mode === "safe-create" && confirmSafeCreate !== true) {
    throw new Error("--mode safe-create requires --confirmSafeCreate");
  }
  if (mode === "dry-run" && confirmSafeCreate === true) {
    throw new Error("--confirmSafeCreate is only valid with --mode safe-create");
  }

  if (Date.parse(untilIso) < Date.parse(sinceIso)) {
    throw new Error("untilIso must be greater than or equal to sinceIso");
  }

  return { mode, confirmSafeCreate, companyId, eventId, sinceIso, untilIso, limit };
}

function setArg(parsed: PartialArgs, key: string | undefined, value: string) {
  if (
    !key ||
    ![
      "mode",
      "confirmSafeCreate",
      "companyId",
      "eventId",
      "sinceIso",
      "untilIso",
      "limit"
    ].includes(key)
  ) {
    throw new Error(`Unknown argument: --${key ?? ""}`);
  }
  parsed[key as keyof Args] = value.trim();
}

function requireString(value: string | undefined, name: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`Missing required --${name}`);
  return text;
}

function requireIso(value: string | undefined, name: string) {
  const text = requireString(value, name);
  if (!Number.isFinite(Date.parse(text))) {
    throw new Error(`--${name} must be a valid ISO date string`);
  }
  return text;
}

function requireLimit(value: string | undefined) {
  const text = requireString(value, "limit");
  const limit = Number(text);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("--limit must be an integer from 1 to 50");
  }
  return limit;
}

function parseBooleanFlag(value: string | undefined) {
  if (value === undefined) return false;
  const text = String(value).trim().toLowerCase();
  if (text === "" || text === "true" || text === "1" || text === "yes") return true;
  if (text === "false" || text === "0" || text === "no") return false;
  throw new Error("--confirmSafeCreate must be a boolean flag");
}

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const [key, ...rest] = line.split("=");
        let value = rest.join("=").trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        return [key.trim(), value];
      })
  );
}

function loadSupabaseEnv() {
  const fileEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    fileEnv["NEXT_PUBLIC_SUPABASE_URL"] ||
    fileEnv["SUPABASE_URL"] ||
    "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv["SUPABASE_SERVICE_ROLE_KEY"] || "";

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env or .env.local"
    );
  }

  return { url, serviceKey };
}

function createLocalAdminClient() {
  const { url, serviceKey } = loadSupabaseEnv();
  return createClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function countRows(
  admin: ReturnType<typeof createLocalAdminClient>,
  table: "workflow_runs" | "workflow_step_runs",
  filters: Array<[string, string]> = []
) {
  let query = (admin as any).from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of filters) {
    query = query.eq(column, value);
  }
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function main() {
  const args = parseArgs();
  const admin = createLocalAdminClient();
  const workflowRunFilters: Array<[string, string]> = [
    ["company_id", args.companyId],
    ["event_id", args.eventId],
    ["trigger_event", "lead_captured"]
  ];

  const beforeCounts = {
    workflowRunsForScope: await countRows(admin, "workflow_runs", workflowRunFilters),
    workflowStepRunsTotal: await countRows(admin, "workflow_step_runs")
  };

  const result = await reconcileRecentLeadCapturedWorkflows({
    supabase: admin as any,
    dryRun: args.mode === "dry-run",
    safeCreate: args.mode === "safe-create",
    companyId: args.companyId,
    eventId: args.eventId,
    sinceIso: args.sinceIso,
    untilIso: args.untilIso,
    limit: args.limit
  });

  const afterCounts = {
    workflowRunsForScope: await countRows(admin, "workflow_runs", workflowRunFilters),
    workflowStepRunsTotal: await countRows(admin, "workflow_step_runs")
  };

  const output = {
    mode: args.mode,
    dryRunHardForced: args.mode === "dry-run",
    safeCreateConfirmed: args.mode === "safe-create" ? args.confirmSafeCreate : false,
    invokedRoute: null,
    bounds: args,
    safetyCounts: {
      before: beforeCounts,
      after: afterCounts,
      unchanged:
        beforeCounts.workflowRunsForScope === afterCounts.workflowRunsForScope &&
        beforeCounts.workflowStepRunsTotal === afterCounts.workflowStepRunsTotal
    },
    createdOrHeldRunIds: result.decisions
      .map((decision) => decision.createdRunId)
      .filter((id): id is string => Boolean(id)),
    result
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        mode: "workflow-reconcile-local",
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
