import { NextRequest, NextResponse } from 'next/server'
import {
  EventIntelligenceAggregationError,
  getEventIntelligenceSummary,
  parseEventIntelligenceFilters,
} from '@/lib/event-intelligence/aggregation'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import { withDevelopmentRouteTiming } from '@/lib/development-route-timing'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'
import { resolveLocalAdvancedDemoLifecycleOverride } from '@/lib/advanced-events-demo-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const accountSlug = request.nextUrl.searchParams.get('account')
  if (!accountSlug) {
    return NextResponse.json(
      { success: false, error: 'Account parameter required' },
      { status: 400 },
    )
  }

  return withDevelopmentRouteTiming(
    { route: '/api/app/events/[eventId]/intelligence', account: accountSlug, eventId: params.eventId },
    async () => {
      const routeStarted = performance.now()
      const authStarted = performance.now()
      const access = await requireEventsEventAccess(accountSlug, params.eventId)
      if (!access.ok) return access.response
      const authDuration = performance.now() - authStarted

      try {
        const limitRaw = Number.parseInt(request.nextUrl.searchParams.get('limit') ?? '25', 10)
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 25
        const summaryStarted = performance.now()
        const data = await getEventIntelligenceSummary({
          accountSlug,
          eventId: params.eventId,
          filters: parseEventIntelligenceFilters(request.nextUrl.searchParams),
          ...(request.nextUrl.searchParams.get('view') === 'intelligence'
            ? { initialView: 'intelligence' as const }
            : {}),
          lifecyclePhase: resolveLocalAdvancedDemoLifecycleOverride({
            eventId: params.eventId,
            accountSlug: access.account.slug,
            hostname: request.nextUrl.hostname,
            value: request.nextUrl.searchParams.get('devLifecycle'),
          }) ?? resolveEventLifecyclePhase({
            ...access.event,
            timezone: access.event.location?.timezone,
          }),
          authorized: {
            account: { id: access.account.id, accountType: access.account.accountType },
            event: access.event,
          },
          attention: {
            limit,
            cursor: request.nextUrl.searchParams.get('cursor'),
          },
        })
        const summaryDuration = performance.now() - summaryStarted
        const serializationStarted = performance.now()
        const body = JSON.stringify({ success: true, data })
        const serializationDuration = performance.now() - serializationStarted
        const totalDuration = performance.now() - routeStarted

        return new NextResponse(body, {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'private, no-store',
            'server-timing': [
              `auth;dur=${authDuration.toFixed(1)}`,
              `summary;dur=${summaryDuration.toFixed(1)}`,
              `serialize;dur=${serializationDuration.toFixed(1)}`,
              `total;dur=${totalDuration.toFixed(1)}`,
            ].join(', '),
            'x-response-bytes': String(Buffer.byteLength(body)),
          },
        })
      } catch (error) {
        if (error instanceof EventIntelligenceAggregationError) {
          return NextResponse.json(
            { success: false, error: error.message },
            { status: error.status },
          )
        }

        console.error('[GET /api/app/events/[eventId]/intelligence]', error)
        return NextResponse.json(
          { success: false, error: 'Failed to fetch event intelligence' },
          { status: 500 },
        )
      }
    },
  )
}
