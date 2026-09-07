import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import { generatePlatformUserOtp } from '@/lib/platform-users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: { userId: string } }) {
  const auth = await requireSuperAdminForApi()
  if (!auth.ok) return auth.response
  const errorId = randomUUID()
  try {
    const result = await generatePlatformUserOtp({ actorUserId: auth.userId, targetUserId: params.userId })
    if (!result.ok) return NextResponse.json({ success: false, error: result.message, errorId }, { status: result.status })
    return NextResponse.json({ success: true, data: { otp: result.otp, email: result.email } })
  } catch (error) {
    // Credential values are intentionally excluded from logs.
    console.error('[POST /api/admin/users/:userId/otp]', { errorId, userId: params.userId, error })
    return NextResponse.json({ success: false, error: 'Unable to generate OTP', errorId }, { status: 500 })
  }
}
