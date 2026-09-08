/**
 * Diagnostic: exhibitor app users vs an event (default name: "Tech Summit 2026").
 *
 * Usage:
 *   npx tsx scripts/diagnose-exhibitor-app-user-tech-summit.ts [user@email.optional]
 *
 * For each exhibitor company that has an active license on the event, prints:
 * - users in public.users for that company
 * - event_users memberships with event names + permissions + status
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (.env.local ok)
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

import type { Database, Json } from "@/types/database";

const EVENT_NAME_SUBSTRING = "Tech Summit 2026";

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

function permSummary(permissions: Json | null): { app: boolean; admin: boolean } {
  const p = permissions;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    const o = p as Record<string, unknown>;
    return {
      app: o.app === true,
      admin: o.admin === true
    };
  }
  return { app: false, admin: false };
}

async function main() {
  const emailFilter = String(process.argv[2] ?? "").trim().toLowerCase() || null;
  const { url, serviceKey } = env();
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: eventRows, error: evErr } = await admin
    .from("events")
    .select("id, name, company_id")
    .ilike("name", `%${EVENT_NAME_SUBSTRING}%`);
  if (evErr) throw evErr;

  if (!eventRows?.length) {
    console.log(JSON.stringify({ error: "No events matched name substring", EVENT_NAME_SUBSTRING }, null, 2));
    process.exit(1);
  }

  const ev = eventRows[0];
  const techEventId = ev.id;

  const { data: licenseRows, error: licErr } = await admin
    .from("licenses")
    .select("id, exhibitor_company_id, status, event_id")
    .eq("event_id", techEventId)
    .eq("status", "active");
  if (licErr) throw licErr;

  const exhibitorCompanyIds = [
    ...new Set(
      (licenseRows ?? [])
        .map((r) => String(r.exhibitor_company_id ?? "").trim())
        .filter(Boolean)
    )
  ];

  console.log("=== Target event ===");
  console.log(JSON.stringify({ event_id: techEventId, event_name: ev.name }, null, 2));
  console.log("\n=== Active licenses on event (exhibitor_company_id values) ===");
  console.log(JSON.stringify(licenseRows ?? [], null, 2));

  const { data: companies } = await admin
    .from("companies")
    .select("id, name")
    .in("id", exhibitorCompanyIds.length ? exhibitorCompanyIds : ["00000000-0000-0000-0000-000000000001"]);
  const companyNameById = new Map((companies ?? []).map((c) => [c.id, c.name ?? c.id]));

  for (const exhibitorCompanyId of exhibitorCompanyIds) {
    console.log("\n========================================");
    console.log(
      `=== Exhibitor company ${exhibitorCompanyId} (${companyNameById.get(exhibitorCompanyId) ?? "name?"}) ===`
    );

    let userQuery = admin
      .from("users")
      .select("id, email, full_name, role, company_id, license_id, created_at")
      .eq("company_id", exhibitorCompanyId);
    if (emailFilter) {
      userQuery = userQuery.ilike("email", emailFilter);
    }
    const { data: companyUsers, error: uErr } = await userQuery;
    if (uErr) throw uErr;

    const ids = (companyUsers ?? []).map((u) => u.id);
    const { data: allMemberships, error: mErr } = await admin
      .from("event_users")
      .select("id, event_id, user_id, exhibitor_company_id, status, permissions, created_at")
      .eq("exhibitor_company_id", exhibitorCompanyId)
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    if (mErr) throw mErr;

    const eventNameById = new Map<string, string>();
    const eventIds = [...new Set((allMemberships ?? []).map((m) => m.event_id))];
    if (eventIds.length) {
      const { data: evs } = await admin.from("events").select("id, name").in("id", eventIds);
      for (const e of evs ?? []) {
        eventNameById.set(e.id, e.name ?? e.id);
      }
    }

    /** Exhibitor Users page lists all company profiles; event membership is metadata only. */
    const companyScopedListCount = (companyUsers ?? []).length;
    const alsoOnTechSummitSlice = (companyUsers ?? []).filter((u) =>
      (allMemberships ?? []).some((m) => m.user_id === u.id && m.event_id === techEventId)
    );

    console.log(
      `\nUsers page lists ${companyScopedListCount} user(s) (company-scoped). ${alsoOnTechSummitSlice.length} also have event_users on Tech Summit 2026 for this exhibitor.`
    );

    for (const u of companyUsers ?? []) {
      const mems = (allMemberships ?? []).filter((m) => m.user_id === u.id);
      const onTechSummitSameSlice = mems.some(
        (m) =>
          m.event_id === techEventId && String(m.exhibitor_company_id ?? "").trim() === exhibitorCompanyId
      );
      console.log(
        JSON.stringify(
          {
            user_id: u.id,
            email: u.email,
            full_name: u.full_name,
            role: u.role,
            company_id: u.company_id,
            on_target_event_with_matching_exhibitor_company_id: onTechSummitSameSlice,
            all_event_users_memberships: mems.map((m) => ({
              event_users_id: m.id,
              event_id: m.event_id,
              event_name: eventNameById.get(m.event_id) ?? "(unknown)",
              exhibitor_company_id: m.exhibitor_company_id,
              status: m.status,
              permissions: m.permissions,
              perm_summary: permSummary(m.permissions as Json)
            }))
          },
          null,
          2
        )
      );
    }
  }

  if (emailFilter) {
    console.log("\n=== Cross-check: user row by email anywhere ===");
    const { data: byEmail } = await admin.from("users").select("*").ilike("email", emailFilter);
    console.log(JSON.stringify(byEmail ?? [], null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/*
Example SQL (Supabase SQL editor; replace email):

select
  u.id as user_id,
  u.email,
  u.role,
  u.company_id,
  eu.id as event_users_id,
  eu.event_id,
  e.name as event_name,
  eu.exhibitor_company_id,
  eu.status,
  eu.permissions
from public.users u
left join public.event_users eu on eu.user_id = u.id
left join public.events e on e.id = eu.event_id
where u.email ilike '%your_user@example.com%'
order by eu.created_at desc;
*/
