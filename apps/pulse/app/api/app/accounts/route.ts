import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { getAccessibleAccounts } from '@/lib/auth/account-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { role: true, accountId: true, isActive: true },
  })
  if (!dbUser || (!dbUser.isActive && dbUser.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
  }

  const accounts = await getAccessibleAccounts(user.id)
  return NextResponse.json({
    success: true,
    data: {
      role: dbUser.role,
      primaryAccountId: dbUser.accountId,
      accounts,
    },
  })
}
