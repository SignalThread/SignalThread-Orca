import { NextRequest, NextResponse } from 'next/server'
import { AccountType, type Prisma } from '@prisma/client'
import { deleteAccountAsSuperAdmin } from '@/lib/account-deletion'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ACCOUNT_TYPES = ['RETAIL', 'EVENTS', 'HOSPITALITY'] as const
const ALLOWED_TIERS = ['starter', 'growth', 'enterprise'] as const

/**
 * DELETE /api/admin/accounts/[accountId]
 * Body: { confirmName: string } — must match account name exactly.
 * SUPER_ADMIN only. Hard-deletes account and cascaded data (see lib/account-deletion.ts).
 */
export async function DELETE(
  request: NextRequest,
  context: { params: { accountId: string } }
) {
  try {
    const auth = await requireSuperAdminForApi()
    if (!auth.ok) return auth.response

    const { accountId } = context.params
    let body: { confirmName?: string } = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Bad Request', message: 'JSON body required' },
        { status: 400 }
      )
    }

    const confirmName = typeof body.confirmName === 'string' ? body.confirmName.trim() : ''
    if (!confirmName) {
      return NextResponse.json(
        { success: false, error: 'Bad Request', message: 'confirmName is required' },
        { status: 400 }
      )
    }

    const result = await deleteAccountAsSuperAdmin(accountId, confirmName)

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.message, message: result.message },
        { status: result.status }
      )
    }

    return NextResponse.json({ success: true, message: 'Account deleted' })
  } catch (error) {
    console.error('[DELETE /api/admin/accounts/[accountId]]', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete account',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/accounts/[accountId]
 * Body: { accountType?: 'RETAIL' | 'EVENTS' | 'HOSPITALITY', tier?: 'starter' | 'growth' | 'enterprise' }
 * SUPER_ADMIN only.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: { accountId: string } }
) {
  try {
    const auth = await requireSuperAdminForApi()
    if (!auth.ok) return auth.response

    const { accountId } = context.params

    let body: { accountType?: string; tier?: string } = {}
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { success: false, error: 'Bad Request', message: 'JSON body required' },
        { status: 400 }
      )
    }

    const rawAccountType = typeof body.accountType === 'string' ? body.accountType.trim().toUpperCase() : undefined
    const rawTier = typeof body.tier === 'string' ? body.tier.trim().toLowerCase() : undefined

    if (!rawAccountType && !rawTier) {
      return NextResponse.json(
        { success: false, error: 'Bad Request', message: 'accountType or tier is required' },
        { status: 400 }
      )
    }

    if (rawAccountType && !ALLOWED_ACCOUNT_TYPES.includes(rawAccountType as (typeof ALLOWED_ACCOUNT_TYPES)[number])) {
      return NextResponse.json(
        { success: false, error: 'Bad Request', message: 'Invalid account type' },
        { status: 400 }
      )
    }

    if (rawTier && !ALLOWED_TIERS.includes(rawTier as (typeof ALLOWED_TIERS)[number])) {
      return NextResponse.json(
        { success: false, error: 'Bad Request', message: 'Invalid tier' },
        { status: 400 }
      )
    }

    const updateData: Prisma.AccountUpdateInput = {
      ...(rawAccountType ? { accountType: rawAccountType as AccountType } : {}),
      ...(rawTier ? { tier: rawTier } : {}),
    }

    const account = await prisma.account.update({
      where: { id: accountId },
      data: updateData,
      select: {
        id: true,
        accountType: true,
        tier: true,
      },
    })

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        accountType: account.accountType,
        tier: account.tier,
      },
    })
  } catch (error) {
    console.error('[PATCH /api/admin/accounts/[accountId]]', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update account',
      },
      { status: 500 }
    )
  }
}
