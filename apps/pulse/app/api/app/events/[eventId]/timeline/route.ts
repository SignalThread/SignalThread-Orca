import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireEventAccess } from '@/lib/auth/require-events-event-access'
import {
  EventDashboardFilterError,
  buildEffectiveResponseStructureWhere,
  parseEventDashboardStructureFilters,
  validateEventDashboardFilters,
} from '@/lib/event-dashboard-filters'
import { isEventsAccount } from '@/lib/account-product-mode'
import { responseCollectionPhaseWhere } from '@/lib/event-intelligence/collection-phase'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'
import { resolveLocalAdvancedDemoLifecycleOverride } from '@/lib/advanced-events-demo-lifecycle'

// Force dynamic rendering
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/app/events/[eventId]/timeline?account=<slug>
 * 
 * Returns response timeline data (last 30 days, daily buckets)
 * Falls back to weekly if sparse data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params
    
    // Get account slug from query param
    const { searchParams } = new URL(request.url)
    const accountSlug = searchParams.get('account')
    const surveyId = searchParams.get('surveyId')?.trim() || null
    const structureFilters = parseEventDashboardStructureFilters(searchParams)

    const access = await requireEventAccess(accountSlug, eventId)
    if (!access.ok) return access.response
    const { account, event } = access
    const lifecyclePhase = isEventsAccount(account.accountType)
      ? resolveLocalAdvancedDemoLifecycleOverride({
          eventId,
          accountSlug: account.slug,
          hostname: new URL(request.url).hostname,
          value: searchParams.get('devLifecycle'),
        }) ?? resolveEventLifecyclePhase({ ...event, timezone: event.location?.timezone })
      : undefined

    const validatedFilters = await validateEventDashboardFilters({
      accountId: account.id,
      accountType: account.accountType,
      eventId,
      filters: {
        surveyId,
        ...structureFilters,
      },
    })
    const structureWhere = buildEffectiveResponseStructureWhere(validatedFilters)

    // Get days parameter from query (default to 30)
    const daysParam = searchParams.get('days')
    const days = daysParam ? parseInt(daysParam) : 30

    // Get responses from specified time period
    const dateThreshold = new Date()
    dateThreshold.setDate(dateThreshold.getDate() - days)

    const responses = await prisma.response.findMany({
      where: {
        eventId,
        ...(lifecyclePhase !== undefined ? responseCollectionPhaseWhere(lifecyclePhase) : {}),
        ...(surveyId ? { surveyId } : {}),
        ...structureWhere,
        startedAt: {
          gte: dateThreshold,
        },
      },
      select: {
        startedAt: true,
      },
      orderBy: {
        startedAt: 'asc',
      },
    })

    // Group by date
    const dailyCounts = new Map<string, number>()
    const today = new Date()
    
    // Initialize all days with 0
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateKey = date.toISOString().split('T')[0]
      dailyCounts.set(dateKey, 0)
    }

    // Count responses per day
    responses.forEach(response => {
      if (response.startedAt) {
        const dateKey = response.startedAt.toISOString().split('T')[0]
        if (dailyCounts.has(dateKey)) {
          dailyCounts.set(dateKey, (dailyCounts.get(dateKey) || 0) + 1)
        }
      }
    })

    // Convert to array
    const timeline = Array.from(dailyCounts.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Check if data is sparse (< 10 responses total or < 5 days with data)
    const totalResponses = timeline.reduce((sum, d) => sum + d.count, 0)
    const daysWithData = timeline.filter(d => d.count > 0).length
    
    // If sparse, aggregate into weeks
    let finalTimeline = timeline
    if (totalResponses < 10 || daysWithData < 5) {
      const weeklyCounts = new Map<string, number>()
      
      timeline.forEach(({ date, count }) => {
        const d = new Date(date)
        // Get the Monday of the week
        const monday = new Date(d)
        monday.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
        const weekKey = monday.toISOString().split('T')[0]
        weeklyCounts.set(weekKey, (weeklyCounts.get(weekKey) || 0) + count)
      })
      
      finalTimeline = Array.from(weeklyCounts.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date))
    }

    return NextResponse.json({
      success: true,
      data: finalTimeline,
    })
  } catch (error) {
    if (error instanceof EventDashboardFilterError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error.status }
      )
    }

    console.error(`[API] /api/app/events/${params.eventId}/timeline error:`, error)
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to fetch timeline',
      },
      { status: 500 }
    )
  }
}
