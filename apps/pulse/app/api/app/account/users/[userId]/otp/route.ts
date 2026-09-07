import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { generateAccountUserOtp, requireRetailAccountUserManager } from '@/lib/account-users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  context: { params: { userId: string } },
) {
  try {
    const accountSlug = request.nextUrl.searchParams.get('account')
    const auth = await requireRetailAccountUserManager(accountSlug)
    if (!auth.ok) return auth.response

    const result = await generateAccountUserOtp({
      accountId: auth.account.id,
      targetUserId: context.params.userId,
    })
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.code, message: result.message },
        { status: result.status },
      )
    }

    // The code is intentionally returned only to this authorized caller and
    // is never persisted or logged by this route.
    return NextResponse.json({ success: true, data: { otp: result.otp, email: result.email } })
  } catch (error) {
    const errorId = randomUUID()
    // Credential values are intentionally excluded from logs.
    console.error('[POST /api/app/account/users/:userId/otp]', { errorId, userId: context.params.userId, error })
    return NextResponse.json({ success: false, error: 'Unable to generate login OTP', errorId }, { status: 500 })
  }
}
