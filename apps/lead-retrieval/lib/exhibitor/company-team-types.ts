import type { EventAccessMode } from "@/lib/access/event-access-mode";
import type { CompanyMemberDbRole } from "@/lib/exhibitor/company-admin-invite-metadata";
import type { CompanyTeamEventAccessSummary } from "@/lib/exhibitor/company-team-access-present";

/** Mobile app / booth invite codes returned after a successful “App user” company invite. */
export type CompanyTeamAppInviteCode = {
  eventId: string;
  eventName: string;
  code: string;
};

/** Shared server-action result shape for company team mutations (client + server safe). */
export type CompanyTeamActionOk = {
  ok: true;
  message?: string;
  /** Present when invite created `invite_codes` rows for the Expo/mobile redeem flow (not web Supabase email). */
  appInviteCodes?: CompanyTeamAppInviteCode[];
};
export type CompanyTeamActionErr = { ok: false; error: string };
export type CompanyTeamActionState = CompanyTeamActionOk | CompanyTeamActionErr;

export type CompanyTeamMemberStatus = "active" | "invited" | "expired" | "disabled";

export type CompanyTeamMemberRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  companyRole: CompanyMemberDbRole;
  eventAccessMode: EventAccessMode;
  status: CompanyTeamMemberStatus;
  lastSignInAt: string | null;
  eventSummary: CompanyTeamEventAccessSummary;
  assignedEventDetails: { id: string; name: string }[];
  /**
   * True when the row represents a pending App-user `invite_codes` group, not a
   * real `public.users` row. No auth/`users` id exists; `id` is a synthetic
   * `pending:<email>` key. Pending rows only allow Resend / Cancel actions.
   */
  isPendingInvite?: boolean;
};
