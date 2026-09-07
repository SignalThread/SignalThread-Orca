import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import { resendAccountInvite } from '@/lib/account-users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email(),
})

export async function POST(request: NextRequest) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const auth = await requireAccountAdmin(accountSlug)
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid email' }, { status: 400 })
  }

  const result = await resendAccountInvite({
    accountId: auth.account.id,
    email: parsed.data.email,
  })

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.code, message: result.message },
      { status: result.status }
    )
  }

  return NextResponse.json({ success: true, message: 'Invite resent' })
}
