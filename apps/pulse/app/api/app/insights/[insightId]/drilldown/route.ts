import { NextRequest, NextResponse } from 'next/server'
import { requireAccountMembership } from '@/lib/auth/require-account-membership'
import { getInsightDrilldownForAccount } from '@/lib/insights/drilldown'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/app/insights/[insightId]/drilldown?account=<slug>&sentiment=&questionKey=&dateFrom=&dateTo=&textContains=&page=&pageSize=
 * Optional: textContains or driver — case-insensitive substring on transcript text (full linked set, server-filtered).
 *
 * Organizer-authenticated: drill-downs return attendee transcript text, so the
 * caller must be a member of the account (platform super admins included).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { insightId: string } }
) {
  try {
    const { insightId } = params
    const { searchParams } = new URL(request.url)
    const accountSlug = searchParams.get('account')

    if (!accountSlug) {
      return NextResponse.json(
        { success: false, message: 'No account specified' },
        { status: 400 }
      )
    }

    const membership = await requireAccountMembership(accountSlug, { allowSuperAdmin: true })
    if (!membership.ok) return membership.response
    const account = membership.account

    const sentiment = searchParams.get('sentiment') as
      | 'positive'
      | 'negative'
      | 'neutral'
      | 'all'
      | null
    const questionKey = searchParams.get('questionKey') ?? undefined
    const dateFrom = searchParams.get('dateFrom') ?? undefined
    const dateTo = searchParams.get('dateTo') ?? undefined
    const textContains =
      searchParams.get('textContains') ?? searchParams.get('driver') ?? undefined
    const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined
    const pageSize = searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!, 10) : undefined

    const payload = await getInsightDrilldownForAccount(insightId, account.id, {
      sentiment: sentiment ?? 'all',
      questionKey,
      dateFrom,
      dateTo,
      textContains,
      page,
      pageSize,
    })

    if (!payload) {
      return NextResponse.json(
        { success: false, message: 'Insight not found or access denied' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, data: payload })
  } catch (error) {
    console.error('[Insight drilldown API]', error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load drill-down',
      },
      { status: 500 }
    )
  }
}
