import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { assertSupabaseEnv, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import type { Database } from "@/types/database";

export type SupabaseCookieMutation = {
  name: string;
  value: string;
  options?: CookieOptions;
};

/** Preserve middleware-added headers while forwarding the latest request cookie view. */
export function buildRequestHeadersWithCurrentCookies(
  request: NextRequest,
  baseHeaders: Headers = request.headers
) {
  const headers = new Headers(baseHeaders);
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) headers.set("cookie", cookieHeader);
  else headers.delete("cookie");
  return headers;
}

export function createSupabaseRouteCookieBridge(request: NextRequest) {
  const authResponse = NextResponse.next();

  const setAll = (cookiesToSet: SupabaseCookieMutation[]) => {
    for (const { name, value, options } of cookiesToSet) {
      if (value) {
        request.cookies.set({ name, value, ...options });
        authResponse.cookies.set({ name, value, ...options });
      } else {
        request.cookies.delete(name);
        authResponse.cookies.delete(name);
      }
    }
  };

  const withAuthCookies = <T extends NextResponse>(target: T): T => {
    for (const cookie of authResponse.cookies.getAll()) {
      target.cookies.set(cookie);
    }
    return target;
  };

  return { setAll, withAuthCookies };
}

/**
 * Route-handler equivalent of the proven account-context auth handoff:
 * one request-scoped Supabase client owns both the inbound cookie view and
 * every Set-Cookie mutation that must be attached to the eventual response.
 */
export function createSupabaseRouteAuth(request: NextRequest) {
  assertSupabaseEnv();
  const cookieBridge = createSupabaseRouteCookieBridge(request);

  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll: cookieBridge.setAll
    }
  });

  return { supabase, withAuthCookies: cookieBridge.withAuthCookies };
}
