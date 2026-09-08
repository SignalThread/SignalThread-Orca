/**
 * One-time remediation for users stranded by the pre-migration-0063 redeem bug.
 *
 *   npx tsx scripts/remediate-app-invite-access.ts [--dry-run] [--email=<one@example.com>]
 *
 * Idempotent. Safe to run repeatedly. Default is DRY RUN — pass --apply to
 * actually write. Passing --email restricts the run to a single user.
 *
 * What it does (applies the plan from
 * lib/server/invites/invite-remediation-plan.ts):
 *
 *   1. Loads every `invite_codes` row joined by (email, exhibitor_company_id).
 *   2. Groups rows that share an `used_by_user_id` (i.e. historical redeems).
 *   3. For each group:
 *        a. Ensures `event_users(user_id, event_id, exhibitor_company_id)`
 *           exists with `permissions.app = true`. Re-uses
 *           `activateInvitedMembershipWithSeatEnforcement` for seat safety.
 *        b. Marks any sibling invite still pending as `used_at=now()`,
 *           `used_by_user_id=<redeemer>` so the group is fully accounted for.
 *        c. If every invite in the group declares the same
 *           `event_access_mode` (populated by post-fix creates), mirrors it
 *           onto `public.users.event_access_mode`.
 *   4. Skips groups that are ambiguous (multiple distinct used_by_user_id),
 *      missing a `public.users` row, or whose invite company_id disagrees
 *      with the user's company.
 *
 * Does NOT change `users.role`, does NOT modify `auth.users`, and does NOT
 * touch rows that are already correct.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import type { Database } from "@/types/database";
import {
  buildRemediationSummary,
  groupInviteRowsForRemediation,
  planUserRemediation,
  type RemediationEventUsersSnapshot,
  type RemediationInviteRow,
  type RemediationUserSnapshot,
  type UserRemediationPlan,
  type UserRemediationStep
} from "@/lib/server/invites/invite-remediation-plan";

type Args = {
  email: string | null;
  dryRun: boolean;
};

function parseArgs(): Args {
  const args: Args = { email: null, dryRun: true };
  for (const raw of process.argv.slice(2)) {
    const arg = String(raw);
    if (arg === "--apply") args.dryRun = false;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--email=")) args.email = arg.slice("--email=".length).trim().toLowerCase();
  }
  return args;
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

function env(): { url: string; serviceKey: string } {
  const fileEnv = loadEnvFile(path.join(process.cwd(), ".env.local"));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv["NEXT_PUBLIC_SUPABASE_URL"] || "";
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv["SUPABASE_SERVICE_ROLE_KEY"] || "";
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local or env."
    );
  }
  return { url, serviceKey };
}

type AdminClient = ReturnType<typeof createClient<Database>>;

async function loadInviteRows(admin: AdminClient, email: string | null): Promise<RemediationInviteRow[]> {
  let query = (admin as any)
    .from("invite_codes")
    .select(
      "id, event_id, exhibitor_company_id, email, permissions, event_access_mode, used_at, used_by_user_id"
    )
    .not("used_by_user_id", "is", null);
  if (email) {
    query = query.ilike("email", email);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const redeemedEmails = Array.from(
    new Set(
      ((data ?? []) as RemediationInviteRow[])
        .map((r) => String(r.email ?? "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (redeemedEmails.length === 0) return [];

  // Pull ALL rows (used + still-pending) for the same emails so the planner
  // can see pending siblings it needs to consume too.
  let siblingsQuery = (admin as any)
    .from("invite_codes")
    .select(
      "id, event_id, exhibitor_company_id, email, permissions, event_access_mode, used_at, used_by_user_id"
    )
    .in("email", redeemedEmails);
  if (email) {
    siblingsQuery = siblingsQuery.ilike("email", email);
  }
  const { data: siblings, error: siblingsErr } = await siblingsQuery;
  if (siblingsErr) throw new Error(siblingsErr.message);

  return (siblings ?? []) as RemediationInviteRow[];
}

async function loadUserSnapshots(
  admin: AdminClient,
  userIds: string[]
): Promise<Map<string, RemediationUserSnapshot>> {
  const map = new Map<string, RemediationUserSnapshot>();
  if (userIds.length === 0) return map;
  const { data, error } = await (admin as any)
    .from("users")
    .select("id, email, role, company_id, event_access_mode")
    .in("id", userIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as RemediationUserSnapshot[]) {
    if (row?.id) map.set(String(row.id), row);
  }
  return map;
}

async function loadEventUsersFor(
  admin: AdminClient,
  userIds: string[]
): Promise<Map<string, RemediationEventUsersSnapshot[]>> {
  const map = new Map<string, RemediationEventUsersSnapshot[]>();
  if (userIds.length === 0) return map;
  const { data, error } = await (admin as any)
    .from("event_users")
    .select("id, user_id, event_id, exhibitor_company_id, status, permissions")
    .in("user_id", userIds);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as (RemediationEventUsersSnapshot & { id: string })[]) {
    const key = String(row.user_id);
    const bucket = map.get(key) ?? [];
    bucket.push(row);
    map.set(key, bucket);
  }
  return map;
}

async function applyPlan(
  admin: AdminClient,
  plan: UserRemediationPlan,
  dryRun: boolean
): Promise<{ applied: UserRemediationStep[]; errors: Array<{ step: UserRemediationStep; error: string }> }> {
  const applied: UserRemediationStep[] = [];
  const errors: Array<{ step: UserRemediationStep; error: string }> = [];
  if (plan.skipped) return { applied, errors };

  const { activateInvitedMembershipWithSeatEnforcement } = await import(
    "@/lib/server/event-user-access"
  );

  const nowIso = new Date().toISOString();

  for (const step of plan.steps) {
    if (dryRun) {
      applied.push(step);
      continue;
    }
    try {
      if (step.kind === "ensure_event_users") {
        const { data: existing, error: existingErr } = await (admin as any)
          .from("event_users")
          .select("id, status, exhibitor_company_id, permissions")
          .eq("user_id", step.userId)
          .eq("event_id", step.eventId)
          .maybeSingle();
        if (existingErr) throw new Error(existingErr.message);

        if (!existing?.id) {
          const { error: insertErr } = await (admin as any).from("event_users").insert({
            user_id: step.userId,
            event_id: step.eventId,
            exhibitor_company_id: step.exhibitorCompanyId,
            status: "invited",
            permissions: step.permissions,
            created_at: nowIso
          });
          if (insertErr) throw new Error(insertErr.message);
        } else {
          const patch: Record<string, unknown> = {};
          const existingScope = String(existing.exhibitor_company_id ?? "").trim();
          if (!existingScope || existingScope !== step.exhibitorCompanyId) {
            patch.exhibitor_company_id = step.exhibitorCompanyId;
          }
          const existingPerms = existing.permissions;
          const existingApp =
            existingPerms && typeof existingPerms === "object" && !Array.isArray(existingPerms)
              ? Boolean((existingPerms as Record<string, unknown>).app)
              : false;
          if (!existingApp) {
            patch.permissions = step.permissions;
          }
          if (Object.keys(patch).length > 0) {
            const { error: updErr } = await (admin as any)
              .from("event_users")
              .update(patch)
              .eq("id", existing.id);
            if (updErr) throw new Error(updErr.message);
          }
        }

        const activation = await activateInvitedMembershipWithSeatEnforcement({
          userId: step.userId,
          eventId: step.eventId,
          exhibitorCompanyId: step.exhibitorCompanyId
        });
        if (!activation.ok) {
          throw new Error(activation.error ?? "seat enforcement denied activation");
        }
        applied.push(step);
      } else if (step.kind === "consume_invite") {
        const { error: consumeErr } = await (admin as any)
          .from("invite_codes")
          .update({
            used_at: nowIso,
            used_by_user_id: step.userId
          })
          .eq("id", step.inviteId)
          .is("used_at", null);
        if (consumeErr) throw new Error(consumeErr.message);
        applied.push(step);
      } else if (step.kind === "set_user_event_access_mode") {
        const { error: modeErr } = await (admin as any)
          .from("users")
          .update({ event_access_mode: step.eventAccessMode })
          .eq("id", step.userId);
        if (modeErr) throw new Error(modeErr.message);
        applied.push(step);
      }
    } catch (e) {
      errors.push({ step, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { applied, errors };
}

async function main() {
  const args = parseArgs();
  const { url, serviceKey } = env();
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const inviteRows = await loadInviteRows(admin, args.email);
  const groups = groupInviteRowsForRemediation(inviteRows);
  const userIds = Array.from(new Set(groups.map((g) => g.userId).filter(Boolean)));

  const [userSnapshots, eventUsersByUser] = await Promise.all([
    loadUserSnapshots(admin, userIds),
    loadEventUsersFor(admin, userIds)
  ]);

  const nowIso = new Date().toISOString();
  const plans: UserRemediationPlan[] = groups.map((group) =>
    planUserRemediation({
      group,
      userSnapshot: group.userId ? (userSnapshots.get(group.userId) ?? null) : null,
      existingEventUsers: group.userId ? (eventUsersByUser.get(group.userId) ?? []) : [],
      nowIso
    })
  );

  const summary = buildRemediationSummary(plans);

  const results: Array<{
    email: string;
    exhibitorCompanyId: string;
    userId: string;
    steps: UserRemediationStep[];
    applied: UserRemediationStep[];
    errors: Array<{ step: UserRemediationStep; error: string }>;
    skipped?: UserRemediationPlan["skipped"];
  }> = [];

  for (const plan of plans) {
    const { applied, errors } = await applyPlan(admin, plan, args.dryRun);
    results.push({
      email: plan.group.email,
      exhibitorCompanyId: plan.group.exhibitorCompanyId,
      userId: plan.group.userId,
      steps: plan.steps,
      applied,
      errors,
      skipped: plan.skipped
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: args.dryRun ? "DRY_RUN" : "APPLY",
        filterEmail: args.email,
        totalGroupsScanned: plans.length,
        actionableGroupCount: summary.actionableGroupCount,
        skippedGroupCount: summary.skippedGroupCount,
        results
      },
      null,
      2
    )
  );

  const hadErrors = results.some((r) => r.errors.length > 0);
  if (hadErrors) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
