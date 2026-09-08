import type { CompanyTeamMemberStatus } from "@/lib/exhibitor/company-team-types";

export type CompanyScopedUserActionRow = {
  isPendingInvite: boolean;
  status: CompanyTeamMemberStatus;
};

export type CompanyScopedUserActionState = {
  canEdit: boolean;
  canDelete: boolean;
  canResendInvite: boolean;
};

export function isPlatformAdminCompanyScopedUserManager(role: string | null | undefined): boolean {
  return String(role ?? "").trim().toLowerCase() === "platform_admin";
}

export function getCompanyScopedUserActionState(row: CompanyScopedUserActionRow): CompanyScopedUserActionState {
  const isActive = row.status === "active";
  const isDisabled = row.status === "disabled";
  const isInvitedOrPending = row.status === "invited" || row.status === "expired" || row.isPendingInvite;

  return {
    canEdit: true,
    canDelete: true,
    canResendInvite: isInvitedOrPending && !isActive && !isDisabled
  };
}
