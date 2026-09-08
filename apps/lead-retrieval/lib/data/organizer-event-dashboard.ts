/**
 * Pure helpers for organizer event dashboard metrics (unit-tested).
 * Sent campaigns align with exhibitor campaigns list: `campaigns.status === "sent"`.
 */

export type CampaignStatusRow = {
  company_id: string | null;
  status: string;
};

/**
 * Counts campaigns that have completed send for exhibitor companies in the event.
 * Excludes drafts, scheduled, sending, failed (only `sent`).
 */
export function countSentCampaignsForExhibitorCompanies(
  campaigns: CampaignStatusRow[],
  exhibitorCompanyIds: Set<string>
): number {
  let n = 0;
  for (const row of campaigns) {
    const companyId = row.company_id;
    if (!companyId || !exhibitorCompanyIds.has(companyId)) continue;
    if (String(row.status ?? "").trim().toLowerCase() !== "sent") continue;
    n += 1;
  }
  return n;
}

export type ExhibitorAttentionInput = {
  exhibitorId: string;
  companyId: string;
  name: string;
  leadCount: number;
  activeUserCount: number;
  pendingInviteCount: number;
  seatsTotal: number;
  seatsUsed: number;
};

export type AttentionIssueKind = "no_leads" | "no_active_users" | "pending_invites" | "low_activation";

export type AttentionIssue = {
  kind: AttentionIssueKind;
  /** Present when `kind === "pending_invites"` */
  inviteCount?: number;
};

export type ExhibitorAttentionRow = ExhibitorAttentionInput & {
  issues: AttentionIssue[];
  urgencyScore: number;
};

/** Higher = needs action sooner (deterministic, unit-tested). */
export function attentionUrgencyScore(issues: AttentionIssue[]): number {
  let s = 0;
  for (const issue of issues) {
    switch (issue.kind) {
      case "no_active_users":
        s += 40;
        break;
      case "no_leads":
        s += 25;
        break;
      case "low_activation":
        s += 15;
        break;
      case "pending_invites": {
        const n = Math.max(1, issue.inviteCount ?? 1);
        s += Math.min(12 * n, 28);
        break;
      }
      default:
        break;
    }
  }
  return s;
}

/**
 * Surfaces exhibitors that likely need organizer follow-up.
 * Heuristic: no leads, no active users while seats exist, pending invites, or low seat utilization.
 */
export function buildExhibitorsNeedingAttention(rows: ExhibitorAttentionInput[]): ExhibitorAttentionRow[] {
  const out: ExhibitorAttentionRow[] = [];
  for (const row of rows) {
    const issues: AttentionIssue[] = [];
    if (row.leadCount === 0) {
      issues.push({ kind: "no_leads" });
    }
    if (row.seatsTotal > 0 && row.activeUserCount === 0) {
      issues.push({ kind: "no_active_users" });
    }
    if (row.pendingInviteCount > 0) {
      issues.push({ kind: "pending_invites", inviteCount: row.pendingInviteCount });
    }
    if (row.seatsTotal >= 2 && row.activeUserCount > 0) {
      const ratio = row.seatsUsed / row.seatsTotal;
      if (ratio < 0.25) {
        issues.push({ kind: "low_activation" });
      }
    }
    if (issues.length === 0) continue;
    const urgencyScore = attentionUrgencyScore(issues);
    out.push({ ...row, issues, urgencyScore });
  }
  out.sort((a, b) => {
    if (b.urgencyScore !== a.urgencyScore) return b.urgencyScore - a.urgencyScore;
    if (a.leadCount !== b.leadCount) return a.leadCount - b.leadCount;
    return a.name.localeCompare(b.name);
  });
  return out;
}

/** Licensed exhibitors = event exhibitors with at least one license row for that company. */
export function countLicensedExhibitors(
  exhibitorCompanyIds: string[],
  licensedCompanyIds: Set<string>
): number {
  let n = 0;
  for (const id of exhibitorCompanyIds) {
    if (licensedCompanyIds.has(id)) n += 1;
  }
  return n;
}
