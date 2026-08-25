import { createBrowserClient } from "@supabase/ssr";
import { requireAuthAuthorityConfig } from "@/src/lib/supabase/auth-authority";

export function createBrowserSupabaseClient() {
  // Authentication authority only. The browser never queries product data through Supabase.
  const authAuthority = requireAuthAuthorityConfig();
  return createBrowserClient(authAuthority.url, authAuthority.anonKey);
}
