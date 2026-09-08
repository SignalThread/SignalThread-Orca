import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import {
  emailMatchesExactCaseInsensitive,
  normalizeRedeemEmail
} from "@/lib/server/invites/invite-redeem-guards";

/**
 * Email for matching an invite to the signed-in user.
 * Prefer Supabase Auth (`auth.users`) so redemption works when `public.users` is missing.
 */
export async function getAuthenticatedUserEmailForRedeem(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    throw new Error(error.message ?? "Failed loading auth user.");
  }

  const fromAuth = normalizeRedeemEmail(data.user?.email ?? "");
  if (fromAuth) return fromAuth;

  const { data: row, error: rowError } = await (admin as any)
    .from("users")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  if (rowError) {
    throw new Error(rowError.message ?? "Failed loading user profile email.");
  }

  const fromProfile = normalizeRedeemEmail(row?.email ?? "");
  return fromProfile || null;
}

/**
 * Paginated auth user lookup by email (GoTrue has no direct get-by-email in this client).
 */
export async function findAuthUserByEmailAdmin(
  admin: ReturnType<typeof createAdminClient>,
  email: string
): Promise<{ id: string; email?: string | undefined } | null> {
  const want = normalizeRedeemEmail(email);
  let page = 1;
  const perPage = 1000;
  const maxPages = 50;

  while (page <= maxPages) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(error.message ?? "Failed loading auth users.");
    }

    const users = data?.users ?? [];
    const matchedUser = users.find((user) => emailMatchesExactCaseInsensitive(user.email ?? "", want));
    if (matchedUser?.id) {
      return { id: matchedUser.id, email: matchedUser.email };
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }

  return null;
}
