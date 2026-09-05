import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import {
  generateTestSignupToken,
  getTestSignupTokenExpiry,
  hashTestSignupToken,
} from '@/lib/test-signup-tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSuperAdminForApi()
    if (!auth.ok) return auth.response

    const rawToken = generateTestSignupToken()
    const tokenHash = hashTestSignupToken(rawToken)
    const expiresAt = getTestSignupTokenExpiry()

    await prisma.testSignupToken.create({
      data: {
        tokenHash,
        createdByUserId: auth.userId,
        expiresAt,
      },
    })

    const url = new URL('/signup/test', request.url)
    url.searchParams.set('token', rawToken)

    return NextResponse.json({
      success: true,
      url: url.toString(),
      expiresAt: expiresAt.toISOString(),
    })
  } catch (error) {
    console.error('[POST /api/admin/provision-test-link] Error:', error)
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
