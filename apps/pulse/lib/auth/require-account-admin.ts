import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import type { AccountForMembership } from '@/lib/auth/require-account-membership'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'
import { isAccountAdminForAccount } from '@/lib/auth/account-admin-policy'
import { isSuperAdminActor } from '@/lib/auth/super-admin'

export type AccountAdminResult =
  | { ok: true; userId: string; account: AccountForMembership }
  | { ok: false; response: NextResponse }

/**
 * Who may manage account users (invite, deactivate, etc.):
 * - Platform super admin (`SUPER_ADMIN_EMAILS` or Prisma `User.role === SUPER_ADMIN`), for any account slug, or
 * - Same as before: account contact email, or account-scoped Prisma `ADMIN`.
 * Managers and viewers cannot manage team users (unless platform super admin).
 */
export async function requireAccountAdmin(accountSlug: string | null): Promise<AccountAdminResult> {
  const slug = accountSlug?.trim()
  if (!slug) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'account required' }, { status: 400 }),
    }
  }

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
    select: { role: true },
  })

  if (isSuperAdminActor(user, dbUser)) {
    const account = await prisma.account.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        accountType: true,
        email: true,
        tier: true,
        trialEndsAt: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        billingJson: true,
      },
    })
    if (!account) {
      return {
        ok: false,
        response: NextResponse.json({ success: false, error: 'Account not found' }, { status: 404 }),
      }
    }
    return { ok: true, userId: user.id, account }
  }

  const base = await requireAccountMembership(accountSlug)
  if (!base.ok) return base

  if (
    isAccountAdminForAccount({
      accountEmail: base.account.email,
      sessionEmail: user.email ?? null,
      dbUser,
      hasAccountAccess: true,
    })
  ) {
    return { ok: true, userId: user.id, account: base.account }
  }

  return {
    ok: false,
    response: NextResponse.json(
      {
        success: false,
        error: 'Forbidden',
        message: 'Account admin access required to manage users',
      },
      { status: 403 }
    ),
  }
}
