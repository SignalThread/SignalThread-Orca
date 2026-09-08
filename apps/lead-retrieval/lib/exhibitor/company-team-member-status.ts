import type { CompanyTeamMemberStatus } from "@/lib/exhibitor/company-team-types";

export const COMPANY_TEAM_INVITE_STALE_DAYS = 14;

/**
 * Derives UI status for company settings team table from Supabase Auth fields.
 */
export function deriveCompanyTeamMemberStatus(
  input: {
    bannedUntil: string | null | undefined;
    lastSignInAt: string | null | undefined;
    createdAtAuth: string | null | undefined;
  },
  opts?: { nowMs?: number; staleDays?: number }
): CompanyTeamMemberStatus {
  const nowMs = opts?.nowMs ?? Date.now();
  const staleDays = opts?.staleDays ?? COMPANY_TEAM_INVITE_STALE_DAYS;
  const ban = input.bannedUntil ? new Date(input.bannedUntil).getTime() : NaN;
  if (!Number.isNaN(ban) && ban > nowMs) {
    return "disabled";
  }
  if (input.lastSignInAt) {
    return "active";
  }
  const created = input.createdAtAuth ? new Date(input.createdAtAuth).getTime() : NaN;
  if (!Number.isNaN(created)) {
    const days = (nowMs - created) / 86400000;
    if (days > staleDays) {
      return "expired";
    }
  }
  return "invited";
}
