import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resendAccountInvite } from '@/lib/account-users'
import { hashTestSignupToken, isExpired } from '@/lib/test-signup-tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function findToken(rawToken: string) {
  const tokenHash = hashTestSignupToken(rawToken)
  return prisma.testSignupToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      usedAt: true,
      expiresAt: true,
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!token || !email) {
      return NextResponse.json(
        { success: false, error: 'token and email are required' },
        { status: 400 }
      )
    }

    const tokenRow = await findToken(token)
    if (!tokenRow) {
      return NextResponse.json({ success: false, error: 'Invalid or unknown signup link' }, { status: 404 })
    }
    if (isExpired(tokenRow.expiresAt)) {
      return NextResponse.json({ success: false, error: 'This signup link has expired' }, { status: 410 })
    }

    const pending = await prisma.pendingProvision.findUnique({
      where: { email },
      select: { accountId: true, usedAt: true },
    })

    if (!pending || pending.usedAt) {
      return NextResponse.json(
        { success: false, error: 'No pending invite found for this email' },
        { status: 404 }
      )
    }

    const result = await resendAccountInvite({
      accountId: pending.accountId,
      email,
    })

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.code, message: result.message },
        { status: result.status }
      )
    }

    return NextResponse.json({ success: true, message: 'Verification code sent' })
  } catch (error) {
    console.error('[POST /api/signup/test/resend] Error:', error)
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
