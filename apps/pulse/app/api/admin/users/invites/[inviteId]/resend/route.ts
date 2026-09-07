import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import { resendPlatformInvite } from '@/lib/platform-users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, { params }: { params: { inviteId: string } }) {
  const auth = await requireSuperAdminForApi()
  if (!auth.ok) return auth.response
  const errorId = randomUUID()
  try {
    const result = await resendPlatformInvite({ actorUserId: auth.userId, inviteId: params.inviteId })
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[POST /api/admin/users/invites/:inviteId/resend]', { errorId, inviteId: params.inviteId, error })
    return NextResponse.json({ success: false, error: 'Unable to resend invite', errorId }, { status: 500 })
  }
}
