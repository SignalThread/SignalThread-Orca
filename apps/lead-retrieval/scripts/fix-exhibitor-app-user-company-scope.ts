/**
 * Repair: align an app user's public.users.company_id + event_users.exhibitor_company_id
 * to the exhibitor company that owns the event-scoped license slice (so they appear on
 * /exhibitor/users for that exhibitor admin).
 *
 * Does not change RBAC flags on event_users.permissions (preserves app/admin bits).
 *
 * Usage:
 *   npx tsx scripts/fix-exhibitor-app-user-company-scope.ts <email> <target_exhibitor_company_id> <event_id> [target_license_id]
 *
 * If target_license_id is omitted, picks latest active event-scoped license for (event_id, target_exhibitor_company_id).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local ok)
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

import type { Database, Json } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

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
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return { url, serviceKey };
}

function appSeatConsumed(permissions: Json | null, status: string | null): boolean {
  if (String(status ?? "").toLowerCase() !== "active") return false;
  const p = permissions;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    return (p as Record<string, unknown>).app === true;
  }
  return false;
}

async function countAppSeats(
  admin: AdminClient,
  eventId: string,
  exhibitorCompanyId: string
): Promise<number> {
  const { data, error } = await admin
    .from("event_users")
    .select("permissions, status")
    .eq("event_id", eventId)
    .eq("exhibitor_company_id", exhibitorCompanyId);
  if (error) throw error;
  return (data ?? []).filter((row) => appSeatConsumed(row.permissions as Json, row.status)).length;
}

async function refreshSeatsForSlice(admin: AdminClient, eventId: string, exhibitorCompanyId: string) {
  const { data: licenseRows, error: licErr } = await admin
    .from("licenses")
    .select("id")
    .eq("event_id", eventId)
    .eq("exhibitor_company_id", exhibitorCompanyId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1);
  if (licErr) throw licErr;
  const licenseId = licenseRows?.[0]?.id;
  if (!licenseId) {
    console.warn("No active license for slice; skip seats_used update", { eventId, exhibitorCompanyId });
    return;
  }
  const seatsUsed = await countAppSeats(admin, eventId, exhibitorCompanyId);
  const { error: upErr } = await admin.from("licenses").update({ seats_used: seatsUsed }).eq("id", licenseId);
  if (upErr) throw upErr;
  console.log("Reconciled license seats_used", { licenseId, seatsUsed, eventId, exhibitorCompanyId });
}

async function resolveLicenseId(
  admin: AdminClient,
  eventId: string,
  exhibitorCompanyId: string,
  explicit: string | null
): Promise<string> {
  if (explicit) return explicit;
  const { data, error } = await admin
    .from("licenses")
    .select("id")
    .eq("event_id", eventId)
    .eq("exhibitor_company_id", exhibitorCompanyId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const id = data?.id;
  if (!id) throw new Error("No active license for event + exhibitor company");
  return id;
}

async function main() {
  const email = String(process.argv[2] ?? "").trim().toLowerCase();
  const targetExhibitorCompanyId = String(process.argv[3] ?? "").trim();
  const eventId = String(process.argv[4] ?? "").trim();
  const licenseArg = String(process.argv[5] ?? "").trim() || null;

  if (!email || !targetExhibitorCompanyId || !eventId) {
    console.error(
      "Usage: npx tsx scripts/fix-exhibitor-app-user-company-scope.ts <email> <target_exhibitor_company_id> <event_id> [license_id]"
    );
    process.exit(1);
  }

  const { url, serviceKey } = env();
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userRow, error: uErr } = await admin
    .from("users")
    .select("id, email, company_id, role, license_id")
    .eq("email", email)
    .maybeSingle();
  if (uErr) throw uErr;
  if (!userRow) {
    throw new Error(`No public.users row for ${email}`);
  }

  const { data: memRow, error: mErr } = await admin
    .from("event_users")
    .select("id, exhibitor_company_id, status, permissions")
    .eq("user_id", userRow.id)
    .eq("event_id", eventId)
    .maybeSingle();
  if (mErr) throw mErr;
  if (!memRow) {
    throw new Error(`No event_users row for user + event_id`);
  }

  const prevExhibitorCompanyId = String(memRow.exhibitor_company_id ?? "").trim();
  const targetLicenseId = await resolveLicenseId(admin, eventId, targetExhibitorCompanyId, licenseArg);

  console.log("Before:", {
    userId: userRow.id,
    email: userRow.email,
    users_company_id: userRow.company_id,
    membership_exhibitor_company_id: prevExhibitorCompanyId,
    membership_status: memRow.status,
    permissions: memRow.permissions
  });

  const { error: upUserErr } = await admin
    .from("users")
    .update({
      company_id: targetExhibitorCompanyId,
      license_id: targetLicenseId
    })
    .eq("id", userRow.id);
  if (upUserErr) throw upUserErr;

  const { error: upMemErr } = await admin
    .from("event_users")
    .update({
      exhibitor_company_id: targetExhibitorCompanyId
    })
    .eq("id", memRow.id);
  if (upMemErr) throw upMemErr;

  if (prevExhibitorCompanyId && prevExhibitorCompanyId !== targetExhibitorCompanyId) {
    await refreshSeatsForSlice(admin, eventId, prevExhibitorCompanyId);
  }
  await refreshSeatsForSlice(admin, eventId, targetExhibitorCompanyId);

  console.log("After: users.company_id + event_users.exhibitor_company_id set to", targetExhibitorCompanyId);
  console.log("users.license_id set to", targetLicenseId);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
