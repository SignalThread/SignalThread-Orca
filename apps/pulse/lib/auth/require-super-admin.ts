import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

/**
 * Server-only: platform admin UI under /admin. Redirects unauthenticated or non–SUPER_ADMIN users.
 */
export async function requireSuperAdminForPage(): Promise<void> {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=' + encodeURIComponent('/admin'))
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  })

  if (!dbUser || dbUser.role !== 'SUPER_ADMIN') {
    redirect('/app')
  }
}

/**
 * Route handlers under /api/admin/*. Returns 401 if not authenticated, 403 if not SUPER_ADMIN.
 */
export async function requireSuperAdminForApi(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
          message: 'You must be logged in to access this endpoint',
        },
        { status: 401 }
      ),
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true },
  })

  if (!dbUser || dbUser.role !== 'SUPER_ADMIN') {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Forbidden',
          message: 'Only platform administrators can access this resource',
        },
        { status: 403 }
      ),
    }
  }

  return { ok: true, userId: user.id }
}
