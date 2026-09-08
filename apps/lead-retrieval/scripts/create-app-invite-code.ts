/**
 * Production operator fallback for Company Team mobile invite codes.
 *
 * Dry-run (validates company/event scope; performs no invite mutation):
 *   npx tsx --conditions=react-server scripts/create-app-invite-code.ts --email user@example.com --company-id <uuid> --event-id <uuid> --dry-run
 *
 * Create/replace the pending code for this exact email/company/event scope:
 *   npx tsx --conditions=react-server scripts/create-app-invite-code.ts --email user@example.com --company-id <uuid> --event-id <uuid>
 *
 * The script loads standard Next.js .env files, requires the canonical Supabase admin env,
 * validates the company/event association, and delegates creation/seat enforcement to the
 * same createCompanyAppUserInviteCodes -> orchestrateCompanyAppUserInvite -> createInviteCode path as the UI.
 */
import { pathToFileURL } from "node:url";
import { loadEnvConfig } from "@next/env";
import {
  parseCreateAppInviteCodeArgs,
  runCreateAppInviteCodeCli
} from "@/lib/exhibitor/create-app-invite-code-cli";
import { createCompanyAppUserInviteCodes } from "@/lib/server/invites/create-company-app-user-invite";
import { createAdminClient } from "@/lib/supabase/admin";

export async function main(argv: string[]) {
  loadEnvConfig(process.cwd());
  const args = parseCreateAppInviteCodeArgs(argv);
  const supabase = createAdminClient();

  const result = await runCreateAppInviteCodeCli(args, {
    loadCompany: async (companyId) => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("id, name")
        .eq("id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message ?? "Failed loading company.");
      return data ? { id: String(data.id), name: data.name ?? null } : null;
    },
    loadEvent: async (eventId) => {
      const { data, error } = await (supabase as any)
        .from("events")
        .select("id, name, company_id")
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw new Error(error.message ?? "Failed loading event.");
      return data
        ? { id: String(data.id), name: data.name ?? null, companyId: data.company_id ?? null }
        : null;
    },
    hasExhibitorAssignment: async (companyId, eventId) => {
      const { count, error } = await (supabase as any)
        .from("exhibitors")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("event_id", eventId);
      if (error) throw new Error(error.message ?? "Failed validating exhibitor event assignment.");
      return Number(count ?? 0) > 0;
    },
    createInvite: (context) =>
      createCompanyAppUserInviteCodes({
        supabase,
        companyId: context.companyId,
        email: context.email,
        eventAccessMode: "assigned_events_only",
        assignedEventIds: [context.eventId],
        sendEmail: false
      })
  });

  console.log(`Company: ${result.context.companyName} (${result.context.companyId})`);
  console.log(`Event: ${result.context.eventName} (${result.context.eventId})`);
  console.log(`Email: ${result.context.email}`);
  if (result.code === null) {
    console.log("DRY RUN: scope validated; no invite code was generated.");
    return;
  }
  console.log(result.code);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : "Invite code generation failed.");
    process.exitCode = 1;
  });
}
