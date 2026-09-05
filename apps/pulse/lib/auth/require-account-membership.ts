import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { isSuperAdminActor } from '@/lib/auth/super-admin'
import { canUserAccessAccount } from '@/lib/auth/account-access'

export type AccountForMembership = {
  id: string
  slug: string
  name: string
  accountType: string
  email: string | null
  tier: string
  trialEndsAt: Date | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  billingJson: unknown | null
}

export type AccountMembershipResult =
  | { ok: true; userId: string; account: AccountForMembership }
  | { ok: false; response: NextResponse }

type AccountMembershipOptions = {
  allowSuperAdmin?: boolean
}

function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a?.trim().toLowerCase()
  const y = b?.trim().toLowerCase()
  return Boolean(x && y && x === y)
}

/**
 * Authenticated user must be allowed to act for the account identified by slug.
 *
 * - Member: active regular Prisma User with an AccountUserMembership row.
 * - Account contact: if there is no conflicting membership, session email matches Account.email (covers users who can use the app before a User row exists or when linking used email only).
 * - User.accountId is the default/landing account only and is never used as the complete authorization source.
 * - SUPER_ADMIN (no account membership): forbidden here so Stripe portal stays tied to the account customer, not platform admins browsing /app.
 */
export async function requireAccountMembership(
  accountSlug: string | null,
  options: AccountMembershipOptions = {},
): Promise<AccountMembershipResult> {
  const slug = accountSlug?.trim()
  if (!slug) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'account required' }, { status: 400 }),
    }
  }

  const supabase = await createClient()
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

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, isActive: true },
  })

  if (isSuperAdminActor(user, dbUser)) {
    if (options.allowSuperAdmin) {
      return { ok: true, userId: user.id, account }
    }
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    }
  }

  if (dbUser && !dbUser.isActive) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
    }
  }

  if (dbUser && await canUserAccessAccount(user.id, account.id)) {
    return { ok: true, userId: user.id, account }
  }

  if (!dbUser && emailsMatch(account.email, user.email)) {
    return { ok: true, userId: user.id, account }
  }

  return {
    ok: false,
    response: NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 }),
  }
}
