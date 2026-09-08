import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { sendAuthInvite } from "@/lib/server/invites/send-auth-invite";
import { findAuthUserByEmailAdmin } from "@/lib/server/invites/invite-redeem-auth-email";
import {
  resendAuthInviteWithDeps,
  type ResendAuthInviteResult,
  type ResendAuthInviteUser
} from "@/lib/server/invites/resend-auth-invite-core";

const INVITE_REDIRECT_TO =
  process.env.NEXT_PUBLIC_AUTH_CALLBACK_URL ?? "https://lr.signalthread.ai/auth/callback";

async function getAuthUserById(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<ResendAuthInviteUser | null> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data?.user) return null;
  return data.user as ResendAuthInviteUser;
}

async function reissueAuthInvite(
  supabase: ReturnType<typeof createAdminClient>,
  input: { email: string; userMetadata: Record<string, unknown> }
): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  return sendAuthInvite({
    supabase,
    email: input.email,
    redirectTo: INVITE_REDIRECT_TO,
    userMetadata: input.userMetadata
  });
}

export async function resendAuthInvite(input: {
  supabase: ReturnType<typeof createAdminClient>;
  userId?: string | null;
  email?: string | null;
  fullName?: string | null;
  inviteMetadata: Record<string, unknown>;
}): Promise<ResendAuthInviteResult> {
  const { supabase } = input;
  return resendAuthInviteWithDeps(
    {
      getAuthUserById: (userId) => getAuthUserById(supabase, userId),
      findAuthUserByEmail: async (email) => {
        const found = await findAuthUserByEmailAdmin(supabase, email);
        return found?.id ? getAuthUserById(supabase, found.id) : null;
      },
      updateAuthUserMetadata: async (userId, userMetadata) => {
        const { error } = await supabase.auth.admin.updateUserById(userId, { user_metadata: userMetadata });
        return error ? { ok: false, error: error.message ?? "Failed updating invite metadata." } : { ok: true };
      },
      issueAuthInvite: (invite) => reissueAuthInvite(supabase, invite)
    },
    input
  );
}
