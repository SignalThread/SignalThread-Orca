import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requirePlatformAuthConfig } from "./config";

/** Server-side Platform Core client bound to the request's cookie jar. */
export async function createPlatformServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = requirePlatformAuthConfig();

  return createServerClient(url, anonKey, {
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
          // Server Components cannot set cookies; middleware performs the refresh.
        }
      },
    },
  });
}
