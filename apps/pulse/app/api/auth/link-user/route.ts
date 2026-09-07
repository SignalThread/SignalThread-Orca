import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import {
  AuthIdentityConflictError,
  linkAuthenticatedUser,
  normalizeAuthEmail,
} from '@/lib/auth/link-user-identity'
import type { SupabaseClient } from '@supabase/supabase-js'
import { canUserAccessAccount } from '@/lib/auth/account-access'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isPreservableNext(next: string | null): boolean {
  return !!next && (next.startsWith('/app') || next.startsWith('/admin'))
}

async function linkUserAndGetRedirect(
  request: NextRequest,
  supabase: SupabaseClient
): Promise<{ redirectUrl: string } | { error: string }> {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    console.log('[link-user] No active session - getUser returned no user')
    return { error: 'No active session' }
  }
  const normalizedEmail = normalizeAuthEmail(user.email || '')
  if (!normalizedEmail) {
    return { error: 'Authenticated user is missing an email address' }
  }

  const superAdminEmails = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  const isSuperAdmin = superAdminEmails.includes(normalizedEmail)

  const dbUser = await linkAuthenticatedUser(prisma, {
    authUserId: user.id,
    email: normalizedEmail,
    isSuperAdmin,
  })

  const nextParam = request.nextUrl.searchParams.get('next')

  // SUPER_ADMIN: redirect to /admin (or preserve next if it starts with /app or /admin)
  if (dbUser.role === 'SUPER_ADMIN') {
    if (isPreservableNext(nextParam)) {
      return { redirectUrl: nextParam! }
    }
    return { redirectUrl: '/admin' }
  }

  // Regular user: must have account; never redirect to /admin
  const accountSlug = dbUser.account?.slug ?? null
  if (!accountSlug) {
    return { error: 'No account found' }
  }

  // Preserve next only if it starts with /app (never /admin for regular users)
  if (isPreservableNext(nextParam) && nextParam!.startsWith('/app')) {
    const url = new URL(nextParam!, 'http://dummy')
    const requestedAccountSlug = url.searchParams.get('account')
    const requestedAccount = requestedAccountSlug
      ? await prisma.account.findUnique({ where: { slug: requestedAccountSlug }, select: { id: true } })
      : null
    if (!requestedAccount || !await canUserAccessAccount(dbUser.id, requestedAccount.id)) {
      url.searchParams.set('account', accountSlug)
    }
    return { redirectUrl: url.pathname + url.search }
  }

  return { redirectUrl: `/app?account=${accountSlug}` }
}

function copyCookies(from: NextResponse, to: NextResponse): void {
  for (const c of from.cookies.getAll()) {
    to.cookies.set({ name: c.name, value: c.value, path: '/' })
  }
}

/**
 * GET /api/auth/link-user
 * Used after auth callback redirect; links user and redirects to next or default
 */
export async function GET(request: NextRequest) {
  const cookieResponse = NextResponse.next()
  const supabase = createRouteHandlerClient(request, cookieResponse)

  try {
    const result = await linkUserAndGetRedirect(request, supabase)
    if ('error' in result) {
      const final = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(result.error)}`, request.url))
      copyCookies(cookieResponse, final)
      return final
    }
    const final = NextResponse.redirect(new URL(result.redirectUrl, request.url))
    copyCookies(cookieResponse, final)
    return final
  } catch (error) {
    console.error('[GET /api/auth/link-user] Error:', error)
    const final = NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error instanceof Error ? error.message : 'Unknown error')}`, request.url)
    )
    copyCookies(cookieResponse, final)
    return final
  }
}

/**
 * POST /api/auth/link-user
 * Link authenticated Supabase user to Prisma User record
 * Used after invite flow to complete account linking
 */
export async function POST(request: NextRequest) {
  const cookieResponse = NextResponse.next()
  const supabase = createRouteHandlerClient(request, cookieResponse)

  try {
    const result = await linkUserAndGetRedirect(request, supabase)
    if ('error' in result) {
      const final = NextResponse.json(
        { success: false, error: result.error, message: 'User must be authenticated' },
        { status: 401 }
      )
      copyCookies(cookieResponse, final)
      return final
    }
    const final = NextResponse.json(
      { success: true, redirectUrl: result.redirectUrl, message: 'User linked successfully' },
      { status: 200 }
    )
    copyCookies(cookieResponse, final)
    return final
  } catch (error) {
    console.error('[POST /api/auth/link-user] Error:', error)
    if (error instanceof AuthIdentityConflictError) {
      const final = NextResponse.json(
        {
          success: false,
          error: 'Identity conflict',
          code: error.code,
          message: 'This sign-in identity conflicts with an existing user. Contact support.',
        },
        { status: 409 }
      )
      copyCookies(cookieResponse, final)
      return final
    }
    const final = NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
    copyCookies(cookieResponse, final)
    return final
  }
}
