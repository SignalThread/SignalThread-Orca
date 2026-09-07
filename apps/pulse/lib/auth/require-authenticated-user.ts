import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isSuperAdminActor } from '@/lib/auth/super-admin'

export type AuthenticatedUserResult =
  | { ok: true; userId: string; email: string | null; isSuperAdmin: boolean }
  | { ok: false; response: NextResponse }

/**
 * Organizer guard for capabilities that are billable or otherwise organizer-only
 * but are not bound to one account resource (for example AI question drafting
 * inside the survey builder). The caller must hold a Supabase session AND be a
 * known, active Pulse user (or a platform super admin). A bare Supabase Auth
 * identity with no Pulse User row is not enough — signing up for Auth alone
 * must never unlock organizer features.
 */
export async function requireAuthenticatedPulseUser(): Promise<AuthenticatedUserResult> {
  const supabase = createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    }
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, isActive: true },
  })

  if (isSuperAdminActor(user, dbUser)) {
    return { ok: true, userId: user.id, email: user.email ?? null, isSuperAdmin: true }
  }

  if (!dbUser || !dbUser.isActive) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ok: true, userId: user.id, email: user.email ?? null, isSuperAdmin: false }
}
