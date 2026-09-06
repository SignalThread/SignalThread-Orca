import { createBrowserClient } from "@supabase/ssr";
import { requirePlatformAuthConfig } from "./config";
import { platformAuthCookieOptions } from "./cookie-options";

/** Browser-side Platform Core client. Auth only — no product data flows through it. */
export function createPlatformBrowserClient() {
  const { url, anonKey } = requirePlatformAuthConfig();
  return createBrowserClient(url, anonKey, { cookieOptions: platformAuthCookieOptions() });
}
