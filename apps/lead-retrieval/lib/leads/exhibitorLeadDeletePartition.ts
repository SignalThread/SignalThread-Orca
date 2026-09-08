type LeadScopeRow = {
  id: string;
  company_id: string;
  event_id?: string | null;
};

/** Keeps large bulk mutations below practical PostgREST request-size limits. */
export function chunkLeadIds<T>(ids: readonly T[], size = 500): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < ids.length; start += size) chunks.push([...ids.slice(start, start + size)]);
  return chunks;
}

/**
 * Pure helper: given fetched `public.leads` rows for requested ids, partition by exhibitor company scope.
 */
export function partitionLeadIdsForExhibitorDelete(
  requestedIds: string[],
  leadRows: LeadScopeRow[],
  companyId: string,
  eventId?: string
): {
  deletable: string[];
  missing: string[];
  forbidden: { leadId: string; reason: string }[];
} {
  const scoped = String(companyId).trim();
  const scopedEventId = String(eventId ?? "").trim();
  const byId = new Map(leadRows.map((r) => [r.id, r]));
  const deletable: string[] = [];
  const missing: string[] = [];
  const forbidden: { leadId: string; reason: string }[] = [];

  for (const id of requestedIds) {
    const row = byId.get(id);
    if (!row) {
      missing.push(id);
      continue;
    }
    if (String(row.company_id) !== scoped) {
      forbidden.push({ leadId: id, reason: "Lead belongs to another company." });
      continue;
    }
    if (scopedEventId && String(row.event_id ?? "") !== scopedEventId) {
      forbidden.push({ leadId: id, reason: "Lead belongs to another event." });
      continue;
    }
    deletable.push(id);
  }

  return { deletable, missing, forbidden };
}
