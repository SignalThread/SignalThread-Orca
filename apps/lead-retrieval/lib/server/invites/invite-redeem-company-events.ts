import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

function dedupeIds(values: ReadonlyArray<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const v = String(raw ?? "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * All `events.id` rows whose `company_id` is the exhibitor company (direct-buyer catalog).
 */
export async function listEventIdsForExhibitorCompany(
  admin: ReturnType<typeof createAdminClient>,
  exhibitorCompanyId: string
): Promise<string[]> {
  const { data, error } = await (admin as any)
    .from("events")
    .select("id")
    .eq("company_id", exhibitorCompanyId);

  if (error) {
    throw new Error(error.message ?? "Failed listing company events.");
  }

  const ids = dedupeIds((data ?? []).map((r: { id: string }) => r.id));
  return ids;
}
