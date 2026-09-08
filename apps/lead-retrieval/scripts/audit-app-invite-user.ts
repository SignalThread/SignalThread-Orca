/**
 * Read-only audit for one user's app-invite redemption state.
 *
 *   npx tsx scripts/audit-app-invite-user.ts <email>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (env or .env.local).
 *
 * Prints JSON with:
 *   - auth.users row (id, email, confirmed_at, created_at)
 *   - public.users row (company_id, role, event_access_mode)
 *   - invite_codes rows for the email (used_at, used_by_user_id, event_id,
 *     exhibitor_company_id, permissions, event_access_mode)
 *   - event_users rows for the resolved user_id (status, permissions,
 *     exhibitor_company_id, event_id)
 *   - events referenced above (company_id, is_active, status, start_date,
 *     end_date)
 *   - `diagnosis` flags from lib/server/invites/invite-remediation-plan.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import type { Database } from "@/types/database";
import {
  diagnoseUser,
  type RemediationEventUsersSnapshot,
  type RemediationInviteRow,
  type RemediationUserSnapshot
} from "@/lib/server/invites/invite-remediation-plan";

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
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv["SUPABASE_SERVICE_ROLE_KEY"] || "";
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local or env."
    );
  }
  return { url, serviceKey };
}

async function findAuthUserByEmail(admin: ReturnType<typeof createClient<Database>>, email: string) {
  let page = 1;
  const perPage = 200;
  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    const match = users.find((u) => String(u.email ?? "").trim().toLowerCase() === email);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }
  return null;
}

async function main() {
  const emailArg = process.argv[2];
  if (!emailArg) {
    console.error("usage: npx tsx scripts/audit-app-invite-user.ts <email>");
    process.exit(2);
  }
  const email = emailArg.trim().toLowerCase();
  const { url, serviceKey } = env();
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const authUser = await findAuthUserByEmail(admin, email);

  const { data: publicUserRow, error: publicUserErr } = await (admin as any)
    .from("users")
    .select("id, email, role, company_id, event_access_mode, license_id, created_at")
    .ilike("email", email)
    .maybeSingle();
  if (publicUserErr) throw new Error(publicUserErr.message);

  const resolvedUserId =
    (publicUserRow && String(publicUserRow.id)) || (authUser && String(authUser.id)) || "";

  const { data: inviteCodes, error: inviteErr } = await (admin as any)
    .from("invite_codes")
    .select(
      "id, event_id, exhibitor_company_id, email, permissions, event_access_mode, created_at, expires_at, used_at, used_by_user_id"
    )
    .ilike("email", email)
    .order("created_at", { ascending: true });
  if (inviteErr) throw new Error(inviteErr.message);

  const inviteRows = ((inviteCodes ?? []) as RemediationInviteRow[]) ?? [];

  const { data: eventUsers, error: euErr } = resolvedUserId
    ? await (admin as any)
        .from("event_users")
        .select("id, user_id, event_id, exhibitor_company_id, status, permissions, created_at")
        .eq("user_id", resolvedUserId)
        .order("created_at", { ascending: true })
    : { data: [], error: null };
  if (euErr) throw new Error(euErr.message);

  const eventUsersRows = ((eventUsers ?? []) as RemediationEventUsersSnapshot[]) ?? [];

  const eventIds = Array.from(
    new Set(
      [
        ...inviteRows.map((r) => String(r.event_id ?? "").trim()),
        ...eventUsersRows.map((r) => String(r.event_id ?? "").trim())
      ].filter(Boolean)
    )
  );

  const { data: events, error: eventsErr } = eventIds.length
    ? await (admin as any)
        .from("events")
        .select("id, name, company_id, status, is_active, start_date, end_date")
        .in("id", eventIds)
    : { data: [], error: null };
  if (eventsErr) throw new Error(eventsErr.message);

  const { data: companyScopedLicenses } = publicUserRow?.company_id
    ? await (admin as any)
        .from("licenses")
        .select("id, scope, status, seats_total, seats_used, starts_at, expires_at, exhibitor_company_id, event_id")
        .eq("exhibitor_company_id", String(publicUserRow.company_id))
    : { data: [] };

  const userSnapshot: RemediationUserSnapshot | null = publicUserRow
    ? {
        id: String(publicUserRow.id),
        email: publicUserRow.email ?? null,
        role: publicUserRow.role ?? null,
        company_id: publicUserRow.company_id ?? null,
        event_access_mode: publicUserRow.event_access_mode ?? null
      }
    : null;

  const diagnosis = diagnoseUser({
    userSnapshot,
    inviteRows,
    eventUsers: eventUsersRows
  });

  const report = {
    query: { email },
    auth_users: authUser
      ? {
          id: authUser.id,
          email: authUser.email,
          email_confirmed_at: authUser.email_confirmed_at ?? null,
          created_at: authUser.created_at ?? null,
          last_sign_in_at: authUser.last_sign_in_at ?? null
        }
      : null,
    public_users: publicUserRow ?? null,
    invite_codes: inviteRows,
    event_users: eventUsersRows,
    events: events ?? [],
    company_licenses: companyScopedLicenses ?? [],
    diagnosis,
    notes: [
      "event_users.permissions.app must be true for the user to count as an app seat.",
      "event_users.status should be 'active' for the resolver to surface the event.",
      "If diagnosis contains 'event_users_missing' or 'invite_partially_consumed',",
      "run: npx tsx scripts/remediate-app-invite-access.ts --email=" + email + " --dry-run"
    ]
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
