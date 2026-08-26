import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Platform Core admin client.
 *
 * Holds the service-role key, which bypasses RLS and can mint/modify identities.
 * Three things keep it off the client:
 *
 *   1. `import "server-only"` — a build-time error if this module ever reaches a
 *      client bundle, rather than a runtime surprise in production.
 *   2. The key is read from `PLATFORM_CORE_SERVICE_ROLE_KEY`, which has no
 *      `NEXT_PUBLIC_` prefix, so Next.js will not inline it into client output.
 *   3. Sessions are disabled below: this client is never a user session, only an
 *      operator.
 */

let cached: SupabaseClient | null = null;

export function getPlatformAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.PLATFORM_CORE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Platform Core admin access is not configured. Set NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL and PLATFORM_CORE_SERVICE_ROLE_KEY (server-only).",
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
