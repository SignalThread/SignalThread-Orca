import { NextRequest, NextResponse } from 'next/server'
import {
  EventThemeEvidenceError,
  getEventThemeEvidence,
} from '@/lib/event-intelligence/theme-evidence'
import { requireEventsEventAccess } from '@/lib/auth/require-events-event-access'
import {
  EventDashboardFilterError,
  parseEventDashboardStructureFilters,
} from '@/lib/event-dashboard-filters'
import { resolveEventLifecyclePhase } from '@/lib/events-home-groups'
import { resolveLocalAdvancedDemoLifecycleOverride } from '@/lib/advanced-events-demo-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string; themeKey: string } },
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
    const surveyId = request.nextUrl.searchParams.get('surveyId')?.trim() || null
    const themeKeys = request.nextUrl.searchParams.get('themeKeys')
      ?.split(',')
      .map((themeKey) => themeKey.trim())
      .filter(Boolean)
      .slice(0, 20)
    const issueClusterIds = request.nextUrl.searchParams.get('issueClusterIds')
      ?.split(',')
      .map((clusterId) => clusterId.trim())
      .filter(Boolean)
      .slice(0, 20)
    const structureFilters = parseEventDashboardStructureFilters(request.nextUrl.searchParams)
    const data = await getEventThemeEvidence({
      accountSlug,
      eventId: params.eventId,
      themeKey: decodeURIComponent(params.themeKey),
      themeKeys,
      issueClusterIds,
      surveyId,
      surveyTargetId: request.nextUrl.searchParams.get('surveyTargetId')?.trim() || null,
      questionId: request.nextUrl.searchParams.get('questionId')?.trim() || null,
      speakerId: request.nextUrl.searchParams.get('speakerId')?.trim() || null,
      ...structureFilters,
      lifecyclePhase: resolveLocalAdvancedDemoLifecycleOverride({
        eventId: params.eventId,
        accountSlug: access.account.slug,
        hostname: request.nextUrl.hostname,
        value: request.nextUrl.searchParams.get('devLifecycle'),
      }) ?? resolveEventLifecyclePhase({ ...access.event, timezone: access.event.location?.timezone }),
      authorized: {
        account: { id: access.account.id, accountType: access.account.accountType },
        event: access.event,
      },
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    if (error instanceof EventThemeEvidenceError || error instanceof EventDashboardFilterError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status },
      )
    }

    console.error('[GET /api/app/events/[eventId]/themes/[themeKey]/evidence]', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch theme evidence' },
      { status: 500 },
    )
  }
}
