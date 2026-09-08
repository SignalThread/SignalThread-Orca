/**
 * Provisions a dedicated Maestro mobile E2E user by mirroring the Admin "App User" invite
 * (exhibitor_admin + app-only permissions) but using auth.admin.createUser so email/password
 * work immediately — equivalent to invite + confirmed password without using a one-off bypass.
 *
 * Run (prints credentials to stdout; do not commit output):
 *   npx tsx scripts/ensure-maestro-e2e-user.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in env (.env.local).
 */
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";

import type { Database } from "@/types/database";

type AdminClient = SupabaseClient<Database>;

const FIXED_EMAIL = "maestro-e2e-mobile@leadintel.local";

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

type LicenseRow = {
  id: string;
  event_id: string | null;
  exhibitor_company_id: string | null;
  company_id: string;
  seats_total: number | null;
  seats_used: number | null;
  status: string | null;
  expires_at: string | null;
};

async function pickActiveLicense(
  admin: AdminClient
): Promise<{ license: LicenseRow; eventName: string; exhibitorName: string }> {
  const { data: licenses, error } = await admin
    .from("licenses")
    .select("id, event_id, exhibitor_company_id, company_id, seats_total, seats_used, status, expires_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  const now = Date.now();
  const usable = (licenses ?? []).filter((row: LicenseRow) => {
    if (!row.event_id || !row.exhibitor_company_id) return false;
    if (row.expires_at) {
      const t = new Date(row.expires_at).getTime();
      if (!Number.isNaN(t) && t < now) return false;
    }
    return true;
  });
  if (!usable.length) {
    throw new Error("No active license with event_id + exhibitor_company_id; seed a license first.");
  }
  const license = usable[0] as LicenseRow;

  const { data: ev } = await admin.from("events").select("name").eq("id", license.event_id!).single();
  const { data: co } = await admin.from("companies").select("name").eq("id", license.exhibitor_company_id!).single();

  return {
    license,
    eventName: ev?.name ?? "(unknown event)",
    exhibitorName: co?.name ?? "(unknown company)"
  };
}

async function countAppSeats(
  admin: AdminClient,
  eventId: string,
  exhibitorCompanyId: string
): Promise<number> {
  const { data, error } = await admin
    .from("event_users")
    .select("id, permissions, status")
    .eq("event_id", eventId)
    .eq("exhibitor_company_id", exhibitorCompanyId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []).filter((row) => {
    const p = row.permissions;
    return typeof p === "object" && p !== null && !Array.isArray(p) && (p as { app?: boolean }).app === true;
  }).length;
}

async function reconcileSeats(
  admin: AdminClient,
  licenseId: string,
  eventId: string,
  exhibitorCompanyId: string
) {
  const seatsUsed = await countAppSeats(admin, eventId, exhibitorCompanyId);
  const { error } = await admin.from("licenses").update({ seats_used: seatsUsed }).eq("id", licenseId);
  if (error) throw error;
}

async function deleteExistingMaestroUser(admin: AdminClient, email: string) {
  const { data: row } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  const uid = row?.id ?? null;
  if (!uid) return;
  await admin.from("event_users").delete().eq("user_id", uid);
  await admin.from("users").delete().eq("id", uid);
  await admin.auth.admin.deleteUser(uid);
}

async function main() {
  const { url, serviceKey } = env();
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { license, eventName, exhibitorName } = await pickActiveLicense(admin);
  const eventId = license.event_id!;
  const exhibitorCompanyId = license.exhibitor_company_id!;

  const seatsUsed = await countAppSeats(admin, eventId, exhibitorCompanyId);
  const cap = Number(license.seats_total ?? 0);
  if (cap > 0 && seatsUsed >= cap) {
    throw new Error(
      `No free app seats on license ${license.id} (seats_used ${seatsUsed} / ${cap}). Increase seats_total or free a seat.`
    );
  }

  await deleteExistingMaestroUser(admin, FIXED_EMAIL);

  const password =
    randomBytes(18).toString("base64url") + "A1!";

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: FIXED_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Maestro E2E Mobile" }
  });
  if (createErr || !created.user) {
    throw new Error(createErr?.message ?? "createUser failed");
  }
  const userId = created.user.id;

  const { error: uErr } = await admin.from("users").insert({
    id: userId,
    role: "exhibitor_admin",
    company_id: exhibitorCompanyId,
    full_name: "Maestro E2E Mobile",
    email: FIXED_EMAIL,
    license_id: license.id,
    created_at: new Date().toISOString()
  });
  if (uErr) {
    await admin.auth.admin.deleteUser(userId);
    throw uErr;
  }

  const { error: eErr } = await admin.from("event_users").insert({
    event_id: eventId,
    user_id: userId,
    exhibitor_company_id: exhibitorCompanyId,
    status: "active",
    permissions: { admin: false, app: true },
    created_at: new Date().toISOString()
  });
  if (eErr) {
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
    throw eErr;
  }

  await reconcileSeats(admin, license.id, eventId, exhibitorCompanyId);

  console.log("--- Maestro E2E user (copy to your shell / Maestro secrets, do not commit) ---");
  console.log("MAESTRO_E2E_EMAIL=" + FIXED_EMAIL);
  console.log("MAESTRO_E2E_PASSWORD=" + password);
  console.log("--- Scope ---");
  console.log("role (public.users): exhibitor_admin");
  console.log("event_users.permissions: { admin: false, app: true }  (same intent as Admin “App User”)");
  console.log("event_id:", eventId);
  console.log("event_name:", eventName);
  console.log("exhibitor_company_id:", exhibitorCompanyId);
  console.log("exhibitor_company_name:", exhibitorName);
  console.log("license_id:", license.id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
