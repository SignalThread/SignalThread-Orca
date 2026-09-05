import { NextRequest, NextResponse } from 'next/server'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import { EventRawResponsesError, listEventRawResponses } from '@/lib/event-raw-responses'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'
import { resolveLocalAdvancedDemoLifecycleOverride } from '@/lib/advanced-events-demo-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  const access = await requireEventsEventAccess(accountSlug, params.eventId)
  if (!access.ok) return access.response

  try {
    const data = await listEventRawResponses({
      accountId: access.account.id,
      eventId: access.event.id,
      lifecyclePhase: resolveLocalAdvancedDemoLifecycleOverride({
        eventId: params.eventId,
        accountSlug: access.account.slug,
        hostname: request.nextUrl.hostname,
        value: request.nextUrl.searchParams.get('devLifecycle'),
      }) ?? resolveEventLifecyclePhase({ ...access.event, timezone: access.event.location?.timezone }),
      surveyId: request.nextUrl.searchParams.get('surveyId'),
      search: request.nextUrl.searchParams.get('search'),
      surveyTargetId: request.nextUrl.searchParams.get('surveyTargetId'),
      eventStructureItemId: request.nextUrl.searchParams.get('eventStructureItemId'),
      structureKind: request.nextUrl.searchParams.get('structureKind'),
      questionId: request.nextUrl.searchParams.get('questionId'),
      sentiment: request.nextUrl.searchParams.get('sentiment'),
      dateFrom: request.nextUrl.searchParams.get('dateFrom'),
      dateTo: request.nextUrl.searchParams.get('dateTo'),
      page: Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10),
      pageSize: Number.parseInt(request.nextUrl.searchParams.get('pageSize') ?? '25', 10),
    })
    return NextResponse.json({ success: true, data }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof EventRawResponsesError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status })
    }
    console.error('[GET /api/app/events/[eventId]/raw-responses]', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch raw responses' }, { status: 500 })
  }
}
