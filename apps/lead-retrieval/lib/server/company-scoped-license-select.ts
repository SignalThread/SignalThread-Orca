import "server-only";

const LICENSE_SCOPE_COMPANY = "company" as const;

/**
 * Latest company-scoped license for an exhibitor company (deterministic when multiple exist).
 *
 * PostgREST `.maybeSingle()` returns **PGRST116** ("Cannot coerce the result to a single JSON object")
 * when more than one row matches — even with `.maybeSingle()`. Always use `order` + `limit(1)`.
 *
 * Parameter is intentionally untyped: service-role, SSR, and middleware clients use different
 * `SupabaseClient` type parameters.
 */
export async function selectLatestCompanyScopedLicense(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  exhibitorCompanyId: string,
  selectColumns: string
) {
  const cid = String(exhibitorCompanyId ?? "").trim();
  if (!cid) {
    return { data: null, error: null } as {
      data: null;
      error: null;
    };
  }
  return supabase
    .from("licenses")
    .select(selectColumns)
    .eq("exhibitor_company_id", cid)
    .eq("scope", LICENSE_SCOPE_COMPANY)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}
