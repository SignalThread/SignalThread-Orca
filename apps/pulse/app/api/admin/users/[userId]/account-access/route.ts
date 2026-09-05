import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import {
  addPlatformAdminAccountAccess,
  getPlatformAdminAccountAccess,
  removePlatformAdminAccountAccess,
  setPlatformAdminPrimaryAccount,
} from '@/lib/account-memberships'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const accountSchema = z.object({ accountId: z.string().min(1) }).strict()
const removeSchema = z.object({
  accountId: z.string().min(1),
  replacementPrimaryAccountId: z.string().min(1).optional(),
}).strict()

function resultResponse(result: { ok: boolean; status?: number; message?: string }) {
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.message || 'Unable to update account access' },
      { status: result.status || 400 },
    )
  }
  return NextResponse.json({ success: true })
}

export async function GET(_: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireSuperAdminForApi()
  if (!auth.ok) return auth.response

  const result = await getPlatformAdminAccountAccess(params.userId)
  if (!result.ok) return resultResponse(result)
  return NextResponse.json({ success: true, data: result })
}

export async function POST(request: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireSuperAdminForApi()
  if (!auth.ok) return auth.response
  const parsed = accountSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Valid account required' }, { status: 400 })
  return resultResponse(await addPlatformAdminAccountAccess(params.userId, parsed.data.accountId))
}

export async function PATCH(request: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireSuperAdminForApi()
  if (!auth.ok) return auth.response
  const parsed = accountSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Valid primary account required' }, { status: 400 })
  return resultResponse(await setPlatformAdminPrimaryAccount(params.userId, parsed.data.accountId))
}

export async function DELETE(request: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireSuperAdminForApi()
  if (!auth.ok) return auth.response
  const parsed = removeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ success: false, error: 'Valid account required' }, { status: 400 })
  return resultResponse(await removePlatformAdminAccountAccess({ userId: params.userId, ...parsed.data }))
}
