import { INVITE_USER_METADATA } from "@/lib/data/platform-admin";

export type InvitedMembershipActivationScope = {
  exhibitorCompanyId: string;
  eventIds: string[];
};

export type InvitedMembershipActivationCandidate = {
  id: string;
  event_id: string | null;
  exhibitor_company_id: string | null;
  status?: string | null;
  permissions?: unknown;
  created_at?: string | null;
};

function normalizeInvitedMembershipActivationScope(
  scope: InvitedMembershipActivationScope | null | undefined
): InvitedMembershipActivationScope | null {
  const exhibitorCompanyId = String(scope?.exhibitorCompanyId ?? "").trim();
  const eventIds = [...new Set((scope?.eventIds ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (!exhibitorCompanyId || eventIds.length === 0) {
    return null;
  }
  return { exhibitorCompanyId, eventIds };
}

export function resolveInviteActivationScopeFromAuthMetadata(
  meta: Record<string, unknown> | null | undefined
): InvitedMembershipActivationScope | null {
  const normalizedMeta = meta ?? {};
  const exhibitorCompanyId = String(
    normalizedMeta[INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID] ??
      normalizedMeta[INVITE_USER_METADATA.COMPANY_ID] ??
      ""
  ).trim();
  const eventId = String(normalizedMeta[INVITE_USER_METADATA.EVENT_ID] ?? "").trim();
  const assignedEventIdsRaw = Array.isArray(normalizedMeta[INVITE_USER_METADATA.ASSIGNED_EVENT_IDS])
    ? (normalizedMeta[INVITE_USER_METADATA.ASSIGNED_EVENT_IDS] as unknown[])
    : [];
  const eventIds = [...new Set([eventId, ...assignedEventIdsRaw.map((id) => String(id ?? "").trim())].filter(Boolean))];

  return normalizeInvitedMembershipActivationScope({ exhibitorCompanyId, eventIds });
}

export function filterInvitedMembershipRowsForActivation<T extends InvitedMembershipActivationCandidate>(
  rows: T[],
  scope: InvitedMembershipActivationScope | null | undefined
): T[] {
  const normalized = normalizeInvitedMembershipActivationScope(scope);
  if (!normalized) {
    return [...rows];
  }

  const eventIds = new Set(normalized.eventIds);
  return rows.filter((row) => {
    const eventId = String(row.event_id ?? "").trim();
    const exhibitorCompanyId = String(row.exhibitor_company_id ?? "").trim();
    return exhibitorCompanyId === normalized.exhibitorCompanyId && eventIds.has(eventId);
  });
}
