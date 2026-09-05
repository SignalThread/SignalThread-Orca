import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import { updatePlatformAccountUser } from '@/lib/platform-users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const mutationSchema = z.union([
  z.object({ role: z.enum(['ADMIN', 'MANAGER', 'VIEWER']) }).strict(),
  z.object({ isActive: z.boolean() }).strict(),
])

export async function PATCH(request: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireSuperAdminForApi()
  if (!auth.ok) return auth.response
  const errorId = randomUUID()
  try {
    const parsed = mutationSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid user update' }, { status: 400 })
    const result = await updatePlatformAccountUser({ actorUserId: auth.userId, targetUserId: params.userId, ...parsed.data })
    if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: result.status })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/admin/users/:userId]', { errorId, userId: params.userId, error })
    return NextResponse.json({ success: false, error: 'Unable to update user', errorId }, { status: 500 })
  }
}
