/**
 * Legacy company summary adapter. Dashboard event metrics use the canonical
 * event-scoped aggregate; callers here must supply an already-resolved business day.
 *
 * Pure core (no server-only imports): the supabase client is injected for
 * scoping and testability.
 */

export type ExhibitorAccountSummary = {
  totalLeads: number;
  hotLeads: number;
  followUps: number;
  activeLicenseCount: number;
};

/**
 * Discriminated so callers can distinguish "no data" from "query failed" —
 * a failed count must never render as a fabricated zero.
 */
export type ExhibitorAccountSummaryResult =
  | { ok: true; summary: ExhibitorAccountSummary }
  | { ok: false };

type SupabaseCountClientLike = { from: (table: string) => any };
type CountResultLike = { count: number | null; error: unknown | null };

export async function getExhibitorAccountSummaryForCompany(
  supabase: SupabaseCountClientLike,
  companyId: string,
  todayYmd: string
): Promise<ExhibitorAccountSummaryResult> {
  const scopedCompanyId = String(companyId ?? "").trim();
  if (!scopedCompanyId) {
    return { ok: false };
  }
  const today = todayYmd;

  const [totalLeads, hotLeads, followUps, activeLicenses] = (await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", scopedCompanyId),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", scopedCompanyId)
      .eq("temperature", "hot"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("company_id", scopedCompanyId)
      .neq("status", "closed")
      .is("follow_up_completed_at", null)
      .not("follow_up_date", "is", null)
      .lte("follow_up_date", today),
    supabase
      .from("licenses")
      .select("id", { count: "exact", head: true })
      .eq("exhibitor_company_id", scopedCompanyId)
      .eq("status", "active")
  ])) as CountResultLike[];

  if (totalLeads.error || hotLeads.error || followUps.error || activeLicenses.error) {
    return { ok: false };
  }

  return {
    ok: true,
    summary: {
      totalLeads: totalLeads.count ?? 0,
      hotLeads: hotLeads.count ?? 0,
      followUps: followUps.count ?? 0,
      activeLicenseCount: activeLicenses.count ?? 0
    }
  };
}
