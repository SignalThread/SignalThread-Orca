import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { provisionRetail } from '@/lib/provisioning'
import { hashTestSignupToken, isExpired } from '@/lib/test-signup-tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function findValidToken(rawToken: string) {
  const tokenHash = hashTestSignupToken(rawToken)
  const row = await prisma.testSignupToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
    },
  })

  if (!row) return { ok: false as const, status: 404, error: 'Invalid or unknown signup link' }
  if (row.usedAt) return { ok: false as const, status: 410, error: 'This signup link has already been used' }
  if (isExpired(row.expiresAt)) return { ok: false as const, status: 410, error: 'This signup link has expired' }

  return { ok: true as const, tokenId: row.id }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')?.trim()
    if (!token) {
      return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 })
    }

    const result = await findValidToken(token)
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[GET /api/signup/test] Error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to validate signup link' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
    const locationName = typeof body.locationName === 'string' ? body.locationName.trim() : ''
    const plan = typeof body.plan === 'string' ? body.plan.trim().toLowerCase() : ''

    if (!token) {
      return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 })
    }
    if (!email || !businessName || !locationName) {
      return NextResponse.json(
        { success: false, error: 'email, businessName, and locationName are required' },
        { status: 400 }
      )
    }
    if (plan !== 'starter' && plan !== 'growth') {
      return NextResponse.json(
        { success: false, error: 'plan must be "starter" or "growth"' },
        { status: 400 }
      )
    }

    const tokenResult = await findValidToken(token)
    if (!tokenResult.ok) {
      return NextResponse.json({ success: false, error: tokenResult.error }, { status: tokenResult.status })
    }

    const result = await provisionRetail({
      accountName: businessName,
      accountSlug: slugFromName(businessName),
      accountEmail: email,
      ownerEmail: email,
      locationName,
      plan,
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 400 })
    }

    await prisma.testSignupToken.update({
      where: { id: tokenResult.tokenId },
      data: { usedAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      redirectUrl: `/signup/test/success?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`,
      message: 'Account created. Continue to login.',
    })
  } catch (error) {
    console.error('[POST /api/signup/test] Error:', error)
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
