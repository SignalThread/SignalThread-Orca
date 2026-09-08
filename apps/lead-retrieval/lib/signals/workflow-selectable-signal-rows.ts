export type WorkflowSelectableSignalScopeRow = {
  company_id: string | null;
  event_id: string | null;
  signal_scope?: string | null;
  owner_user_id?: string | null;
  is_active: boolean;
};

export function filterWorkflowSelectableSignalRowsForEvent<T extends WorkflowSelectableSignalScopeRow>(
  rows: readonly T[],
  options: { companyId: string; eventId: string; userId?: string | null; includeInactive?: boolean }
): T[] {
  const companyId = String(options.companyId ?? "").trim();
  const eventId = String(options.eventId ?? "").trim();
  const userId = String(options.userId ?? "").trim() || null;
  if (!companyId || !eventId) return [];
  return rows.filter((row) => {
    if (!options.includeInactive && !row.is_active) return false;
    if (row.company_id !== companyId) return false;

    const scope = String(row.signal_scope ?? "").trim().toLowerCase();
    if (scope === "company") {
      return !row.event_id;
    }
    if (scope === "event") {
      return row.event_id === eventId;
    }
    if (scope === "private") {
      return row.event_id === eventId && (!userId || row.owner_user_id === userId);
    }

    return !scope && row.event_id === eventId;
  });
}

export function findIneligibleWorkflowSignalIdsForEvent<T extends WorkflowSelectableSignalScopeRow & { id: string }>(
  rows: readonly T[],
  selectedSignalIds: readonly string[],
  options: { companyId: string; eventId: string; userId?: string | null }
): string[] {
  const eligibleIds = new Set(
    filterWorkflowSelectableSignalRowsForEvent(rows, options).map((row) => row.id)
  );
  return selectedSignalIds.filter((signalId) => !eligibleIds.has(signalId));
}
