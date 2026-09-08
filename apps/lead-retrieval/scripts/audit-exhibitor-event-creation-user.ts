/**
 * Read-only audit: resolve user, company, licenses, and canonical event-creation entitlement
 * for one email (default: kamyab.ali+direct@gmail.com).
 *
 *   npx tsx scripts/audit-exhibitor-event-creation-user.ts [email]
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local or env).
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

import type { Database } from "@/types/database";
import { evaluateExhibitorCompanyEventCreationFromLicenseRow } from "@/lib/licenses/evaluate-exhibitor-company-event-creation";

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

const DEFAULT_EMAIL = "kamyab.ali+direct@gmail.com";

async function main() {
  const email = (process.argv[2] || DEFAULT_EMAIL).trim().toLowerCase();
  const { url, serviceKey } = env();
  const supabase = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id, email, role, company_id, event_access_mode, license_id")
    .eq("email", email)
    .maybeSingle();

  if (userErr) {
    console.error("users lookup error:", userErr.message);
    process.exit(1);
  }
  if (!userRow) {
    console.log(JSON.stringify({ error: "No public.users row for email", email }, null, 2));
    process.exit(0);
  }

  const companyId = userRow.company_id ? String(userRow.company_id) : "";
  const { data: companyRow } = companyId
    ? await supabase.from("companies").select("id, name").eq("id", companyId).maybeSingle()
    : { data: null };

  const { data: licensesByExhibitor, error: licExErr } = companyId
    ? await supabase
        .from("licenses")
        .select(
          "id, scope, status, exhibitor_company_id, company_id, event_id, can_create_events, max_events, expires_at, starts_at, seats_total, seats_used, billing, billing_source"
        )
        .eq("exhibitor_company_id", companyId)
    : { data: null, error: null };

  const { data: licensesOrCompany, error: licOrErr } = companyId
    ? await supabase
        .from("licenses")
        .select(
          "id, scope, status, exhibitor_company_id, company_id, event_id, can_create_events, max_events, expires_at, starts_at"
        )
        .or(`exhibitor_company_id.eq.${companyId},company_id.eq.${companyId}`)
    : { data: null, error: null };

  const companyScoped = (licensesByExhibitor ?? []).filter((r) => String(r.scope ?? "").toLowerCase() === "company");

  const { count: eventCount, error: countErr } = companyId
    ? await supabase.from("events").select("id", { count: "exact", head: true }).eq("company_id", companyId)
    : { count: null, error: null };

  const nowMs = Date.now();
  let entitlement: unknown = null;
  if (companyId) {
    if (companyScoped.length > 1) {
      entitlement = {
        runtimeNote:
          "evaluateExhibitorCompanyEventCreationEligibility uses .maybeSingle() — PostgREST returns error if more than one row; user would see 500, not capability_disabled.",
        companyScopedLicenseIds: companyScoped.map((r) => r.id)
      };
    } else {
      const licenseForEval =
        companyScoped.length === 1
          ? {
              id: String(companyScoped[0].id),
              scope: companyScoped[0].scope,
              status: companyScoped[0].status,
              expiresAt: companyScoped[0].expires_at,
              canCreateEvents: Boolean(companyScoped[0].can_create_events),
              maxEvents: companyScoped[0].max_events == null ? null : Number(companyScoped[0].max_events)
            }
          : null;

      entitlement = evaluateExhibitorCompanyEventCreationFromLicenseRow({
        license: licenseForEval,
        currentEventCount: Number(eventCount ?? 0),
        nowMs
      });
    }
  }

  const report = {
    email,
    user: userRow,
    company: companyRow,
    licensesWhereExhibitorCompanyIdMatchesUserCompany: licensesByExhibitor ?? [],
    companyScopedRows: companyScoped,
    companyScopedRowCount: companyScoped.length,
    note:
      companyScoped.length > 1
        ? "Multiple company-scoped licenses for same exhibitor_company_id: runtime uses .maybeSingle() and may error or pick one row — investigate."
        : null,
    licensesOrExhibitorOrCompanyId: licensesOrCompany ?? [],
    licensesOrError: licOrErr?.message ?? licExErr?.message ?? null,
    eventCountForCompany: eventCount,
    eventCountError: countErr?.message ?? null,
    entitlementEvaluationMirror: entitlement,
    codePath:
      "evaluateExhibitorCompanyEventCreationEligibility loads .eq(exhibitor_company_id).eq(scope,company).maybeSingle() then maps can_create_events → canCreateEvents; evaluateExhibitorCompanyEventCreationFromLicenseRow denies with capability_disabled when !canCreateEvents"
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
