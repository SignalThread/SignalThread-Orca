import { NextRequest, NextResponse } from 'next/server'
import { provisionRetail } from '@/lib/provisioning'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/provision/start
 * 
 * Public endpoint - Start retail onboarding
 * Later will be triggered by Stripe, but for now it's a simple public endpoint
 */
/** Generate URL-safe slug from business name (server-side source of truth) */
function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      accountName,
      accountSlug: providedSlug,
      accountEmail,
      locationName: providedLocationName,
      locationAddress,
      googleReviewUrl,
      ownerEmail,
      plan,
    } = body

    if (!accountName?.trim() || !ownerEmail?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields', message: 'Business name and email are required' },
        { status: 400 }
      )
    }

    const accountSlug = providedSlug?.trim() || slugFromName(accountName)
    const locationName = providedLocationName?.trim() || accountName.trim()

    const result = await provisionRetail({
      accountName: accountName.trim(),
      accountSlug,
      accountEmail: accountEmail || ownerEmail,
      plan,
      locationName,
      locationAddress: locationAddress || undefined,
      googleReviewUrl: googleReviewUrl || null,
      ownerEmail: ownerEmail.trim(),
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result, { status: 200 })

  } catch (error) {
    console.error('[POST /api/provision/start] Error:', error)
    
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
