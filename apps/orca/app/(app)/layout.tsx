import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { ensureProvisionedUserAndContext } from "@/lib/request-user";

/**
 * Guard for the `(app)` route group.
 *
 * This used to run its own auth check against `NEXT_PUBLIC_SUPABASE_*` using
 * `getSession()`, which only reads the session cookie and does not verify it with the auth
 * server. That was a second, weaker copy of a rule that belongs in one place.
 *
 * It now delegates to the canonical resolver, so it inherits the authentication-authority
 * posture, verified identity, the Platform Core entitlement gate, and Orca's own
 * organization context — all decided identically to every other entry point.
 */
export default async function ProtectedAppLayout({ children }: { children: ReactNode }) {
  const authContext = await ensureProvisionedUserAndContext();

  if (authContext.status === "UNAUTHENTICATED") {
    redirect("/login");
  }

  return <>{children}</>;
}
