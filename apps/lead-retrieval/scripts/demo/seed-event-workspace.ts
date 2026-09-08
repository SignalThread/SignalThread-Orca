/**
 * Reusable Event Workspace demo-data seeder.
 *
 * This script writes only canonical leads, analyzed lead conversations, and
 * lead briefings. It never calls AI/enrichment services and never mutates the
 * target event, users, memberships, licenses, invitations, or schema.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  assertEventWorkspaceRemoteSafety,
  classifySupabaseTarget,
  executeEventWorkspaceDemoSeed,
  parseEventWorkspaceDemoArgs,
  type EventWorkspaceSeedEvent,
  type EventWorkspaceSeedRepResolution,
  type EventWorkspaceSeedRepository,
  type EventWorkspaceSeedSummary,
  type SeedRow,
  type SeedTable
} from "@/lib/demo/event-workspace-seed-core";

type AdminClient = ReturnType<typeof createClient<Database>>;

function loadDotEnvLocal(): void {
  const file = join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!key || process.env[key]) continue;
    let value = rest.join("=").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function createRepository(client: AdminClient): EventWorkspaceSeedRepository {
  const db = client as any;
  const externalLeadDependencyTables = [
    "lead_enrichments",
    "document_sends",
    "campaign_recipients",
    "workflow_runs",
    "generated_drafts",
    "workflow_trigger_decisions",
    "lead_conversation_readiness",
    "import_batch_row_briefings",
    "lead_cumulative_insights",
    "lead_voice_notes"
  ] as const;
  return {
    async loadEvent(eventId): Promise<EventWorkspaceSeedEvent | null> {
      const { data, error } = await db
        .from("events")
        .select("id, company_id, name, status, start_date, end_date, container_kind")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw new Error(`Failed loading event: ${error.message}`);
      return (data as EventWorkspaceSeedEvent | null) ?? null;
    },

    async loadReps(companyId, eventId): Promise<EventWorkspaceSeedRepResolution> {
      const { data: memberships, error: membershipError } = await db
        .from("event_users")
        .select("user_id, exhibitor_company_id, status")
        .eq("event_id", eventId)
        .eq("exhibitor_company_id", companyId);
      if (membershipError) throw new Error(`Failed loading event reps: ${membershipError.message}`);
      const activeMemberships = (memberships ?? []).filter(
        (row: Record<string, unknown>) => String(row.status ?? "active").toLowerCase() === "active"
      );
      const userIds = [
        ...new Set(activeMemberships.map((row: Record<string, unknown>) => String(row.user_id ?? "")).filter(Boolean))
      ];
      if (userIds.length === 0) return { reps: [], invalidMembershipCount: 0 };

      const { data: users, error: usersError } = await db
        .from("users")
        .select("id, company_id, full_name, email, role")
        .in("id", userIds);
      if (usersError) throw new Error(`Failed loading rep identities: ${usersError.message}`);
      const repRoles = new Set(["exhibitor", "exhibitor_admin", "exhibitor_viewer"]);
      const valid = (users ?? []).filter(
        (row: Record<string, unknown>) =>
          String(row.company_id ?? "") === companyId &&
          repRoles.has(String(row.role ?? "").trim().toLowerCase())
      );
      const validIds = new Set(valid.map((row: Record<string, unknown>) => String(row.id)));
      return {
        reps: valid
          .map((row: Record<string, unknown>) => ({
            id: String(row.id),
            full_name: row.full_name == null ? null : String(row.full_name),
            email: row.email == null ? null : String(row.email)
          }))
          .sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id)),
        invalidMembershipCount: userIds.filter((id) => !validIds.has(id)).length
      };
    },

    async loadRows(table: SeedTable, ids: readonly string[]): Promise<SeedRow[]> {
      if (ids.length === 0) return [];
      const { data, error } = await db.from(table).select("*").in("id", ids);
      if (error) throw new Error(`Failed loading ${table}: ${error.message}`);
      return (data ?? []) as SeedRow[];
    },

    async loadExternalDependencyCounts(leadIds: readonly string[]): Promise<Record<string, number>> {
      if (leadIds.length === 0) return {};
      const entries = await Promise.all(
        externalLeadDependencyTables.map(async (table) => {
          const { count, error } = await db
            .from(table)
            .select("id", { count: "exact", head: true })
            .in("lead_id", leadIds);
          if (error) {
            throw new Error(`Failed checking reset dependency ${table}: ${error.message}`);
          }
          return [table, typeof count === "number" ? count : 0] as const;
        })
      );
      return Object.fromEntries(entries);
    },

    async upsertRows(table: SeedTable, rows: readonly SeedRow[]): Promise<void> {
      if (rows.length === 0) return;
      const { error } = await db.from(table).upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Failed upserting ${table}: ${error.message}`);
    },

    async deleteRows(table: SeedTable, ids: readonly string[]): Promise<void> {
      if (ids.length === 0) return;
      const { error } = await db.from(table).delete().in("id", ids);
      if (error) throw new Error(`Failed deleting ${table}: ${error.message}`);
    }
  };
}

function formatReps(summary: EventWorkspaceSeedSummary): string {
  if (summary.existingReps.length === 0) return "none";
  return summary.existingReps
    .map((rep) => rep.full_name?.trim() || rep.email?.trim() || rep.id)
    .join(", ");
}

function formatCounts(value: EventWorkspaceSeedSummary["created"]): string {
  return `${value.total} (leads ${value.leads}, conversations ${value.conversations}, briefs ${value.briefs})`;
}

function printSummary(summary: EventWorkspaceSeedSummary): void {
  console.log(`Event: ${summary.event.name} (${summary.event.id})`);
  console.log(`Company: ${summary.event.company_id}`);
  console.log(`Environment: ${summary.environment.isLocal ? "local" : "remote"} (${summary.environment.host})`);
  console.log(`Scenario: ${summary.scenario}`);
  console.log(`Lifecycle: ${summary.lifecycle}`);
  console.log(`Leads: ${summary.planned.leads}`);
  console.log(`Conversations: ${summary.planned.conversations}`);
  console.log(`Evidence records: ${summary.planned.evidenceRecords}`);
  console.log(`Follow-ups: ${summary.planned.followUps}`);
  console.log(`Briefs: ${summary.planned.briefs}`);
  console.log(`Existing reps reused: ${formatReps(summary)}`);
  console.log(`Created: ${formatCounts(summary.created)}`);
  console.log(`Updated: ${formatCounts(summary.updated)}`);
  console.log(`Unchanged: ${formatCounts(summary.unchanged)}`);
  console.log(`Deleted: ${formatCounts(summary.deleted)}`);
  console.log(`Warnings: ${summary.warnings.length > 0 ? summary.warnings.join(" | ") : "none"}`);
  console.log(
    `Open: /exhibitor/dashboard?eventId=${encodeURIComponent(summary.event.id)}`
  );
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const args = parseEventWorkspaceDemoArgs(process.argv.slice(2));
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required."
    );
  }
  const environment = classifySupabaseTarget(supabaseUrl);
  const client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const repository = createRepository(client);

  // Print and validate the complete remote target before the core is allowed
  // to perform its first write. The core repeats the validation fail-closed.
  if (args.mode === "apply" && !environment.isLocal) {
    const event = await repository.loadEvent(args.eventId);
    if (!event) throw new Error(`Event not found: ${args.eventId}`);
    assertEventWorkspaceRemoteSafety({
      args,
      environment,
      event,
      allowedCompanyIds: process.env.DEMO_SEED_ALLOWED_COMPANY_IDS
    });
    console.log(`Remote target host: ${environment.host}`);
    console.log(`Remote target company: ${event.company_id}`);
    console.log(`Remote target event: ${event.name} (${event.id})`);
    console.log(`Remote target scenario: ${args.reset ? "reset" : args.scenario}`);
  }

  const summary = await executeEventWorkspaceDemoSeed({
    args,
    environment,
    repository,
    allowedCompanyIds: process.env.DEMO_SEED_ALLOWED_COMPANY_IDS
  });
  printSummary(summary);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
