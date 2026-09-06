import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'

/**
 * Which Pulse Auth user, if any, the arriving browser already holds a session for.
 *
 * Read-only by construction: the cookie adapter can read but never writes, so
 * this can never emit or refresh an auth cookie. It exists so that a handoff is
 * never allowed to silently *replace* a different user's session -- the browser
 * must sign out first. The value is used only to refuse, never to grant: a
 * forged cookie can at most cause a refusal.
 */
export async function readExistingPulseSessionUserId(request: NextRequest): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value
      },
      set() {
        // Deliberately inert: this reader must never write a cookie.
      },
      remove() {
        // Deliberately inert.
      },
    },
  })

  try {
    const { data } = await supabase.auth.getSession()
    return data.session?.user?.id ?? null
  } catch {
    return null
  }
}
