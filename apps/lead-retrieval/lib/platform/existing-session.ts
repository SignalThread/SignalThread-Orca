import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * Which Lead Retrieval Auth user, if any, the arriving browser already holds a
 * session for. Read-only by construction: the cookie adapter can read but never
 * writes, so this can never emit or refresh an auth cookie. It exists so that a
 * handoff is never allowed to silently *replace* a different user's session --
 * the browser must sign out first. The value is used only to refuse, never to
 * grant: a forged cookie can at most cause a refusal.
 */
export async function readExistingLeadRetrievalSessionUserId(request: NextRequest): Promise<string | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // Deliberately inert: this reader must never write a cookie.
      }
    }
  });

  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
