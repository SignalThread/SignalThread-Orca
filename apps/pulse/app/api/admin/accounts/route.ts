import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import { CUSTOMER_ACCOUNT_ADMIN_ROLES } from '@/lib/platform-users'

// Force dynamic rendering - do not prerender this API route
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/accounts
 *
 * Returns list of all accounts (SUPER_ADMIN only)
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireSuperAdminForApi()
    if (!auth.ok) return auth.response

    // Explicit select omits trialEndsAt so the endpoint works when that column
    // doesn't exist yet (migration not applied). Response shape stays stable.
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        accountType: true,
        tier: true,
        isActive: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            locations: true,
            users: {
              where: {
                isActive: true,
                role: { in: CUSTOMER_ACCOUNT_ADMIN_ROLES },
              },
            },
          },
        },
      },
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' },
      ],
    })

    return NextResponse.json({
      success: true,
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        slug: account.slug,
        accountType: account.accountType ?? 'RETAIL',
        tier: (account.tier ?? 'starter').toLowerCase() === 'pro' ? 'growth' : (account.tier ?? 'starter'),
        isActive: account.isActive,
        email: account.email,
        createdAt: account.createdAt.toISOString(),
        _count: {
          locations: account._count.locations,
          admins: account._count.users,
        },
      })),
    })
  } catch (error) {
    console.error('[API] /api/admin/accounts error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch accounts',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/accounts
 *
 * Create a new account (SUPER_ADMIN only)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdminForApi()
    if (!auth.ok) return auth.response

    const body = await request.json()
    const { name, slug, accountType, tier, email, phone } = body

    if (!name || !slug) {
      return NextResponse.json(
        { success: false, error: 'Name and slug are required' },
        { status: 400 }
      )
    }

    // Check if slug already exists
    const existing = await prisma.account.findUnique({
      where: { slug },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Account slug already exists' },
        { status: 409 }
      )
    }

    const planTierRaw = (tier || 'starter').toLowerCase()
    const planTier = planTierRaw === 'pro' ? 'growth' : planTierRaw
    const finalTier = ['starter', 'growth', 'enterprise'].includes(planTier) ? planTier : 'starter'
    const trialEndsAt = finalTier === 'starter'
      ? (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d })()
      : null

    const account = await prisma.account.create({
      data: {
        name,
        slug,
        accountType: accountType || 'RETAIL',
        tier: finalTier,
        trialEndsAt,
        email,
        phone,
        isActive: true,
      },
    })

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        name: account.name,
        slug: account.slug,
        accountType: account.accountType,
      },
    })
  } catch (error) {
    console.error('[API] POST /api/admin/accounts error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create account',
      },
      { status: 500 }
    )
  }
}
