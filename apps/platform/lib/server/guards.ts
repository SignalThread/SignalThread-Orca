import "server-only";

import { createPlatformServerClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "./registry";

export type ActingUser = { id: string; email: string | null };

/**
 * Resolve the caller's verified identity.
 *
 * `getUser()` verifies with the auth server rather than trusting cookie contents,
 * so a forged cookie cannot produce an acting user.
 */
export async function requireUser(): Promise<ActingUser> {
  const supabase = await createPlatformServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("NOT_AUTHENTICATED");
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Gate every admin mutation.
 *
 * Authority is read from the canonical `platform_admins` table, never from a JWT
 * claim: a claim is a cached copy that can lag the table by up to a token
 * lifetime, and an admin check must not run on stale data. The claim exists to
 * let the UI *show* admin affordances; this is what actually authorizes.
 */
export async function requirePlatformAdmin(): Promise<ActingUser> {
  const user = await requireUser();
  if (!(await isPlatformAdmin(user.id))) throw new Error("NOT_PLATFORM_ADMIN");
  return user;
}
