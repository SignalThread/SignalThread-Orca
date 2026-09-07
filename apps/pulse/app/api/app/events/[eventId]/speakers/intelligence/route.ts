import { NextRequest, NextResponse } from 'next/server'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import { EventAgendaServiceError } from '@/lib/event-agenda-service'
import { getEventSpeakerIntelligence } from '@/lib/event-speaker-intelligence'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  if (!accountSlug) {
    return NextResponse.json({ success: false, error: 'Account parameter required' }, { status: 400 })
  }

  const access = await requireEventsEventAccess(accountSlug, params.eventId)
  if (!access.ok) return access.response

  try {
    const data = await getEventSpeakerIntelligence({
      accountId: access.account.id,
      eventId: params.eventId,
      lifecyclePhase: resolveEventLifecyclePhase({ ...access.event, timezone: access.event.location?.timezone }),
    })
    return NextResponse.json({ success: true, data })
  } catch (error) {
    if (error instanceof EventAgendaServiceError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[GET /api/app/events/[eventId]/speakers/intelligence]', error)
    return NextResponse.json({ success: false, error: 'Failed to load speaker intelligence' }, { status: 500 })
  }
}
