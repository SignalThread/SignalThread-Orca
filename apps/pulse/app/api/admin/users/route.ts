import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdminForApi } from '@/lib/auth/require-super-admin'
import { listPlatformAccounts, listPlatformUsers } from '@/lib/platform-users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdminForApi()
    if (!auth.ok) return auth.response

    const search = request.nextUrl.searchParams.get('search')?.trim().toLowerCase() || ''
    const account = request.nextUrl.searchParams.get('account') || 'all'
    const role = request.nextUrl.searchParams.get('role') || 'all'
    const status = request.nextUrl.searchParams.get('status') || 'all'
    const [allRows, accounts] = await Promise.all([listPlatformUsers(), listPlatformAccounts()])
    const rows = allRows.filter((row) => {
      if (search && !`${row.name} ${row.email}`.toLowerCase().includes(search)) return false
      if (account !== 'all' && !row.accountIds.includes(account)) return false
      if (role !== 'all' && row.role !== role) return false
      if (status !== 'all' && row.status !== status) return false
      return true
    })
    return NextResponse.json({
      success: true,
      data: {
        rows,
        accounts,
        summary: {
          total: allRows.length,
          active: allRows.filter((row) => row.status === 'ACTIVE').length,
          invited: allRows.filter((row) => row.inviteStatus === 'PENDING').length,
          neverLoggedIn: allRows.filter((row) => row.status === 'NEVER_LOGGED_IN').length,
          deactivated: allRows.filter((row) => row.status === 'DEACTIVATED').length,
        },
      },
    })
  } catch (error) {
    console.error('[GET /api/admin/users]', error)
    return NextResponse.json({ success: false, error: 'Unable to load platform users' }, { status: 500 })
  }
}
