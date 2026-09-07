import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireEventAccess } from '@/lib/auth/require-events-event-access'
import {
  computeLifetimeKeyInsightsPayload,
  computeSignalsWithData,
  fetchEventDataLifetime,
} from '@/lib/analytics/signals'
import {
  EventDashboardFilterError,
  parseEventDashboardStructureFilters,
  validateEventDashboardFilters,
} from '@/lib/event-dashboard-filters'
import { isEventsAccount } from '@/lib/account-product-mode'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'
import { resolveLocalAdvancedDemoLifecycleOverride } from '@/lib/advanced-events-demo-lifecycle'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/app/events/[eventId]/signals?windowDays=30&account=<slug>
 * 
 * Returns computed analytics signals for an event
 * Implements: Pulse, Momentum, Top Friction, Biggest Opportunity
 * Per docs/ANALYTICS_SIGNALS_SPEC.md
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params
    const { searchParams } = new URL(request.url)
    const accountSlug = searchParams.get('account')
    const windowDaysParam = searchParams.get('windowDays')
    const windowDays = windowDaysParam ? parseInt(windowDaysParam, 10) : 30
    const surveyId = searchParams.get('surveyId')?.trim() || null
    const structureFilters = parseEventDashboardStructureFilters(searchParams)

    // Validate windowDays
    if (isNaN(windowDays) || windowDays < 1 || windowDays > 365) {
      return NextResponse.json(
        { success: false, message: 'windowDays must be between 1 and 365' },
        { status: 400 }
      )
    }

    const access = await requireEventAccess(accountSlug, eventId)
    if (!access.ok) return access.response
    const { account } = access
    const lifecyclePhase = isEventsAccount(account.accountType)
      ? resolveLocalAdvancedDemoLifecycleOverride({
          eventId,
          accountSlug: account.slug,
          hostname: new URL(request.url).hostname,
          value: searchParams.get('devLifecycle'),
        }) ?? resolveEventLifecyclePhase({ ...access.event, timezone: access.event.location?.timezone })
      : undefined

    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    })

    if (!event) {
      return NextResponse.json(
        { success: false, message: 'Event not found' },
        { status: 404 }
      )
    }

    const validatedFilters = await validateEventDashboardFilters({
      accountId: account.id,
      accountType: account.accountType,
      eventId,
      filters: {
        surveyId,
        ...structureFilters,
      },
    })
    const hasStructureFilter = Boolean(validatedFilters.eventStructureItemId || validatedFilters.structureKind)

    // Compute the read model only. Any persisted Insight maintenance belongs
    // in an explicit write/recompute workflow; a dashboard GET stays read-only.
    console.log(`[Signals API] Computing signals for event ${eventId}, windowDays=${windowDays}, surveyId=${surveyId ?? 'all'}, eventStructureItemId=${validatedFilters.eventStructureItemId ?? 'all'}, structureKind=${validatedFilters.structureKind ?? 'all'}`)
    const { signals } = await computeSignalsWithData({
      eventId,
      windowDays,
      surveyId,
      eventStructureItemId: validatedFilters.eventStructureItemId,
      structureKind: validatedFilters.structureKind,
      lifecyclePhase,
    })

    const now = new Date()
    const lifetimeData = await fetchEventDataLifetime(eventId, surveyId, {
      eventStructureItemId: validatedFilters.eventStructureItemId,
      structureKind: validatedFilters.structureKind,
    }, lifecyclePhase)
    const keyInsights = computeLifetimeKeyInsightsPayload(lifetimeData, now)
    let insightKeyByThemeKey: Record<string, string> = {}
    if (!surveyId && !hasStructureFilter) {
      const persistedInsights = await prisma.insight.findMany({
        where: { eventId },
        select: { id: true, themeKey: true },
      })
      insightKeyByThemeKey = Object.fromEntries(
        persistedInsights.map((insight) => [insight.themeKey, insight.id]),
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        eventId: event.id,
        eventName: event.name,
        surveyId,
        eventStructureItemId: validatedFilters.eventStructureItemId,
        structureKind: validatedFilters.structureKind,
        windowDays,
        signals,
        keyInsights,
        insightKeyByThemeKey,
      },
    })
  } catch (error) {
    if (error instanceof EventDashboardFilterError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      )
    }

    console.error(`[Signals API] Error:`, error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to compute signals',
      },
      { status: 500 }
    )
  }
}
