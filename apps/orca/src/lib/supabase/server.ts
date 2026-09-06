import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireAuthAuthorityConfig } from "@/src/lib/supabase/auth-authority";
import { orcaAuthCookieOptions } from "@/src/lib/supabase/cookie-options";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  // Authentication authority only. Operational data never flows through this client.
  const authAuthority = requireAuthAuthorityConfig();

  return createServerClient(
    authAuthority.url,
    authAuthority.anonKey,
    {
      cookieOptions: orcaAuthCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll can fail in Server Components; middleware is the full solution.
          }
        },
      },
    },
  );
}
