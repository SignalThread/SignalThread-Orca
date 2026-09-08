"use server";

import { revalidatePath } from "next/cache";
import { resendCompanyMemberInviteAction as resendCompanyMemberInviteImpl } from "@/lib/server/company-team-management";
import { generateEmergencyLoginCodeForUser } from "@/lib/server/emergency-login-code";
import type { EmergencyLoginCodeResult } from "@/lib/server/emergency-login-code-core";

type CompanyTeamActionState = { ok: true; message?: string } | { ok: false; error: string };

export async function resendExhibitorUserInviteAction(formData: FormData): Promise<CompanyTeamActionState> {
  const result = await resendCompanyMemberInviteImpl(null, formData);
  if (result.ok) {
    revalidatePath("/exhibitor/users");
  }
  return result;
}

export async function generateEmergencyLoginCodeAction(formData: FormData): Promise<EmergencyLoginCodeResult> {
  const targetUserId = String(formData.get("targetUserId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  return generateEmergencyLoginCodeForUser({ targetUserId, reason });
}
