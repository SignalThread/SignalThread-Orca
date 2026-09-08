import { INVITE_USER_METADATA } from "@/lib/data/platform-admin";

export type CompanyMemberDbRole = "exhibitor_admin" | "viewer";

/**
 * Auth `data` payload for `inviteUserByEmail` for company-scoped invites (no event id required).
 */
export function buildCompanyMemberInviteAuthData(input: {
  companyId: string;
  dbRole: CompanyMemberDbRole;
  eventAccessMode: string;
  assignedEventIds: string[];
  fullName?: string | null;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    [INVITE_USER_METADATA.COMPANY_ID]: input.companyId,
    [INVITE_USER_METADATA.EXHIBITOR_COMPANY_ID]: input.companyId,
    [INVITE_USER_METADATA.ROLE]: input.dbRole,
    [INVITE_USER_METADATA.EVENT_ACCESS_MODE]: input.eventAccessMode,
    [INVITE_USER_METADATA.ASSIGNED_EVENT_IDS]: [...input.assignedEventIds]
  };
  if (input.fullName) {
    data.full_name = input.fullName;
  }
  return data;
}

/** @deprecated Use {@link buildCompanyMemberInviteAuthData} with dbRole exhibitor_admin. */
export function buildCompanyAdminInviteAuthData(input: {
  companyId: string;
  eventAccessMode: string;
  fullName?: string | null;
}): Record<string, unknown> {
  return buildCompanyMemberInviteAuthData({
    companyId: input.companyId,
    dbRole: "exhibitor_admin",
    eventAccessMode: input.eventAccessMode,
    assignedEventIds: [],
    fullName: input.fullName ?? null
  });
}

/** True when metadata is company-scoped only (no event id required for redemption). */
export function companyAdminInviteMetadataHasNoEventId(data: Record<string, unknown>): boolean {
  const key = INVITE_USER_METADATA.EVENT_ID;
  return !(key in data) || data[key] == null || String(data[key]).trim() === "";
}
