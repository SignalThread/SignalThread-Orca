import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Canonical delivery boundary for web-account invitations.
 *
 * Supabase Auth owns delivery here so both initial invites and reissues use the
 * configured Invite user email template. Do not replace this with generated
 * links plus an application mailer: that creates a second invitation template.
 */
export async function sendAuthInvite(input: {
  supabase: ReturnType<typeof createAdminClient>;
  email: string;
  redirectTo: string;
  userMetadata: Record<string, unknown>;
}): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const { data, error } = await input.supabase.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: input.redirectTo,
    data: input.userMetadata
  });

  if (error || !data.user?.id) {
    return {
      ok: false,
      error: error?.message ?? "Could not send the Supabase invitation email."
    };
  }

  return { ok: true, userId: data.user.id };
}
