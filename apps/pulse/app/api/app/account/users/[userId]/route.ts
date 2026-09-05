import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  removeRetailAccountUserAccess,
  requireRetailAccountUserManager,
  setAccountUserRole,
} from '@/lib/account-users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.union([
  z.object({ isActive: z.literal(false) }).strict(),
  z.object({ role: z.enum(['ADMIN', 'MANAGER', 'VIEWER']) }).strict(),
])

export async function PATCH(
  request: NextRequest,
  context: { params: { userId: string } }
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const auth = await requireRetailAccountUserManager(accountSlug)
  if (!auth.ok) return auth.response

  const { userId } = context.params
  if (!userId) {
    return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
  }

  const result = 'role' in parsed.data
    ? await setAccountUserRole({
      accountId: auth.account.id,
      actorUserId: auth.userId,
      targetUserId: userId,
      role: parsed.data.role,
    })
    : await removeRetailAccountUserAccess({
      accountId: auth.account.id,
      actorUserId: auth.userId,
      targetUserId: userId,
    })

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.code, message: result.message },
      { status: result.status }
    )
  }

  return NextResponse.json({
    success: true,
    message: 'role' in parsed.data ? 'Role updated' : 'Access removed',
  })
}
