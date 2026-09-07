/**
 * Auth callback handler for Supabase.
 * - Case A: OAuth / PKCE flow with ?code= → exchangeCodeForSession
 * - Case B: Invite / magic link with ?token_hash=&type= → verifyOtp
 *
 * For invite links to work, customize the Supabase "Invite user" email template:
 * Use: <a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite">Accept the invite</a>
 * (Instead of the default {{ .ConfirmationURL }} which goes to Supabase and puts session in fragments.)
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const tokenHash = requestUrl.searchParams.get('token_hash') ?? requestUrl.searchParams.get('token')
  const type = requestUrl.searchParams.get('type')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')

  // DEBUG: Set AUTH_CALLBACK_DEBUG=1 to log (no secrets, just presence)
  if (process.env.AUTH_CALLBACK_DEBUG === '1') {
    console.log('[auth/callback] DEBUG path:', requestUrl.pathname)
    console.log('[auth/callback] DEBUG params:', { hasCode: !!code, hasTokenHash: !!tokenHash, type })
  }

  // Handle OAuth errors
  if (error) {
    console.error('[auth/callback] OAuth error:', error, errorDescription)
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(errorDescription || error)}`, request.url)
    )
  }

  const nextParam = requestUrl.searchParams.get('next') || '/app'
  const linkUrl = new URL('/api/auth/link-user', request.url)
  linkUrl.searchParams.set('next', nextParam)

  const response = NextResponse.redirect(linkUrl)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  try {
    // Case A: OAuth / magic link with code (PKCE flow)
    if (code) {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

      if (exchangeError) {
        console.error('[auth/callback] Code exchange error:', exchangeError)
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(exchangeError.message)}`, request.url)
        )
      }

      if (!data.session) {
        console.error('[auth/callback] No session from code exchange')
        return NextResponse.redirect(
          new URL('/login?error=Failed to establish session', request.url)
        )
      }

      if (process.env.AUTH_CALLBACK_DEBUG === '1') {
        console.log('[auth/callback] DEBUG flow=pkce session established')
      }
      return response
    }

    // Case B: Invite / magic link with token_hash (verifyOtp flow)
    if (tokenHash && type) {
      const validTypes = ['invite', 'email', 'recovery', 'magiclink', 'signup']
      const otpType = validTypes.includes(type) ? type : 'email'

      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType as 'invite' | 'email' | 'recovery' | 'magiclink' | 'signup',
      })

      if (verifyError) {
        console.error('[auth/callback] verifyOtp error:', verifyError)
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(verifyError.message)}`, request.url)
        )
      }

      if (!data.session) {
        console.error('[auth/callback] No session from verifyOtp')
        return NextResponse.redirect(
          new URL('/login?error=Failed to establish session', request.url)
        )
      }

      if (process.env.AUTH_CALLBACK_DEBUG === '1') {
        console.log('[auth/callback] DEBUG flow=invite session established')
      }
      return response
    }

    // No code or token_hash
    console.error('[auth/callback] No code or token_hash provided')
    return NextResponse.redirect(
      new URL('/login?error=No authentication code provided', request.url)
    )
  } catch (err) {
    console.error('[auth/callback] Unexpected error:', err)
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(err instanceof Error ? err.message : 'Authentication failed')}`,
        request.url
      )
    )
  }
}
