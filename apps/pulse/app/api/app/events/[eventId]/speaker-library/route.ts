import { NextRequest, NextResponse } from 'next/server'
import { withDevelopmentRouteTiming } from '@/lib/development-route-timing'
import { requireAccountAdmin } from '@/lib/auth/require-account-admin'
import { EventAgendaServiceError, listEventSpeakerLibrary } from '@/lib/event-agenda-service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const admin = await requireAccountAdmin(request.nextUrl.searchParams.get('account'))
  if (!admin.ok) return admin.response

  return withDevelopmentRouteTiming(
    {
      route: '/api/app/events/[eventId]/speaker-library',
      account: request.nextUrl.searchParams.get('account'),
      eventId: params.eventId,
    },
    async () => {
      try {
        const speakers = await listEventSpeakerLibrary({
          accountId: admin.account.id,
          eventId: params.eventId,
        })
        return NextResponse.json({ success: true, data: { speakers } })
      } catch (error) {
        if (error instanceof EventAgendaServiceError) {
          return NextResponse.json({ success: false, error: error.message, code: error.code, details: error.details }, { status: error.status })
        }
        console.error('[Event speaker library API]', error)
        return NextResponse.json({ success: false, error: 'Failed to load speaker library' }, { status: 500 })
      }
    },
  )
}
