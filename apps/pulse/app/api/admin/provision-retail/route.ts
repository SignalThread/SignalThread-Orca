import { NextRequest, NextResponse } from 'next/server'
import { provisionRetail } from '@/lib/provisioning'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * POST /api/admin/provision-retail
 * 
 * Platform Admin only - Provision a new retail account
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdminForApi()
    if (!auth.ok) return auth.response

    // Parse request body
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
    const locationTeamName = typeof body.locationName === 'string' ? body.locationName.trim() : ''

    const accountName = businessName || (typeof body.accountName === 'string' ? body.accountName.trim() : '')
    const accountSlug =
      (typeof body.accountSlug === 'string' && body.accountSlug.trim()) ||
      (accountName ? slugFromName(accountName) : '')
    const accountEmail =
      email || (typeof body.accountEmail === 'string' ? body.accountEmail.trim() : '')
    const ownerEmail =
      email || (typeof body.ownerEmail === 'string' ? body.ownerEmail.trim() : '')
    const plan = typeof body.plan === 'string' ? body.plan.trim().toLowerCase() : 'starter'
    const locationName =
      locationTeamName || (typeof body.locationName === 'string' ? body.locationName.trim() : '')
    const locationAddress = typeof body.locationAddress === 'string' ? body.locationAddress.trim() : undefined
    const googleReviewUrl =
      typeof body.googleReviewUrl === 'string' && body.googleReviewUrl.trim()
        ? body.googleReviewUrl.trim()
        : null

    // Provision retail account
    const result = await provisionRetail({
      accountName,
      accountSlug,
      accountEmail,
      plan: plan || 'starter',
      locationName,
      locationAddress,
      googleReviewUrl,
      ownerEmail,
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result, { status: 200 })

  } catch (error) {
    console.error('[POST /api/admin/provision-retail] Error:', error)
    
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    )
  }
}
