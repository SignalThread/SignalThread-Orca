export type ResendAuthInviteResult =
  | { ok: true; userId: string; email: string }
  | {
      ok: false;
      code: "already_active" | "no_valid_invite_target" | "missing_email" | "auth_update_failed" | "invite_failed";
      error: string;
    };

export type ResendAuthInviteUser = {
  id: string;
  email?: string | null;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export type ResendAuthInviteDeps = {
  getAuthUserById: (userId: string) => Promise<ResendAuthInviteUser | null>;
  findAuthUserByEmail: (email: string) => Promise<ResendAuthInviteUser | null>;
  updateAuthUserMetadata: (userId: string, userMetadata: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: string }>;
  issueAuthInvite: (input: { email: string; userMetadata: Record<string, unknown> }) => Promise<
    | { ok: true; userId: string }
    | { ok: false; error: string }
  >;
};

export type ResendAuthInviteInput = {
  userId?: string | null;
  email?: string | null;
  fullName?: string | null;
  inviteMetadata: Record<string, unknown>;
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function cleanMetadata(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export async function resendAuthInviteWithDeps(
  deps: ResendAuthInviteDeps,
  input: ResendAuthInviteInput
): Promise<ResendAuthInviteResult> {
  const userId = String(input.userId ?? "").trim();
  const requestedEmail = normalizeEmail(input.email);
  if (!userId && !requestedEmail) {
    return {
      ok: false,
      code: "no_valid_invite_target",
      error: "No valid invite target was provided."
    };
  }

  let authUser = userId ? await deps.getAuthUserById(userId) : null;
  if (!authUser && requestedEmail) {
    authUser = await deps.findAuthUserByEmail(requestedEmail);
  }

  if (!authUser?.id) {
    return {
      ok: false,
      code: "no_valid_invite_target",
      error: "No existing auth user was found for this invite."
    };
  }

  if (authUser.last_sign_in_at) {
    return {
      ok: false,
      code: "already_active",
      error: "User is already active. Ask them to sign in or reset their password instead."
    };
  }

  const email = normalizeEmail(authUser.email) || requestedEmail;
  if (!email || !email.includes("@")) {
    return {
      ok: false,
      code: "missing_email",
      error: "Invite target does not have a valid email address."
    };
  }

  const fullName = String(input.fullName ?? "").trim();
  const existingMetadata = cleanMetadata(authUser.user_metadata ?? {});
  const nextMetadata = cleanMetadata({
    ...existingMetadata,
    ...input.inviteMetadata,
    ...(fullName ? { full_name: fullName } : {})
  });

  const update = await deps.updateAuthUserMetadata(authUser.id, nextMetadata);
  if (!update.ok) {
    return {
      ok: false,
      code: "auth_update_failed",
      error: update.error
    };
  }

  const invite = await deps.issueAuthInvite({ email, userMetadata: nextMetadata });
  if (!invite.ok) {
    return {
      ok: false,
      code: "invite_failed",
      error: invite.error
    };
  }

  // Auth must reissue the existing pending invite, never replace it with a different
  // user. This keeps the public user, event memberships, seats, and invite scope intact.
  if (invite.userId !== authUser.id) {
    return {
      ok: false,
      code: "invite_failed",
      error: "Could not reissue the existing invitation safely."
    };
  }

  return { ok: true, userId: authUser.id, email };
}
