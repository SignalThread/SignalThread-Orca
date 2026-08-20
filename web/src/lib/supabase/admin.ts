import { createClient } from "@supabase/supabase-js";
import { requireAuthAuthorityConfig } from "@/src/lib/supabase/auth-authority";

/**
 * Service-role client for the *authentication authority* project.
 *
 * Used only for auth administration (today: `auth.admin.inviteUserByEmail`). It follows the
 * configured authority, so once Platform Core owns authentication this client targets
 * Platform Core rather than the legacy Orca project.
 *
 * This key must never be used as a product signing secret — see
 * `src/server/security/product-token-secrets.ts`.
 */

let adminClient: ReturnType<typeof createClient> | null = null;
let adminClientUrl: string | null = null;

export function getSupabaseAdminClient() {
  const authAuthority = requireAuthAuthorityConfig();
  // The service-role key must belong to the SAME project as the resolved authority.
  // Never pair a Platform Core URL with the legacy Orca key, or vice versa.
  const serviceRoleKey =
    authAuthority.source === "platform-core"
      ? process.env.PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY?.trim()
      : process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!serviceRoleKey) {
    throw new Error(
      authAuthority.source === "platform-core"
        ? "PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY is required when Platform Core is the authentication authority."
        : "SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required.",
    );
  }

  // Rebuild if the authority changed (e.g. env repointed between warm invocations).
  if (adminClient && adminClientUrl === authAuthority.url) return adminClient;

  adminClient = createClient(authAuthority.url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  adminClientUrl = authAuthority.url;

  return adminClient;
}
