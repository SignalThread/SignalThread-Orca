import { NextRequest, NextResponse } from 'next/server'
import {
  EventEvidenceDetailError,
  getEventEvidenceDetail,
} from '@/lib/event-intelligence/evidence-detail'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'
import { resolveLocalAdvancedDemoLifecycleOverride } from '@/lib/advanced-events-demo-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string; evidenceId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  if (!accountSlug) {
    return NextResponse.json(
      { success: false, error: 'Account parameter required' },
      { status: 400 },
    )
  }


  const access = await requireEventsEventAccess(accountSlug, params.eventId)
  if (!access.ok) return access.response

  try {
    const data = await getEventEvidenceDetail({
      accountSlug,
      eventId: params.eventId,
      evidenceId: params.evidenceId,
      lifecyclePhase: resolveLocalAdvancedDemoLifecycleOverride({
        eventId: params.eventId,
        accountSlug: access.account.slug,
        hostname: request.nextUrl.hostname,
        value: request.nextUrl.searchParams.get('devLifecycle'),
      }) ?? resolveEventLifecyclePhase({ ...access.event, timezone: access.event.location?.timezone }),
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    if (error instanceof EventEvidenceDetailError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    console.error('[GET /api/app/events/[eventId]/evidence/[evidenceId]]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch evidence detail' },
      { status: 500 },
    )
  }
}
