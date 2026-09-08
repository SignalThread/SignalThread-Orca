import type { EventAccessMode } from "@/lib/access/event-access-mode";
import type { CompanyTeamMemberStatus } from "@/lib/exhibitor/company-team-types";

/** Table column: tight copy derived from canonical mode + assignment count (no extra resolver logic). */
export function shortCompanyTeamEventAccessLabel(input: {
  eventAccessMode: EventAccessMode;
  assignedEventCount: number;
}): string {
  if (input.eventAccessMode === "all_company_events") return "All events";
  const n = input.assignedEventCount;
  if (n === 0) return "No access";
  return n === 1 ? "1 event" : `${n} events`;
}

export type CompanyTeamStatusDisplay = "Active" | "Invited" | "Expired" | "Disabled";

/**
 * Status column shows Active | Invited | Expired | Disabled. Distinct "Expired"
 * label is required so admins can see App-user invites whose codes have lapsed
 * (vs. codes still redeemable).
 */
export function companyTeamTableStatusLabel(status: CompanyTeamMemberStatus): CompanyTeamStatusDisplay {
  if (status === "disabled") return "Disabled";
  if (status === "invited") return "Invited";
  if (status === "expired") return "Expired";
  return "Active";
}

export type CompanyTeamRowMenuFlags = {
  showEdit: boolean;
  showResendInvite: boolean;
  showRevokeInvite: boolean;
  showCancelInvite: boolean;
  showDisable: boolean;
  disableIsReEnable: boolean;
  showDelete: boolean;
};

/**
 * Row-action visibility depends on whether this is a real user row or a pending
 * App-user invite group (synthetic row). Pending invite rows only support
 * Resend / Cancel — they have no `users.id` and nothing to edit or delete.
 */
export function companyTeamRowMenuFlags(input: {
  status: CompanyTeamMemberStatus;
  isPendingInvite?: boolean;
}): CompanyTeamRowMenuFlags {
  if (input.isPendingInvite) {
    return {
      showEdit: false,
      showResendInvite: true,
      showRevokeInvite: false,
      showCancelInvite: true,
      showDisable: false,
      disableIsReEnable: false,
      showDelete: false
    };
  }

  const pending = input.status === "invited" || input.status === "expired";
  return {
    showEdit: true,
    showResendInvite: pending,
    showRevokeInvite: pending,
    showCancelInvite: false,
    showDisable: input.status === "active" || input.status === "disabled",
    disableIsReEnable: input.status === "disabled",
    showDelete: true
  };
}
