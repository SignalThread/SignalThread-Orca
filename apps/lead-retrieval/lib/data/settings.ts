import { labelForEnrichmentProviderId } from "@/lib/config/enrichment-providers";
import { getCurrentScopedUserContext } from "@/lib/data/exhibitor-context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function humanizeRole(role: string | null | undefined): string {
  const r = String(role ?? "").toLowerCase();
  if (r === "exhibitor_admin") return "Exhibitor admin";
  if (r === "viewer") return "App user";
  if (r === "exhibitor") return "Exhibitor";
  if (r === "organizer_admin") return "Organizer admin";
  if (r === "platform_admin") return "Platform admin";
  return r ? r.replace(/_/g, " ") : "—";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type CompanySettingsSnapshot = {
  name: string;
  defaultEnrichmentProvider: string | null;
  defaultEnrichmentLabel: string | null;
};

export type LicenseSettingsSnapshot = {
  id: string;
  planName: string | null;
  planCode: string | null;
  status: string;
  seatsUsed: number;
  seatsTotal: number;
  expiresAt: string;
  /** Preformatted for display */
  expiresAtLabel: string;
  termMonths: number | null;
};

export type UserSettingsSnapshot = {
  id: string;
  fullName: string | null;
  email: string | null;
  roleLabel: string;
};

export type PrimaryAdminSnapshot = {
  fullName: string | null;
  email: string | null;
};

export type EventAccessSnapshot = {
  eventId: string | null;
};

export async function getExhibitorSettingsSnapshot() {
  const context = await getCurrentScopedUserContext();

  if (!context.companyId) {
    return {
      company: null as CompanySettingsSnapshot | null,
      license: null as LicenseSettingsSnapshot | null,
      sessionUser: null as UserSettingsSnapshot | null,
      primaryAdmin: null as PrimaryAdminSnapshot | null,
      eventAccess: { eventId: null } as EventAccessSnapshot,
    };
  }

  const supabase = await createSupabaseServerClient();

  const [
    { data: companyRow },
    { data: licenseRow },
    { data: selfRow },
    { data: adminRow },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("name, default_enrichment_provider")
      .eq("id", context.companyId)
      .maybeSingle(),
    supabase
      .from("licenses")
      .select("id, status, seats_total, seats_used, expires_at, term_months, license_plan_id, license_plans(name, code)")
      .eq("exhibitor_company_id", context.companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("users").select("id, full_name, email, role").eq("id", context.id).maybeSingle(),
    supabase
      .from("users")
      .select("full_name, email")
      .eq("company_id", context.companyId)
      .eq("role", "exhibitor_admin")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const company = companyRow
    ? ({
        name: String((companyRow as { name: string }).name ?? ""),
        defaultEnrichmentProvider:
          (companyRow as { default_enrichment_provider?: string | null }).default_enrichment_provider ?? null,
        defaultEnrichmentLabel: labelForEnrichmentProviderId(
          (companyRow as { default_enrichment_provider?: string | null }).default_enrichment_provider ?? null
        ),
      } satisfies CompanySettingsSnapshot)
    : null;

  const lp = licenseRow as {
    id: string;
    status: string;
    seats_total: number;
    seats_used: number;
    expires_at: string;
    term_months: number | null;
    license_plans: { name: string; code: string } | null;
  } | null;

  const license: LicenseSettingsSnapshot | null = lp
    ? {
        id: lp.id,
        planName: lp.license_plans?.name ?? null,
        planCode: lp.license_plans?.code ?? null,
        status: lp.status,
        seatsUsed: lp.seats_used,
        seatsTotal: lp.seats_total,
        expiresAt: lp.expires_at,
        expiresAtLabel: formatDate(lp.expires_at),
        termMonths: lp.term_months,
      }
    : null;

  const self = selfRow as { id: string; full_name: string | null; email: string | null; role: string } | null;

  const sessionUser: UserSettingsSnapshot | null = self
    ? {
        id: self.id,
        fullName: self.full_name,
        email: self.email,
        roleLabel: humanizeRole(self.role),
      }
    : null;

  const adm = adminRow as { full_name: string | null; email: string | null } | null;
  const primaryAdmin: PrimaryAdminSnapshot | null = adm
    ? { fullName: adm.full_name, email: adm.email }
    : null;

  const eventAccess: EventAccessSnapshot = {
    eventId: context.eventId,
  };

  return {
    company,
    license,
    sessionUser,
    primaryAdmin,
    eventAccess,
  };
}

export type ExhibitorSettingsSnapshot = Awaited<ReturnType<typeof getExhibitorSettingsSnapshot>>;
