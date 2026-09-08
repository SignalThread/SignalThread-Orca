"use server";

import { revalidatePath } from "next/cache";
import {
  inviteCompanyMemberAction as inviteCompanyMemberImpl,
  cancelCompanyAppUserInviteAction as cancelCompanyAppUserInviteImpl,
  deleteCompanyTeamUserAction as deleteCompanyTeamUserImpl,
  resendCompanyAppUserInviteAction as resendCompanyAppUserInviteImpl,
  resendCompanyMemberInviteAction as resendCompanyMemberInviteImpl,
  revokeCompanyMemberInviteAction as revokeCompanyMemberInviteImpl,
  setCompanyMemberDisabledAction as setCompanyMemberDisabledImpl,
  updateCompanyMemberAccessAction as updateCompanyMemberAccessImpl
} from "@/lib/server/company-team-management";

/**
 * File-local only — must mirror `CompanyTeamActionState` in `lib/exhibitor/company-team-types.ts`
 * (do not import that symbol here: `"use server"` bundlers can break on it).
 */
type CompanyTeamActionState = { ok: true; message?: string; appInviteCodes?: Array<{ eventId: string; eventName: string; code: string }> } | { ok: false; error: string };

async function wrapRevalidate(result: CompanyTeamActionState): Promise<CompanyTeamActionState> {
  if (result.ok) {
    revalidatePath("/app/settings");
  }
  return result;
}

export async function inviteCompanyMemberAction(
  prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  return wrapRevalidate(await inviteCompanyMemberImpl(prev, formData));
}

export async function updateCompanyMemberAccessAction(
  prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  return wrapRevalidate(await updateCompanyMemberAccessImpl(prev, formData));
}

export async function resendCompanyMemberInviteAction(
  prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  return wrapRevalidate(await resendCompanyMemberInviteImpl(prev, formData));
}

export async function revokeCompanyMemberInviteAction(
  prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  return wrapRevalidate(await revokeCompanyMemberInviteImpl(prev, formData));
}

export async function deleteCompanyTeamUserAction(
  prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  return wrapRevalidate(await deleteCompanyTeamUserImpl(prev, formData));
}

export async function setCompanyMemberDisabledAction(
  prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  return wrapRevalidate(await setCompanyMemberDisabledImpl(prev, formData));
}

export async function resendCompanyAppUserInviteAction(
  prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  return wrapRevalidate(await resendCompanyAppUserInviteImpl(prev, formData));
}

export async function cancelCompanyAppUserInviteAction(
  prev: CompanyTeamActionState | null,
  formData: FormData
): Promise<CompanyTeamActionState> {
  return wrapRevalidate(await cancelCompanyAppUserInviteImpl(prev, formData));
}
