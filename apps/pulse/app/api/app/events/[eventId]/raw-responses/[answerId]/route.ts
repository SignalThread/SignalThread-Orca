import { NextRequest, NextResponse } from 'next/server'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import { EventRawResponsesError, getEventRawResponseDetail } from '@/lib/event-raw-responses'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { eventId: string; answerId: string } }) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const access = await requireEventsEventAccess(accountSlug, params.eventId)
  if (!access.ok) return access.response

  try {
    const data = await getEventRawResponseDetail({ accountId: access.account.id, eventId: access.event.id, answerId: params.answerId })
    return NextResponse.json({ success: true, data }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof EventRawResponsesError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[GET /api/app/events/[eventId]/raw-responses/[answerId]]', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch raw response detail' }, { status: 500 })
  }
}
